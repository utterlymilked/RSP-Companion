import { PROSPECT_POSITIONS, type RecordSource } from "@rsc/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { contacts } from "../people/schema.js";
import { athleteAttributes, athleteClubs, athleteContactLinks, athletes } from "./schema.js";

/**
 * The current facts of an athlete (ADR 0024): attributes, the open club, the open contacts and
 * the person link, in the flat shape scouting has always returned.
 */
export interface AthleteFacts {
  fullName: string;
  nickname: string | null;
  birthDate: string | null;
  birthYear: number | null;
  heightCm: number | null;
  dominantFoot: string | null;
  nationality: string | null;
  birthplace: string | null;
  socialUrl: string | null;
  mediaUrl: string | null;
  nif: string | null;
  /** Positions from the club's list (PROSPECT_POSITIONS). */
  positions: string[];
  /** A free-text position a scout typed that is not on the list. */
  position: string | null;
  currentClub: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  ownPhone: string | null;
  ownEmail: string | null;
  personId: string | null;
}

export type FactsPatch = Partial<Omit<AthleteFacts, "birthYear" | "position">> & {
  birthYear?: number | null;
  position?: string | null;
};

const NAME_CHARS = /[^\p{L}\p{N} .'’-]/gu;

/** A name or nickname as the athlete rule allows it: odd characters removed, 2 to 160 long. */
export function cleanName(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(NAME_CHARS, "").replace(/\s+/g, " ").trim().slice(0, 160);
  return v.length >= 2 && !/^[ .'’-]*$/.test(v) ? v : null;
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

const closeNow = () => ({ validTo: new Date() });

interface AttrValue {
  text?: string | null;
  num?: number | null;
  date?: string | null;
  precision?: "year" | "day" | null;
}

/** Sets the current value of a single-valued attribute; null/absent closes it. */
async function setAttr(db: Db, athleteId: string, type: string, v: AttrValue) {
  const [cur] = await db
    .select()
    .from(athleteAttributes)
    .where(
      and(
        eq(athleteAttributes.athleteId, athleteId),
        eq(athleteAttributes.type, type as never),
        isNull(athleteAttributes.validTo),
      ),
    );
  const text = v.text ?? null;
  const num = v.num ?? null;
  const date = v.date ?? null;
  const precision = date ? (v.precision ?? "day") : null;
  const empty = text === null && num === null && date === null;
  if (cur && !empty) {
    if (
      cur.valueText === text &&
      cur.valueNum === num &&
      cur.valueDate === date &&
      cur.precision === precision
    ) {
      return;
    }
  }
  if (cur)
    await db.update(athleteAttributes).set(closeNow()).where(eq(athleteAttributes.id, cur.id));
  if (empty) return;
  await db.insert(athleteAttributes).values({
    athleteId,
    type: type as never,
    valueText: text,
    valueNum: num,
    valueDate: date,
    precision,
    source: "observed",
  });
}

async function setPositions(db: Db, athleteId: string, wanted: string[]) {
  const set = [...new Set(wanted.map((p) => p.trim()).filter(Boolean))];
  const current = await db
    .select()
    .from(athleteAttributes)
    .where(
      and(
        eq(athleteAttributes.athleteId, athleteId),
        eq(athleteAttributes.type, "position"),
        isNull(athleteAttributes.validTo),
      ),
    );
  const stale = current.filter((r) => !set.includes(r.valueText ?? ""));
  if (stale.length) {
    await db
      .update(athleteAttributes)
      .set(closeNow())
      .where(
        inArray(
          athleteAttributes.id,
          stale.map((r) => r.id),
        ),
      );
  }
  const have = new Set(current.map((r) => r.valueText));
  const add = set.filter((p) => !have.has(p));
  if (add.length) {
    await db.insert(athleteAttributes).values(
      add.map((p) => ({
        athleteId,
        type: "position" as const,
        valueText: p,
        source: "observed" as const,
      })),
    );
  }
}

async function setCurrentClub(db: Db, athleteId: string, name: string | null) {
  const open = await db
    .select()
    .from(athleteClubs)
    .where(and(eq(athleteClubs.athleteId, athleteId), isNull(athleteClubs.toDate)));
  if (name && open.some((c) => c.clubName === name)) return;
  const today = new Date().toISOString().slice(0, 10);
  if (open.length) {
    await db
      .update(athleteClubs)
      .set({ toDate: today })
      .where(
        inArray(
          athleteClubs.id,
          open.map((c) => c.id),
        ),
      );
  }
  if (name) await db.insert(athleteClubs).values({ athleteId, clubName: name });
}

async function setContact(
  db: Db,
  athleteId: string,
  kind: "email" | "phone",
  label: "own" | "guardian",
  value: string | null,
) {
  const open = await db
    .select({ linkId: athleteContactLinks.id, value: contacts.value })
    .from(athleteContactLinks)
    .innerJoin(contacts, eq(contacts.id, athleteContactLinks.contactId))
    .where(
      and(
        eq(athleteContactLinks.athleteId, athleteId),
        eq(athleteContactLinks.label, label),
        eq(contacts.kind, kind),
        isNull(athleteContactLinks.validTo),
      ),
    );
  if (value && open.some((c) => c.value === value)) return;
  if (open.length) {
    await db
      .update(athleteContactLinks)
      .set(closeNow())
      .where(
        inArray(
          athleteContactLinks.id,
          open.map((c) => c.linkId),
        ),
      );
  }
  if (!value) return;
  const [contact] = await db
    .insert(contacts)
    .values({ kind, value, source: "manual" })
    .returning({ id: contacts.id });
  if (!contact) throw new Error("Insert returned no row");
  await db
    .insert(athleteContactLinks)
    .values({ athleteId, contactId: contact.id, label, isPrimary: true });
}

/** Creates the athlete row; the id is the caller's (a prospect's own id). */
export async function createAthlete(
  db: Db,
  input: { id: string; source: RecordSource; retainUntil: string | null; createdBy: string | null },
) {
  await db.insert(athletes).values({
    id: input.id,
    displayName: `Atleta ${input.id.slice(0, 8)}`,
    source: input.source,
    retainUntil: input.retainUntil,
    createdBy: input.createdBy,
  });
}

/**
 * Writes the facts in `patch` (absent keys stay as they are, null clears) as attributes with
 * history, the current club and contacts, and keeps `displayName` on the best name.
 */
export async function saveFacts(db: Db, athleteId: string, patch: FactsPatch) {
  const touched = (k: keyof FactsPatch) => patch[k] !== undefined;
  if (touched("fullName") || touched("nickname")) {
    if (touched("fullName"))
      await setAttr(db, athleteId, "name", { text: cleanName(patch.fullName) });
    if (touched("nickname"))
      await setAttr(db, athleteId, "nickname", { text: cleanName(patch.nickname) });
    const current = await currentAttrs(db, [athleteId]);
    const facts = current.get(athleteId);
    const display = cleanName(facts?.name) ?? cleanName(facts?.nickname);
    if (display)
      await db.update(athletes).set({ displayName: display }).where(eq(athletes.id, athleteId));
  }
  if (touched("birthDate") || touched("birthYear")) {
    if (patch.birthDate) {
      await setAttr(db, athleteId, "date_of_birth", { date: patch.birthDate, precision: "day" });
    } else if (patch.birthYear) {
      await setAttr(db, athleteId, "date_of_birth", {
        date: `${patch.birthYear}-01-01`,
        precision: "year",
      });
    } else if (patch.birthDate === null || patch.birthYear === null) {
      await setAttr(db, athleteId, "date_of_birth", {});
    }
  }
  if (touched("heightCm")) await setAttr(db, athleteId, "height_cm", { num: patch.heightCm });
  const text: [keyof FactsPatch, string][] = [
    ["dominantFoot", "dominant_foot"],
    ["nationality", "nationality"],
    ["birthplace", "birthplace"],
    ["socialUrl", "social_url"],
    ["mediaUrl", "media_url"],
    ["nif", "nif"],
  ];
  for (const [key, type] of text) {
    if (touched(key))
      await setAttr(db, athleteId, type, { text: clean(patch[key] as string | null) });
  }
  if (touched("positions") || touched("position")) {
    const current = await currentAttrs(db, [athleteId]);
    const have = current.get(athleteId)?.positions ?? [];
    const listed =
      patch.positions ?? have.filter((p) => (PROSPECT_POSITIONS as readonly string[]).includes(p));
    const free = touched("position")
      ? clean(patch.position)
      : (have.find((p) => !(PROSPECT_POSITIONS as readonly string[]).includes(p)) ?? null);
    await setPositions(db, athleteId, free ? [...listed, free] : listed);
  }
  if (touched("currentClub")) await setCurrentClub(db, athleteId, clean(patch.currentClub));
  if (touched("guardianPhone"))
    await setContact(db, athleteId, "phone", "guardian", clean(patch.guardianPhone));
  if (touched("guardianEmail"))
    await setContact(db, athleteId, "email", "guardian", clean(patch.guardianEmail));
  if (touched("ownPhone")) await setContact(db, athleteId, "phone", "own", clean(patch.ownPhone));
  if (touched("ownEmail")) await setContact(db, athleteId, "email", "own", clean(patch.ownEmail));
  if (touched("personId")) {
    await db
      .update(athletes)
      .set({ personId: patch.personId ?? null })
      .where(eq(athletes.id, athleteId));
  }
}

interface CurrentAttrs {
  name?: string;
  nickname?: string;
  positions: string[];
}

async function currentAttrs(db: Db, ids: string[]) {
  const rows = await db
    .select()
    .from(athleteAttributes)
    .where(and(inArray(athleteAttributes.athleteId, ids), isNull(athleteAttributes.validTo)));
  const out = new Map<string, CurrentAttrs>();
  for (const r of rows) {
    const e = out.get(r.athleteId) ?? { positions: [] };
    if (r.type === "name" && r.valueText) e.name = r.valueText;
    if (r.type === "nickname" && r.valueText) e.nickname = r.valueText;
    if (r.type === "position" && r.valueText) e.positions.push(r.valueText);
    out.set(r.athleteId, e);
  }
  return out;
}

/** The current facts of several athletes, keyed by athlete id. */
export async function loadFacts(db: Db, ids: string[]): Promise<Map<string, AthleteFacts>> {
  const result = new Map<string, AthleteFacts>();
  if (ids.length === 0) return result;
  const [people, attrs, clubs, links] = await Promise.all([
    db.select().from(athletes).where(inArray(athletes.id, ids)),
    db
      .select()
      .from(athleteAttributes)
      .where(and(inArray(athleteAttributes.athleteId, ids), isNull(athleteAttributes.validTo))),
    db
      .select()
      .from(athleteClubs)
      .where(and(inArray(athleteClubs.athleteId, ids), isNull(athleteClubs.toDate))),
    db
      .select({
        athleteId: athleteContactLinks.athleteId,
        label: athleteContactLinks.label,
        kind: contacts.kind,
        value: contacts.value,
      })
      .from(athleteContactLinks)
      .innerJoin(contacts, eq(contacts.id, athleteContactLinks.contactId))
      .where(and(inArray(athleteContactLinks.athleteId, ids), isNull(athleteContactLinks.validTo))),
  ]);
  for (const a of people) {
    const mine = attrs.filter((r) => r.athleteId === a.id);
    const text = (type: string) => mine.find((r) => r.type === type)?.valueText ?? null;
    const dob = mine.find((r) => r.type === "date_of_birth");
    const all = mine.filter((r) => r.type === "position").map((r) => r.valueText ?? "");
    const listed = PROSPECT_POSITIONS as readonly string[];
    const contact = (label: string, kind: string) =>
      links.find((l) => l.athleteId === a.id && l.label === label && l.kind === kind)?.value ??
      null;
    result.set(a.id, {
      fullName: text("name") ?? a.displayName,
      nickname: text("nickname"),
      birthDate: dob?.precision === "day" ? (dob.valueDate ?? null) : null,
      birthYear: dob?.valueDate ? Number(dob.valueDate.slice(0, 4)) : null,
      heightCm: mine.find((r) => r.type === "height_cm")?.valueNum ?? null,
      dominantFoot: text("dominant_foot"),
      nationality: text("nationality"),
      birthplace: text("birthplace"),
      socialUrl: text("social_url"),
      mediaUrl: text("media_url"),
      nif: text("nif"),
      positions: all.filter((p) => listed.includes(p)),
      position: all.find((p) => !listed.includes(p)) ?? null,
      currentClub: clubs.find((c) => c.athleteId === a.id)?.clubName ?? null,
      guardianPhone: contact("guardian", "phone"),
      guardianEmail: contact("guardian", "email"),
      ownPhone: contact("own", "phone"),
      ownEmail: contact("own", "email"),
      personId: a.personId,
    });
  }
  return result;
}
