import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makeDepartment, makeOrganisation } from "../../test/factories.js";
import { departments, organisations } from "./schema.js";

describeDb("organisations and departments", () => {
  it("lists an organisation's departments through the relational API", () =>
    withRollback(async (db) => {
      const org = await makeOrganisation(db, { kind: "football_school" });
      await makeDepartment(db, org.id, "Nutrição");
      await makeDepartment(db, org.id, "Psicologia");
      const found = await db.query.organisations.findFirst({
        where: eq(organisations.id, org.id),
        with: { departments: true },
      });
      expect(found?.departments.map((d) => d.name).sort()).toEqual(["Nutrição", "Psicologia"]);
    }));

  it("keeps department names unique per organisation only", () =>
    withRollback(async (db) => {
      const a = await makeOrganisation(db);
      const b = await makeOrganisation(db);
      await makeDepartment(db, a.id, "Direção");
      await makeDepartment(db, b.id, "Direção");
      const error = await savepoint(db, (tx) => makeDepartment(tx, a.id, "Direção"));
      expect(pgCode(error)).toBe("23505");
    }));

  it("refuses to delete an organisation that still has departments", () =>
    withRollback(async (db) => {
      const org = await makeOrganisation(db);
      await makeDepartment(db, org.id);
      const error = await savepoint(db, (tx) =>
        tx.delete(organisations).where(eq(organisations.id, org.id)),
      );
      expect(pgCode(error)).toBe("23503");
      expect(
        await db.select().from(departments).where(eq(departments.organisationId, org.id)),
      ).toHaveLength(1);
    }));
});
