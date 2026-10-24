import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { athleteAttributes, athletes } from "./schema.js";

describeDb("athletes (ADR 0024 step 2)", () => {
  it("generates a code and accepts a name with accents", () =>
    withRollback(async (db) => {
      const [a] = await db
        .insert(athletes)
        .values({ displayName: "João-Pedro D'Ávila" })
        .returning();
      expect(a?.code).toMatch(/^ATL-[0-9A-F]{8}$/);
    }));

  it("refuses names that are too short or only punctuation", () =>
    withRollback(async (db) => {
      for (const displayName of ["A", " - ", "..."]) {
        const error = await savepoint(db, (tx) => tx.insert(athletes).values({ displayName }));
        expect(pgCode(error), displayName).toBe("23514");
      }
    }));

  it("keeps one current value per attribute and allows several positions", () =>
    withRollback(async (db) => {
      const [a] = await db.insert(athletes).values({ displayName: "Rui" }).returning();
      const athleteId = a?.id ?? "";
      await db.insert(athleteAttributes).values({ athleteId, type: "height_cm", valueNum: 170 });
      const dup = await savepoint(db, (tx) =>
        tx.insert(athleteAttributes).values({ athleteId, type: "height_cm", valueNum: 171 }),
      );
      expect(pgCode(dup)).toBe("23505");
      // Closing the current row and inserting a new one is the change operation.
      await db
        .update(athleteAttributes)
        .set({ validTo: new Date() })
        .where(eq(athleteAttributes.athleteId, athleteId));
      await db.insert(athleteAttributes).values({ athleteId, type: "height_cm", valueNum: 171 });
      await db.insert(athleteAttributes).values([
        { athleteId, type: "position", valueText: "GR" },
        { athleteId, type: "position", valueText: "DC" },
      ]);
    }));

  it("requires exactly one value per attribute row", () =>
    withRollback(async (db) => {
      const [a] = await db.insert(athletes).values({ displayName: "Rui" }).returning();
      const error = await savepoint(db, (tx) =>
        tx.insert(athleteAttributes).values({ athleteId: a?.id ?? "", type: "nickname" }),
      );
      expect(pgCode(error)).toBe("23514");
    }));
});
