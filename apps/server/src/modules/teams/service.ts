import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { persons } from "../people/schema.js";
import {
  type ClassMember,
  classes,
  classMembers,
  staffAssignments,
  teamMembers,
  teams,
} from "./schema.js";

/** Enrols an athlete in a class; re-enrolling someone who left reopens their membership. */
export async function enrolInClass(
  db: Db,
  input: { classId: string; personId: string; joinedOn: string },
): Promise<ClassMember> {
  const [row] = await db
    .insert(classMembers)
    .values(input)
    .onConflictDoUpdate({
      target: [classMembers.classId, classMembers.personId],
      set: { joinedOn: input.joinedOn, leftOn: null },
    })
    .returning();
  if (!row) throw new Error("Upsert returned no row");
  return row;
}

/** Marks an athlete as having left a class on `leftOn`. Returns false if not enrolled. */
export async function leaveClass(
  db: Db,
  input: { classId: string; personId: string; leftOn: string },
): Promise<boolean> {
  const rows = await db
    .update(classMembers)
    .set({ leftOn: input.leftOn })
    .where(
      and(
        eq(classMembers.classId, input.classId),
        eq(classMembers.personId, input.personId),
        isNull(classMembers.leftOn),
      ),
    )
    .returning({ id: classMembers.id });
  return rows.length > 0;
}

/** Current athletes of a class (general-tier fields only), by name. */
export async function classRoster(db: Db, classId: string) {
  return db
    .select({ personId: persons.id, fullName: persons.fullName, displayName: persons.displayName })
    .from(classMembers)
    .innerJoin(persons, eq(persons.id, classMembers.personId))
    .where(and(eq(classMembers.classId, classId), isNull(classMembers.leftOn)))
    .orderBy(persons.fullName);
}

/** Staff assigned to a team, with their function. */
export async function teamStaff(db: Db, teamId: string) {
  return db
    .select({
      personId: persons.id,
      fullName: persons.fullName,
      function: staffAssignments.function,
    })
    .from(staffAssignments)
    .innerJoin(persons, eq(persons.id, staffAssignments.personId))
    .where(eq(staffAssignments.teamId, teamId))
    .orderBy(staffAssignments.function, persons.fullName);
}

/** Teams, optionally of one season, limited to `teamIds` for scoped readers (null = all). */
export async function listTeams(
  db: Db,
  filter: { seasonId?: string; teamIds: readonly string[] | null },
) {
  return db
    .select()
    .from(teams)
    .where(
      and(
        filter.seasonId ? eq(teams.seasonId, filter.seasonId) : undefined,
        filter.teamIds ? inArray(teams.id, [...filter.teamIds]) : undefined,
      ),
    )
    .orderBy(asc(teams.name));
}

/** Classes (turmas), optionally of one season, limited to `classIds` (null = all). */
export async function listClasses(
  db: Db,
  filter: { seasonId?: string; classIds: readonly string[] | null },
) {
  return db
    .select()
    .from(classes)
    .where(
      and(
        filter.seasonId ? eq(classes.seasonId, filter.seasonId) : undefined,
        filter.classIds ? inArray(classes.id, [...filter.classIds]) : undefined,
      ),
    )
    .orderBy(asc(classes.code));
}

/** Current athletes of a team (general-tier fields only) with their shirt numbers. */
export async function teamRoster(db: Db, teamId: string) {
  return db
    .select({
      personId: persons.id,
      fullName: persons.fullName,
      displayName: persons.displayName,
      shirtNumber: teamMembers.shirtNumber,
    })
    .from(teamMembers)
    .innerJoin(persons, eq(persons.id, teamMembers.personId))
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftOn)))
    .orderBy(persons.fullName);
}

/** Puts an athlete on a team's roster; re-adding someone who left reopens their place. */
export async function addTeamMember(
  db: Db,
  input: { teamId: string; personId: string; joinedOn: string; shirtNumber: number | null },
) {
  const [row] = await db
    .insert(teamMembers)
    .values(input)
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.personId],
      set: { joinedOn: input.joinedOn, leftOn: null, shirtNumber: input.shirtNumber },
    })
    .returning();
  if (!row) throw new Error("Upsert returned no row");
  return row;
}

/** Marks an athlete as having left a team on `leftOn`. Returns false if not on the roster. */
export async function leaveTeam(
  db: Db,
  input: { teamId: string; personId: string; leftOn: string },
) {
  const rows = await db
    .update(teamMembers)
    .set({ leftOn: input.leftOn })
    .where(
      and(
        eq(teamMembers.teamId, input.teamId),
        eq(teamMembers.personId, input.personId),
        isNull(teamMembers.leftOn),
      ),
    )
    .returning({ id: teamMembers.id });
  return rows.length > 0;
}
