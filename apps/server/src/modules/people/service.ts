import { type PersonField, personFieldsUpTo } from "@rsp/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { type Guardianship, guardianships, type NewGuardianship, persons } from "./schema.js";

type PersonColumns = { [K in PersonField]: (typeof persons)[K] };

/**
 * Select object for the columns of `persons` a reader of `tier` may see, e.g.
 * `db.select(personColumns("general")).from(persons)`. Keeps personal data out of queries
 * that do not need it; M2 picks the tier from the caller's role.
 */
export function personColumns(tier: "general" | "personal"): Partial<PersonColumns> {
  const columns: Partial<Record<PersonField, unknown>> = {};
  for (const field of personFieldsUpTo(tier)) columns[field] = persons[field];
  return columns as Partial<PersonColumns>;
}

/**
 * Links a guardian to a child. When `isPrimary` is set, the child's previous primary
 * guardian (encarregado de educação) stops being primary.
 */
export async function addGuardian(db: Db, input: NewGuardianship): Promise<Guardianship> {
  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(guardianships)
        .set({ isPrimary: false })
        .where(and(eq(guardianships.childId, input.childId), eq(guardianships.isPrimary, true)));
    }
    const [row] = await tx.insert(guardianships).values(input).returning();
    if (!row) throw new Error("Insert returned no row");
    return row;
  });
}

/** Guardians of a child with the general-tier fields of each guardian, primary first. */
export async function guardiansOf(db: Db, childId: string) {
  const rows = await db.query.guardianships.findMany({
    where: eq(guardianships.childId, childId),
    with: { guardian: { columns: { id: true, fullName: true, displayName: true } } },
  });
  return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}
