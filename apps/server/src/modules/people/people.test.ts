import { PERSON_FIELD_TIERS } from "@rsc/shared";
import { eq, getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makeOrganisation, makePerson } from "../../test/factories.js";
import { guardianships, memberships, persons } from "./schema.js";
import { addGuardian, guardiansOf, personColumns } from "./service.js";

describe("person sensitivity tiers", () => {
  it("labels every column of persons", () => {
    expect(Object.keys(getTableColumns(persons)).sort()).toEqual(
      Object.keys(PERSON_FIELD_TIERS).sort(),
    );
  });

  it("leaves personal fields out of the general projection", () => {
    const general = Object.keys(personColumns("general"));
    expect(general).toContain("fullName");
    expect(general).not.toContain("birthDate");
    expect(general).not.toContain("email");
    expect(Object.keys(personColumns("personal"))).toContain("birthDate");
  });
});

describeDb("people", () => {
  it("selects only general-tier fields with personColumns", () =>
    withRollback(async (db) => {
      const p = await makePerson(db, { birthDate: "2015-03-02", email: "x@example.test" });
      const [row] = await db
        .select(personColumns("general"))
        .from(persons)
        .where(eq(persons.id, p.id));
      expect(row).toMatchObject({ fullName: p.fullName });
      expect(row).not.toHaveProperty("birthDate");
      expect(row).not.toHaveProperty("email");
    }));

  it("keeps a single primary guardian per child", () =>
    withRollback(async (db) => {
      const child = await makePerson(db);
      const mother = await makePerson(db);
      const father = await makePerson(db);
      await addGuardian(db, {
        guardianId: mother.id,
        childId: child.id,
        relationship: "mother",
        isPrimary: true,
      });
      await addGuardian(db, {
        guardianId: father.id,
        childId: child.id,
        relationship: "father",
        isPrimary: true,
      });
      const guardians = await guardiansOf(db, child.id);
      expect(guardians.map((g) => [g.guardian.id, g.isPrimary])).toEqual([
        [father.id, true],
        [mother.id, false],
      ]);

      const error = await savepoint(db, (tx) =>
        tx
          .update(guardianships)
          .set({ isPrimary: true })
          .where(eq(guardianships.childId, child.id)),
      );
      expect(pgCode(error)).toBe("23505");
    }));

  it("rejects self-guardianship and duplicate links", () =>
    withRollback(async (db) => {
      const a = await makePerson(db);
      const b = await makePerson(db);
      const self = await savepoint(db, (tx) =>
        addGuardian(tx, { guardianId: a.id, childId: a.id, relationship: "other" }),
      );
      expect(pgCode(self)).toBe("23514");
      await addGuardian(db, { guardianId: a.id, childId: b.id, relationship: "mother" });
      const dup = await savepoint(db, (tx) =>
        addGuardian(tx, { guardianId: a.id, childId: b.id, relationship: "mother" }),
      );
      expect(pgCode(dup)).toBe("23505");
    }));

  it("removes a person's guardianships and memberships when the person is erased", () =>
    withRollback(async (db) => {
      const club = await makeOrganisation(db);
      const child = await makePerson(db);
      const guardian = await makePerson(db);
      await addGuardian(db, { guardianId: guardian.id, childId: child.id, relationship: "father" });
      await db.insert(memberships).values({
        personId: child.id,
        organisationId: club.id,
        memberNumber: "1",
        startedOn: "2026-09-01",
      });
      await db.delete(persons).where(eq(persons.id, child.id));
      expect(
        await db.select().from(guardianships).where(eq(guardianships.guardianId, guardian.id)),
      ).toHaveLength(0);
      expect(
        await db.select().from(memberships).where(eq(memberships.personId, child.id)),
      ).toHaveLength(0);
    }));

  it("allows one open membership per person and unique member numbers per organisation", () =>
    withRollback(async (db) => {
      const club = await makeOrganisation(db);
      const sad = await makeOrganisation(db, { kind: "sad" });
      const p = await makePerson(db);
      const q = await makePerson(db);
      const base = { personId: p.id, organisationId: club.id, startedOn: "2020-01-01" };
      const [first] = await db
        .insert(memberships)
        .values({ ...base, memberNumber: "100" })
        .returning();

      const second = await savepoint(db, (tx) =>
        tx.insert(memberships).values({ ...base, memberNumber: "101" }),
      );
      expect(pgCode(second)).toBe("23505");

      const taken = await savepoint(db, (tx) =>
        tx.insert(memberships).values({ ...base, personId: q.id, memberNumber: "100" }),
      );
      expect(pgCode(taken)).toBe("23505");

      // Same number in another organisation, and a new membership after the old one ended.
      await db.insert(memberships).values({ ...base, organisationId: sad.id, memberNumber: "100" });
      await db
        .update(memberships)
        .set({ status: "ended", endedOn: "2025-12-31" })
        .where(eq(memberships.id, first?.id ?? ""));
      await db
        .insert(memberships)
        .values({ ...base, memberNumber: "102", startedOn: "2026-01-01" });
    }));
});
