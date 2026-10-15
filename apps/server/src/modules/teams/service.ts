import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { persons } from "../people/schema.js";
import { type ClassMember, classMembers, staffAssignments } from "./schema.js";

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
