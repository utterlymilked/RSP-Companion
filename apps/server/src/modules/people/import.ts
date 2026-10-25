import type { GuardianRelationship, Sex } from "@rsc/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { pgCode } from "../../db/errors.js";
import type { Db } from "../../db/index.js";
import { classes, teams } from "../teams/schema.js";
import { addTeamMember, enrolInClass } from "../teams/service.js";
import {
  findPersonByIdentity,
  loadPersonalFacts,
  personalFactsOf,
  savePersonalFacts,
} from "./facts.js";
import { guardianships, memberships, persons } from "./schema.js";
import { addGuardian } from "./service.js";

// Import of the club's spreadsheets (exported as CSV) into people, memberships, guardians and
// team / class rosters. Pure parsing lives here so it can be tested with invented data; the
// CLI (src/scripts/import-people.ts) reads the real file at runtime. Nothing in this file or
// its output may contain personal data from the sheets: issues cite line numbers only.

/** Splits CSV text into rows. Handles quotes, doubled quotes, CRLF, BOM and `,` or `;`. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Normalised header names (Portuguese and English) accepted for each field. */
const HEADER_ALIASES = {
  fullName: ["nome", "nome completo", "atleta", "name", "full name"],
  displayName: ["nome desportivo", "nome curto", "alcunha", "display name"],
  sex: ["sexo", "genero", "sex"],
  birthDate: ["data nascimento", "data de nascimento", "nascimento", "dn", "birth date"],
  email: ["email", "e mail", "correio eletronico"],
  phone: ["telemovel", "telefone", "contacto", "tlm", "phone"],
  federationId: [
    "n federacao",
    "n licenca",
    "licenca",
    "numero licenca",
    "federacao",
    "federation id",
  ],
  memberNumber: ["n socio", "numero socio", "socio", "member number"],
  team: ["equipa", "team"],
  class: ["turma", "class"],
  guardianName: ["encarregado de educacao", "encarregado", "ee", "nome ee", "guardian"],
  guardianEmail: ["email ee", "email encarregado", "guardian email"],
  guardianPhone: ["telefone ee", "telemovel ee", "contacto ee", "guardian phone"],
  guardianRelationship: ["parentesco", "relacao", "relationship"],
} as const;
export type ImportField = keyof typeof HEADER_ALIASES;

export interface ImportRow {
  line: number;
  fullName: string;
  displayName: string | null;
  sex: Sex | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  federationId: string | null;
  memberNumber: string | null;
  team: string | null;
  class: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianRelationship: GuardianRelationship;
}

export interface Issue {
  /** 1-based line of the CSV file (the header is line 1); 0 for file-level problems. */
  line: number;
  message: string;
}

const SEX_VALUES: Record<string, Sex> = {
  m: "male",
  masc: "male",
  masculino: "male",
  male: "male",
  f: "female",
  fem: "female",
  feminino: "female",
  female: "female",
};
const RELATIONSHIPS: Record<string, GuardianRelationship> = {
  mae: "mother",
  pai: "father",
  avo: "grandparent",
  avos: "grandparent",
  irmao: "sibling",
  irma: "sibling",
  tutor: "legal_guardian",
  "tutor legal": "legal_guardian",
  mother: "mother",
  father: "father",
};

/** DD/MM/YYYY, D-M-YYYY or YYYY-MM-DD → YYYY-MM-DD, or null when it is not a real date. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  const m =
    v.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [y, mo, d] = v.includes("-") && /^\d{4}/.test(v) ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

/** Maps CSV rows (header first) to import rows; unusable rows become issues, not rows. */
export function parseImport(table: string[][]): { rows: ImportRow[]; issues: Issue[] } {
  const [header, ...body] = table;
  const issues: Issue[] = [];
  if (!header) return { rows: [], issues: [{ line: 0, message: "file is empty" }] };
  const column = new Map<ImportField, number>();
  header.forEach((h, index) => {
    const name = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if ((aliases as readonly string[]).includes(name) && !column.has(field as ImportField)) {
        column.set(field as ImportField, index);
      }
    }
  });
  if (!column.has("fullName")) {
    return { rows: [], issues: [{ line: 1, message: "no name column (expected 'Nome')" }] };
  }
  const emailSchema = z.email();
  const rows: ImportRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (field: ImportField) => cells[column.get(field) ?? -1]?.trim() || null;
    const fullName = get("fullName");
    if (!fullName) {
      issues.push({ line, message: "missing name" });
      return;
    }
    const problems: string[] = [];
    const sexRaw = get("sex");
    const sex = sexRaw ? (SEX_VALUES[normalizeHeader(sexRaw)] ?? null) : null;
    if (sexRaw && !sex) problems.push("unknown sex value");
    const birthRaw = get("birthDate");
    const birthDate = birthRaw ? parseDate(birthRaw) : null;
    if (birthRaw && !birthDate) problems.push("invalid birth date");
    const emailRaw = get("email");
    const email =
      emailRaw && emailSchema.safeParse(emailRaw).success ? emailRaw.toLowerCase() : null;
    if (emailRaw && !email) problems.push("invalid email");
    const guardianEmailRaw = get("guardianEmail");
    const guardianEmail =
      guardianEmailRaw && emailSchema.safeParse(guardianEmailRaw).success
        ? guardianEmailRaw.toLowerCase()
        : null;
    if (guardianEmailRaw && !guardianEmail) problems.push("invalid guardian email");
    if (problems.length > 0) {
      issues.push({ line, message: problems.join(", ") });
      return;
    }
    const relationshipRaw = get("guardianRelationship");
    rows.push({
      line,
      fullName,
      displayName: get("displayName"),
      sex,
      birthDate,
      email,
      phone: get("phone"),
      federationId: get("federationId"),
      memberNumber: get("memberNumber"),
      team: get("team"),
      class: get("class"),
      guardianName: get("guardianName"),
      guardianEmail,
      guardianPhone: get("guardianPhone"),
      guardianRelationship:
        (relationshipRaw && RELATIONSHIPS[normalizeHeader(relationshipRaw)]) || "other",
    });
  });
  return { rows, issues };
}

export interface ImportOptions {
  /** Organisation that issues the member numbers; without it member numbers are ignored. */
  organisationId?: string;
  /** Season whose teams and classes the `equipa` / `turma` columns refer to. */
  seasonId?: string;
  /** Join date for memberships and rosters. */
  today: string;
}

export interface ImportSummary {
  peopleCreated: number;
  peopleUpdated: number;
  guardiansCreated: number;
  guardianLinks: number;
  memberships: number;
  teamPlaces: number;
  classPlaces: number;
  issues: Issue[];
}

const lower = (s: string) => s.trim().toLowerCase();

async function findPerson(
  db: Db,
  input: { fullName: string; birthDate: string | null; federationId: string | null },
) {
  if (input.federationId) {
    const fedId = await findPersonByIdentity(db, "federationId", input.federationId);
    const [byId] = fedId ? await db.select().from(persons).where(eq(persons.id, fedId)) : [];
    if (byId) return byId;
  }
  if (!input.birthDate) return undefined;
  const [byName] = await db
    .select()
    .from(persons)
    .where(
      and(
        sql`lower(${persons.fullName}) = ${lower(input.fullName)}`,
        eq(persons.birthDate, input.birthDate),
      ),
    );
  return byName;
}

/**
 * Applies rows to the database: people are matched by federation number, else by name and
 * birth date; existing values are only filled in, never blanked. Each row runs in a
 * savepoint, so a bad row is reported and skipped. Callers run this inside a transaction and
 * roll it back for a dry run.
 */
export async function importRows(
  db: Db,
  rows: ImportRow[],
  options: ImportOptions,
): Promise<ImportSummary> {
  const total: ImportSummary = emptySummary();
  for (const row of rows) {
    // Counts of a row that fails are discarded with its savepoint.
    const rowSummary = emptySummary();
    try {
      await db.transaction((tx) => importRow(tx, row, options, rowSummary));
      for (const key of COUNTERS) total[key] += rowSummary[key];
    } catch (error) {
      const code = pgCode(error);
      total.issues.push({
        line: row.line,
        message:
          error instanceof ImportError ? error.message : `database error${code ? ` ${code}` : ""}`,
      });
    }
  }
  return total;
}

const COUNTERS = [
  "peopleCreated",
  "peopleUpdated",
  "guardiansCreated",
  "guardianLinks",
  "memberships",
  "teamPlaces",
  "classPlaces",
] as const;

const emptySummary = (): ImportSummary => ({
  peopleCreated: 0,
  peopleUpdated: 0,
  guardiansCreated: 0,
  guardianLinks: 0,
  memberships: 0,
  teamPlaces: 0,
  classPlaces: 0,
  issues: [],
});

class ImportError extends Error {}

async function importRow(db: Db, row: ImportRow, options: ImportOptions, summary: ImportSummary) {
  const fields = {
    fullName: row.fullName,
    displayName: row.displayName,
    sex: row.sex,
    birthDate: row.birthDate,
  };
  const facts = { email: row.email, phone: row.phone, federationId: row.federationId };
  const existing = await findPerson(db, row);
  let personId: string;
  if (existing) {
    const fill = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) => value !== null && existing[key as keyof typeof existing] === null,
      ),
    );
    const held = await personalFactsOf(db, existing.id);
    const factFill = Object.fromEntries(
      Object.entries(facts).filter(
        ([key, value]) => value !== null && held[key as keyof typeof held] === null,
      ),
    );
    if (Object.keys(fill).length > 0) {
      await db.update(persons).set(fill).where(eq(persons.id, existing.id));
    }
    if (Object.keys(factFill).length > 0) await savePersonalFacts(db, existing.id, factFill);
    if (Object.keys(fill).length > 0 || Object.keys(factFill).length > 0) summary.peopleUpdated++;
    personId = existing.id;
  } else {
    const [created] = await db.insert(persons).values(fields).returning({ id: persons.id });
    if (!created) throw new Error("Insert returned no row");
    personId = created.id;
    await savePersonalFacts(db, personId, facts);
    summary.peopleCreated++;
  }

  if (row.memberNumber && options.organisationId) {
    const [open] = await db
      .select({ id: memberships.id, memberNumber: memberships.memberNumber })
      .from(memberships)
      .where(
        and(
          eq(memberships.personId, personId),
          eq(memberships.organisationId, options.organisationId),
          sql`${memberships.status} <> 'ended'`,
        ),
      );
    if (!open) {
      await db.insert(memberships).values({
        personId,
        organisationId: options.organisationId,
        memberNumber: row.memberNumber,
        startedOn: options.today,
      });
      summary.memberships++;
    } else if (open.memberNumber !== row.memberNumber) {
      throw new ImportError("person already has a different member number");
    }
  }

  if (row.guardianName) {
    const named = await db
      .select({ id: persons.id })
      .from(persons)
      .where(sql`lower(${persons.fullName}) = ${lower(row.guardianName)}`);
    const namedFacts = await loadPersonalFacts(
      db,
      named.map((p) => p.id),
    );
    const match = named.find((p) => {
      const email = namedFacts.get(p.id)?.email ?? null;
      return row.guardianEmail ? email === row.guardianEmail : email === null;
    });
    let guardianId = match?.id;
    if (!guardianId) {
      const [created] = await db
        .insert(persons)
        .values({ fullName: row.guardianName })
        .returning({ id: persons.id });
      guardianId = created?.id;
      if (guardianId) {
        await savePersonalFacts(db, guardianId, {
          email: row.guardianEmail,
          phone: row.guardianPhone,
        });
      }
      summary.guardiansCreated++;
    }
    if (guardianId && guardianId !== personId) {
      const [link] = await db
        .select({ id: guardianships.id })
        .from(guardianships)
        .where(and(eq(guardianships.guardianId, guardianId), eq(guardianships.childId, personId)));
      if (!link) {
        const [hasPrimary] = await db
          .select({ id: guardianships.id })
          .from(guardianships)
          .where(and(eq(guardianships.childId, personId), eq(guardianships.isPrimary, true)));
        await addGuardian(db, {
          guardianId,
          childId: personId,
          relationship: row.guardianRelationship,
          isPrimary: !hasPrimary,
        });
        summary.guardianLinks++;
      }
    }
  }

  if (row.team) {
    if (!options.seasonId) throw new ImportError("team column needs a season");
    const found = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        and(eq(teams.seasonId, options.seasonId), sql`lower(${teams.name}) = ${lower(row.team)}`),
      );
    if (found.length !== 1)
      throw new ImportError(found.length === 0 ? "unknown team" : "ambiguous team name");
    await addTeamMember(db, {
      teamId: found[0]?.id ?? "",
      personId,
      joinedOn: options.today,
      shirtNumber: null,
    });
    summary.teamPlaces++;
  }
  if (row.class) {
    if (!options.seasonId) throw new ImportError("class column needs a season");
    const found = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.seasonId, options.seasonId), eq(classes.code, row.class)));
    if (found.length !== 1)
      throw new ImportError(found.length === 0 ? "unknown class" : "ambiguous class code");
    await enrolInClass(db, { classId: found[0]?.id ?? "", personId, joinedOn: options.today });
    summary.classPlaces++;
  }
}
