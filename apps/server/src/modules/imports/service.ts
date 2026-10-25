import {
  type ImportKind,
  type ImportReport,
  type ImportRowResult,
  type ImportRowStatus,
  MAX_IMPORT_ROWS,
} from "@rsc/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { pgCode } from "../../db/errors.js";
import type { Db } from "../../db/index.js";
import { organisations } from "../organisations/schema.js";
import { findPersonByIdentity, personalFactsOf, setIdentity } from "../people/facts.js";
import { persons, players } from "../people/schema.js";
import { ageGroups, seasons } from "../seasons/schema.js";
import { teamMembers, teams } from "../teams/schema.js";
import { type PlayerRow, parsePlayers, parseTeams, type TeamRow } from "./parse.js";
import { readTable } from "./xlsx.js";

/** A row-level failure with a machine-readable reason, reported to the user as that row's error. */
class RowError extends Error {}
class Rollback extends Error {}

type Outcome = { status: Exclude<ImportRowStatus, "error">; identityCode?: string };

const lower = (s: string) => s.trim().toLowerCase();

async function currentSeasonId(db: Db): Promise<string> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.isCurrent, true));
  if (!season) throw new RowError("no_current_season");
  return season.id;
}

async function findPlayerPerson(db: Db, row: PlayerRow) {
  if (row.code) {
    const [byCode] = await db.select().from(persons).where(eq(persons.identityCode, row.code));
    if (!byCode) throw new RowError("unknown_code");
    return byCode;
  }
  if (row.federationId) {
    const fedId = await findPersonByIdentity(db, "federationId", row.federationId);
    const [byFed] = fedId ? await db.select().from(persons).where(eq(persons.id, fedId)) : [];
    if (byFed) return byFed;
  }
  if (row.fullName && row.birthDate) {
    const [byName] = await db
      .select()
      .from(persons)
      .where(
        and(
          sql`lower(${persons.fullName}) = ${lower(row.fullName)}`,
          eq(persons.birthDate, row.birthDate),
        ),
      );
    if (byName) return byName;
  }
  if (row.alias && !row.fullName) {
    const found = await db
      .select()
      .from(persons)
      .where(
        and(
          eq(persons.isPseudonymous, true),
          sql`lower(${persons.displayName}) = ${lower(row.alias)}`,
        ),
      );
    if (found.length > 1) throw new RowError("ambiguous_alias");
    return found[0];
  }
  return undefined;
}

async function applyPlayer(
  db: Db,
  row: PlayerRow,
  seasonId: () => Promise<string>,
): Promise<Outcome> {
  const existing = await findPlayerPerson(db, row);
  let personId: string;
  let identityCode: string;
  let changed = false;
  if (existing) {
    personId = existing.id;
    identityCode = existing.identityCode;
    const fill: Partial<typeof persons.$inferInsert> = {};
    if (row.fullName && (existing.isPseudonymous || !existing.fullName)) {
      // A pseudonymous player gets their real name: the identity stays, the flag goes.
      fill.fullName = row.fullName;
      fill.isPseudonymous = false;
    }
    if (row.alias && !existing.displayName) fill.displayName = row.alias;
    if (row.sex && !existing.sex) fill.sex = row.sex;
    if (row.birthDate && !existing.birthDate) fill.birthDate = row.birthDate;
    if (row.federationId && !(await personalFactsOf(db, existing.id)).federationId) {
      await setIdentity(db, existing.id, "federationId", row.federationId);
      changed = true;
    }
    if (Object.keys(fill).length > 0) {
      await db.update(persons).set(fill).where(eq(persons.id, personId));
      changed = true;
    }
  } else {
    const [created] = await db
      .insert(persons)
      .values({
        fullName: row.fullName ?? row.alias ?? "",
        displayName: row.alias,
        isPseudonymous: !row.fullName,
        sex: row.sex,
        birthDate: row.birthDate,
      })
      .returning({ id: persons.id, identityCode: persons.identityCode });
    if (!created) throw new Error("Insert returned no row");
    personId = created.id;
    if (row.federationId) await setIdentity(db, personId, "federationId", row.federationId);
    identityCode = created.identityCode;
    changed = true;
  }

  const [facet] = await db.select().from(players).where(eq(players.personId, personId));
  if (!facet) {
    await db.insert(players).values({ personId, position: row.position, dominantFoot: row.foot });
    changed = true;
  } else {
    const fill: Partial<typeof players.$inferInsert> = {};
    if (row.position && !facet.position) fill.position = row.position;
    if (row.foot && !facet.dominantFoot) fill.dominantFoot = row.foot;
    if (Object.keys(fill).length > 0) {
      await db.update(players).set(fill).where(eq(players.id, facet.id));
      changed = true;
    }
  }

  if (row.team) {
    const found = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        and(eq(teams.seasonId, await seasonId()), sql`lower(${teams.name}) = ${lower(row.team)}`),
      );
    if (found.length !== 1)
      throw new RowError(found.length === 0 ? "unknown_team" : "ambiguous_team");
    const teamId = found[0]?.id ?? "";
    const [current] = await db
      .select({ id: teamMembers.id, shirtNumber: teamMembers.shirtNumber })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.personId, personId),
          isNull(teamMembers.leftOn),
        ),
      );
    if (!current || (row.shirt !== null && current.shirtNumber !== row.shirt)) {
      await db
        .insert(teamMembers)
        .values({
          teamId,
          personId,
          joinedOn: new Date().toISOString().slice(0, 10),
          shirtNumber: row.shirt ?? current?.shirtNumber ?? null,
        })
        .onConflictDoUpdate({
          target: [teamMembers.teamId, teamMembers.personId],
          set: { leftOn: null, shirtNumber: row.shirt ?? current?.shirtNumber ?? null },
        });
      changed = true;
    }
  }
  return { status: existing ? (changed ? "update" : "unchanged") : "create", identityCode };
}

async function applyTeam(db: Db, row: TeamRow, seasonId: () => Promise<string>): Promise<Outcome> {
  const season = await seasonId();
  let organisationId: string;
  if (row.organisation) {
    const [org] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(sql`lower(${organisations.name}) = ${lower(row.organisation)}`);
    if (!org) throw new RowError("unknown_organisation");
    organisationId = org.id;
  } else {
    const clubs = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.kind, "club"));
    if (clubs.length !== 1) throw new RowError("no_default_organisation");
    organisationId = clubs[0]?.id ?? "";
  }
  let ageGroupId: string | null = null;
  if (row.ageGroup) {
    const groups = await db
      .select({ id: ageGroups.id, category: ageGroups.category })
      .from(ageGroups)
      .where(
        and(eq(ageGroups.seasonId, season), sql`lower(${ageGroups.name}) = ${lower(row.ageGroup)}`),
      );
    const matching = groups.length > 1 ? groups.filter((g) => g.category === row.category) : groups;
    if (matching.length !== 1) {
      throw new RowError(groups.length === 0 ? "unknown_age_group" : "ambiguous_age_group");
    }
    ageGroupId = matching[0]?.id ?? null;
  }
  const [existing] = await db
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.seasonId, season),
        eq(teams.organisationId, organisationId),
        sql`lower(${teams.name}) = ${lower(row.name)}`,
      ),
    );
  if (!existing) {
    await db.insert(teams).values({
      seasonId: season,
      organisationId,
      ageGroupId,
      name: row.name,
      category: row.category,
    });
    return { status: "create" };
  }
  if (
    existing.category === row.category &&
    (ageGroupId === null || existing.ageGroupId === ageGroupId)
  ) {
    return { status: "unchanged" };
  }
  await db
    .update(teams)
    .set({ category: row.category, ageGroupId: ageGroupId ?? existing.ageGroupId })
    .where(eq(teams.id, existing.id));
  return { status: "update" };
}

/**
 * Parses an .xlsx file and applies it row by row, each in a savepoint so a bad row is
 * reported and skipped. With `apply: false` everything is rolled back at the end (preview),
 * which makes the preview exactly what an apply would do. Reports hold names and codes of
 * rows only, never other personal data.
 */
export async function runImport(
  db: Db,
  kind: ImportKind,
  data: Uint8Array,
  options: { apply: boolean },
): Promise<ImportReport> {
  const sheet = await readTable(data);
  const results: ImportRowResult[] = [];
  const fileError = (error: string) => {
    results.push({ line: 0, status: "error", label: null, identityCode: null, error });
  };
  if (!sheet) fileError("unreadable_file");
  else if (sheet.table.length - 1 > MAX_IMPORT_ROWS) fileError("too_many_rows");
  else {
    const parsed =
      kind === "players"
        ? parsePlayers(sheet.table, sheet.lines)
        : parseTeams(sheet.table, sheet.lines);
    const problems = new Map(parsed.problems.map((p) => [p.line, p.error]));
    for (const p of parsed.problems) {
      if (p.line === 0) fileError(p.error);
    }
    if (results.length === 0) {
      const ordered = [
        ...parsed.rows.map((row) => ({ line: row.line, row })),
        ...[...problems].filter(([line]) => line !== 0).map(([line]) => ({ line, row: null })),
      ].sort((a, b) => a.line - b.line);
      try {
        await db.transaction(async (tx) => {
          let season: Promise<string> | undefined;
          const seasonId = () => {
            season ??= currentSeasonId(tx);
            return season;
          };
          for (const { line, row } of ordered) {
            if (!row) {
              results.push({
                line,
                status: "error",
                label: null,
                identityCode: null,
                error: problems.get(line) ?? "invalid_row",
              });
              continue;
            }
            const label = "name" in row ? row.name : (row.fullName ?? row.alias);
            try {
              const outcome = await tx.transaction((sp) =>
                "name" in row ? applyTeam(sp, row, seasonId) : applyPlayer(sp, row, seasonId),
              );
              results.push({
                line,
                status: outcome.status,
                label,
                identityCode: outcome.identityCode ?? null,
                error: null,
              });
            } catch (error) {
              const code = pgCode(error);
              results.push({
                line,
                status: "error",
                label,
                identityCode: null,
                error:
                  error instanceof RowError
                    ? error.message
                    : `database_error${code ? `_${code}` : ""}`,
              });
            }
          }
          if (!options.apply) throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) throw error;
      }
    }
  }
  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of results) counts[r.status]++;
  return { kind, applied: options.apply, counts, rows: results };
}
