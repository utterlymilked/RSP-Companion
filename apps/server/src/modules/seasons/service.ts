import type { Sex } from "@rsp/shared";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { type AgeGroup, ageGroups, type Season, seasons } from "./schema.js";

export async function getCurrentSeason(db: Db): Promise<Season | undefined> {
  const [season] = await db.select().from(seasons).where(eq(seasons.isCurrent, true));
  return season;
}

/** Makes `seasonId` the only current season. */
export async function setCurrentSeason(db: Db, seasonId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(seasons).set({ isCurrent: false }).where(eq(seasons.isCurrent, true));
    const updated = await tx
      .update(seasons)
      .set({ isCurrent: true })
      .where(eq(seasons.id, seasonId))
      .returning({ id: seasons.id });
    if (updated.length === 0) throw new Error(`Season ${seasonId} not found`);
  });
}

/**
 * Escalões a person born in `birthYear` belongs to in a season: mixed groups, plus groups of
 * their sex when known. Ordered by sortOrder.
 */
export async function ageGroupsForBirthYear(
  db: Db,
  seasonId: string,
  birthYear: number,
  sex?: Sex | null,
): Promise<AgeGroup[]> {
  const categories = sex ? (["mixed", sex] as const) : (["mixed"] as const);
  return db
    .select()
    .from(ageGroups)
    .where(
      and(
        eq(ageGroups.seasonId, seasonId),
        lte(ageGroups.birthYearFrom, birthYear),
        gte(ageGroups.birthYearTo, birthYear),
        inArray(ageGroups.category, [...categories]),
      ),
    )
    .orderBy(asc(ageGroups.sortOrder), asc(ageGroups.name));
}
