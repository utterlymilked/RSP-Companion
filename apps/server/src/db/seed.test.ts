import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { getCurrentSeason } from "../modules/seasons/service.js";
import { describeDb, withRollback } from "../test/db.js";
import { schema } from "./index.js";
import { seed, truncateAll } from "./seed.js";

describeDb("seed", () => {
  it("fills an empty database with a current season, classes, teams and people", () =>
    withRollback(async (db) => {
      await truncateAll(db);
      await seed(db);
      const total = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n;
      expect((await getCurrentSeason(db))?.name).toBe("2026/27");
      expect(await total(schema.classes)).toBe(9);
      expect(await total(schema.teams)).toBe(9);
      expect(await total(schema.classMembers)).toBe(72);
      expect(await total(schema.users)).toBe(2);
      expect(await total(schema.roleAssignments)).toBe(2);
    }));
});
