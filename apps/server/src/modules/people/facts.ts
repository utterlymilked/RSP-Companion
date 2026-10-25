import type { IdentityType } from "@rsc/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { contacts, personContactLinks, personIdentities } from "./schema.js";

/**
 * A person's NIF, federation licence, email and phone (personal tier) live in
 * `person_identities` and `contacts` (ADR 0024); the `persons` columns they came from are gone.
 * This module is the only place that reads and writes them in the old, flat shape.
 */
export interface PersonalFacts {
  email: string | null;
  phone: string | null;
  nif: string | null;
  federationId: string | null;
}

/** What uniqueness and lookup use: letters and digits only, upper case. */
export const normaliseIdentity = (value: string) =>
  value.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();

const NIF: IdentityType = "nif";
const FEDERATION: IdentityType = "fpf_licence";

const empty = (): PersonalFacts => ({ email: null, phone: null, nif: null, federationId: null });

/** The current personal facts of several people, one query per table. */
export async function loadPersonalFacts(
  db: Db,
  personIds: string[],
): Promise<Map<string, PersonalFacts>> {
  const out = new Map(personIds.map((id) => [id, empty()]));
  if (personIds.length === 0) return out;
  const identities = await db
    .select({
      personId: personIdentities.personId,
      type: personIdentities.type,
      value: personIdentities.value,
    })
    .from(personIdentities)
    .where(
      and(
        inArray(personIdentities.personId, personIds),
        inArray(personIdentities.type, [NIF, FEDERATION]),
      ),
    );
  for (const row of identities) {
    const facts = out.get(row.personId);
    if (!facts) continue;
    if (row.type === NIF) facts.nif = row.value;
    else facts.federationId = row.value;
  }
  const links = await db
    .select({
      personId: personContactLinks.personId,
      kind: contacts.kind,
      value: contacts.value,
    })
    .from(personContactLinks)
    .innerJoin(contacts, eq(contacts.id, personContactLinks.contactId))
    .where(
      and(
        inArray(personContactLinks.personId, personIds),
        isNull(personContactLinks.validTo),
        eq(personContactLinks.label, "own"),
        inArray(contacts.kind, ["email", "phone"]),
      ),
    )
    .orderBy(desc(personContactLinks.validFrom));
  for (const row of links) {
    const facts = out.get(row.personId);
    if (!facts) continue;
    if (row.kind === "email" && facts.email === null) facts.email = row.value;
    if (row.kind === "phone" && facts.phone === null) facts.phone = row.value;
  }
  return out;
}

export async function personalFactsOf(db: Db, personId: string): Promise<PersonalFacts> {
  return (await loadPersonalFacts(db, [personId])).get(personId) ?? empty();
}

/** The person holding this identity (NIF or federation licence), if any. */
export async function findPersonByIdentity(
  db: Db,
  type: "nif" | "federationId",
  value: string,
): Promise<string | null> {
  const normalised = normaliseIdentity(value);
  if (!normalised) return null;
  const [row] = await db
    .select({ personId: personIdentities.personId })
    .from(personIdentities)
    .where(
      and(
        eq(personIdentities.type, type === "nif" ? NIF : FEDERATION),
        eq(personIdentities.valueNormalised, normalised),
      ),
    );
  return row?.personId ?? null;
}

/** Sets (or, with null, clears) a person's NIF or federation licence. */
export async function setIdentity(
  db: Db,
  personId: string,
  type: "nif" | "federationId",
  value: string | null,
): Promise<void> {
  const dbType = type === "nif" ? NIF : FEDERATION;
  const trimmed = value?.trim() ?? "";
  const normalised = normaliseIdentity(trimmed);
  const [current] = await db
    .select({ id: personIdentities.id, valueNormalised: personIdentities.valueNormalised })
    .from(personIdentities)
    .where(and(eq(personIdentities.personId, personId), eq(personIdentities.type, dbType)));
  if (current && current.valueNormalised === normalised) return;
  if (current) await db.delete(personIdentities).where(eq(personIdentities.id, current.id));
  if (normalised) {
    await db.insert(personIdentities).values({
      personId,
      type: dbType,
      value: trimmed,
      valueNormalised: normalised,
      evidence: "self_declared",
    });
  }
}

/** Sets a person's own email or phone; the previous one is closed, not overwritten. */
export async function setContact(
  db: Db,
  personId: string,
  kind: "email" | "phone",
  value: string | null,
): Promise<void> {
  const trimmed = value?.trim() || null;
  const [current] = await db
    .select({ linkId: personContactLinks.id, value: contacts.value })
    .from(personContactLinks)
    .innerJoin(contacts, eq(contacts.id, personContactLinks.contactId))
    .where(
      and(
        eq(personContactLinks.personId, personId),
        eq(contacts.kind, kind),
        eq(personContactLinks.label, "own"),
        isNull(personContactLinks.validTo),
      ),
    )
    .limit(1);
  if (current && current.value === trimmed) return;
  if (current) {
    await db
      .update(personContactLinks)
      .set({ validTo: new Date() })
      .where(eq(personContactLinks.id, current.linkId));
  }
  if (trimmed) {
    const [contact] = await db.insert(contacts).values({ kind, value: trimmed }).returning();
    if (!contact) throw new Error("Insert returned no row");
    await db
      .insert(personContactLinks)
      .values({ personId, contactId: contact.id, label: "own", isPrimary: true });
  }
}

/** Applies the personal facts present in `input` (undefined leaves a fact alone). */
export async function savePersonalFacts(
  db: Db,
  personId: string,
  input: Partial<{
    email: string | null;
    phone: string | null;
    nif: string | null;
    federationId: string | null;
  }>,
): Promise<void> {
  if (input.nif !== undefined) await setIdentity(db, personId, "nif", input.nif);
  if (input.federationId !== undefined) {
    await setIdentity(db, personId, "federationId", input.federationId);
  }
  if (input.email !== undefined) await setContact(db, personId, "email", input.email);
  if (input.phone !== undefined) await setContact(db, personId, "phone", input.phone);
}
