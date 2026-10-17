import {
  type DocumentContentType,
  type DocumentKind,
  expiryStatus,
  type MissingDocuments,
  REQUIRED_PLAYER_DOCUMENTS,
  requiredStaffDocuments,
  type StaffFunction,
  type UploadDocumentQuery,
} from "@rsc/shared";
import { and, asc, desc, eq, exists, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { persons } from "../people/schema.js";
import { staffAssignments, teamMembers } from "../teams/schema.js";
import { type Document, documents } from "./schema.js";

/** The columns the app lists. The storage key never leaves the server. */
const listColumns = {
  id: documents.id,
  personId: documents.personId,
  kind: documents.kind,
  title: documents.title,
  issuedOn: documents.issuedOn,
  expiresOn: documents.expiresOn,
  fileName: documents.fileName,
  contentType: documents.contentType,
  sizeBytes: documents.sizeBytes,
  createdAt: documents.createdAt,
};

/** What a file starts with, per accepted type; a wrong label or a renamed file is refused. */
const SIGNATURES: Record<DocumentContentType, readonly number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

/** True when `body` starts with the signature of `contentType`. */
export function matchesContentType(body: Uint8Array, contentType: DocumentContentType): boolean {
  return SIGNATURES[contentType].every((byte, i) => body[i] === byte);
}

export async function getPerson(db: Db, personId: string) {
  const [person] = await db
    .select({ id: persons.id, fullName: persons.fullName })
    .from(persons)
    .where(eq(persons.id, personId));
  return person ?? null;
}

/** Documents of a person, newest first, limited to `kinds`. */
export async function listDocuments(db: Db, personId: string, kinds: readonly DocumentKind[]) {
  if (kinds.length === 0) return [];
  return db
    .select(listColumns)
    .from(documents)
    .where(and(eq(documents.personId, personId), inArray(documents.kind, [...kinds])))
    .orderBy(desc(documents.createdAt), asc(documents.id));
}

export async function getDocument(db: Db, documentId: string): Promise<Document | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
  return row ?? null;
}

export async function createDocument(
  db: Db,
  input: {
    personId: string;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    uploadedBy: string;
    meta: UploadDocumentQuery;
  },
) {
  const { meta } = input;
  const [row] = await db
    .insert(documents)
    .values({
      personId: input.personId,
      kind: meta.kind,
      title: meta.title,
      issuedOn: meta.issuedOn,
      expiresOn: meta.expiresOn,
      storageKey: input.storageKey,
      fileName: meta.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
    })
    .returning(listColumns);
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function deleteDocument(db: Db, documentId: string) {
  await db.delete(documents).where(eq(documents.id, documentId));
}

export interface ExpiringDocument {
  personId: string;
  fullName: string;
  kind: DocumentKind;
  expiresOn: string;
  status: "expiring" | "expired";
}

const activeStaff = (today: string) =>
  and(
    sql`(${staffAssignments.endsOn} IS NULL OR ${staffAssignments.endsOn} >= ${today})`,
    sql`(${staffAssignments.startsOn} IS NULL OR ${staffAssignments.startsOn} <= ${today})`,
  );

/**
 * Documents that are expired or expire within `days` of `today`, for people currently in a
 * team and for staff with a current assignment (staff without a team count club-wide only).
 * A newer document of the same kind replaces the older one: only each person's latest expiry
 * per kind counts. `teamIds` limits the result (scoped roles, or a team filter).
 */
export async function expiringDocuments(
  db: Db,
  options: { today: string; days: number; teamIds?: readonly string[] },
): Promise<ExpiringDocument[]> {
  const limit = new Date(`${options.today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + options.days);
  const limitDay = limit.toISOString().slice(0, 10);
  if (options.teamIds && options.teamIds.length === 0) return [];
  const teamIds = options.teamIds ? [...options.teamIds] : null;
  const latest = max(documents.expiresOn);
  const onTeam = db
    .select({ one: sql`1` })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.personId, documents.personId),
        isNull(teamMembers.leftOn),
        teamIds ? inArray(teamMembers.teamId, teamIds) : undefined,
      ),
    );
  const onStaff = db
    .select({ one: sql`1` })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.personId, documents.personId),
        activeStaff(options.today),
        teamIds ? inArray(staffAssignments.teamId, teamIds) : undefined,
      ),
    );
  const rows = await db
    .select({
      personId: persons.id,
      fullName: persons.fullName,
      kind: documents.kind,
      expiresOn: sql<string>`${latest}`,
    })
    .from(documents)
    .innerJoin(persons, eq(persons.id, documents.personId))
    .where(and(sql`${documents.expiresOn} IS NOT NULL`, or(exists(onTeam), exists(onStaff))))
    .groupBy(persons.id, persons.fullName, documents.kind)
    .having(lte(latest, limitDay))
    .orderBy(asc(latest), asc(persons.fullName));
  return rows.map((r) => ({
    ...r,
    status:
      expiryStatus(r.expiresOn, options.today, options.days) === "expired" ? "expired" : "expiring",
  }));
}

/**
 * Who lacks a required document (questionnaire 2026-10-17): players on a team and staff with
 * a current assignment, in `teamIds` when given. A kind counts once any file of it exists
 * (an expired one shows in the expiring list instead). Medical exams are health tier, so
 * they are only checked when `includeMedical` is set.
 */
export async function missingDocuments(
  db: Db,
  options: { today: string; teamIds?: readonly string[]; includeMedical: boolean },
): Promise<MissingDocuments[]> {
  if (options.teamIds && options.teamIds.length === 0) return [];
  const teamIds = options.teamIds ? [...options.teamIds] : null;
  const players = await db
    .selectDistinct({ personId: teamMembers.personId, fullName: persons.fullName })
    .from(teamMembers)
    .innerJoin(persons, eq(persons.id, teamMembers.personId))
    .where(
      and(isNull(teamMembers.leftOn), teamIds ? inArray(teamMembers.teamId, teamIds) : undefined),
    );
  const staffRows = await db
    .select({
      personId: staffAssignments.personId,
      fullName: persons.fullName,
      function: staffAssignments.function,
    })
    .from(staffAssignments)
    .innerJoin(persons, eq(persons.id, staffAssignments.personId))
    .where(
      and(
        activeStaff(options.today),
        teamIds ? inArray(staffAssignments.teamId, teamIds) : undefined,
      ),
    );
  const staff = new Map<string, { fullName: string; functions: StaffFunction[] }>();
  for (const row of staffRows) {
    const entry = staff.get(row.personId) ?? { fullName: row.fullName, functions: [] };
    entry.functions.push(row.function);
    staff.set(row.personId, entry);
  }
  const everyone = [...new Set([...players.map((p) => p.personId), ...staff.keys()])];
  if (everyone.length === 0) return [];
  const held = await db
    .selectDistinct({ personId: documents.personId, kind: documents.kind })
    .from(documents)
    .where(inArray(documents.personId, everyone));
  const kindsOf = new Map<string, Set<DocumentKind>>();
  for (const h of held) {
    const set = kindsOf.get(h.personId) ?? new Set<DocumentKind>();
    set.add(h.kind);
    kindsOf.set(h.personId, set);
  }
  const out: MissingDocuments[] = [];
  const check = (
    personId: string,
    fullName: string,
    role: "player" | "staff",
    need: DocumentKind[],
  ) => {
    const have = kindsOf.get(personId) ?? new Set<DocumentKind>();
    const missing = need.filter(
      (k) => (options.includeMedical || k !== "medical_exam") && !have.has(k),
    );
    if (missing.length > 0) out.push({ personId, fullName, role, missing });
  };
  for (const [personId, { fullName, functions }] of staff) {
    check(personId, fullName, "staff", requiredStaffDocuments(functions));
  }
  for (const p of players) {
    if (!staff.has(p.personId)) {
      check(p.personId, p.fullName, "player", [...REQUIRED_PLAYER_DOCUMENTS]);
    }
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt"));
}
