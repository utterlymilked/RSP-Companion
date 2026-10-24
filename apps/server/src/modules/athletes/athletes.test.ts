import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makePerson } from "../../test/factories.js";
import { contacts, persons } from "../people/schema.js";
import { prospects } from "../scouting/schema.js";
import { insertProspect, updateProspect } from "../scouting/service.js";
import { athleteAttributes, athleteClubs, athleteContactLinks, athletes } from "./schema.js";
import { cleanName, loadFacts } from "./service.js";

describeDb("athletes (ADR 0024)", () => {
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

  it("cleans names to the athlete rule", () => {
    expect(cleanName("  Tomás  Gouveia (pedido) ")).toBe("Tomás Gouveia pedido");
    expect(cleanName("A")).toBeNull();
    expect(cleanName("<>")).toBeNull();
  });

  it("stores a prospect's facts on the athlete and keeps history when they change", () =>
    withRollback(async (db) => {
      const created = await insertProspect(db, {
        facts: {
          fullName: "Tiago Mendes",
          birthYear: 2012,
          heightCm: 150,
          positions: ["gr"],
          currentClub: "Clube A",
          guardianPhone: "912000000",
        },
        values: { retainUntil: "2030-01-01" },
        source: "scout",
        createdBy: null,
      });
      const id = created.id;
      expect(created).toMatchObject({ fullName: "Tiago Mendes", birthYear: 2012, birthDate: null });
      await updateProspect(db, id, {
        heightCm: 155,
        positions: ["gr", "dc"],
        currentClub: "Clube B",
        guardianPhone: "913000000",
      });
      const facts = (await loadFacts(db, [id])).get(id);
      expect(facts).toMatchObject({
        heightCm: 155,
        currentClub: "Clube B",
        guardianPhone: "913000000",
      });
      expect(facts?.positions.sort()).toEqual(["dc", "gr"]);
      const attrs = await db
        .select()
        .from(athleteAttributes)
        .where(eq(athleteAttributes.athleteId, id));
      expect(
        attrs
          .filter((r) => r.type === "height_cm")
          .map((r) => [r.valueNum, r.validTo === null])
          .sort(),
      ).toEqual([
        [150, false],
        [155, true],
      ]);
      const dob = attrs.find((r) => r.type === "date_of_birth");
      expect([dob?.valueDate, dob?.precision]).toEqual(["2012-01-01", "year"]);
      const clubs = await db.select().from(athleteClubs).where(eq(athleteClubs.athleteId, id));
      expect(clubs.map((c) => [c.clubName, c.toDate === null]).sort()).toEqual([
        ["Clube A", false],
        ["Clube B", true],
      ]);
      const links = await db
        .select()
        .from(athleteContactLinks)
        .where(eq(athleteContactLinks.athleteId, id));
      expect(links).toHaveLength(2);
    }));

  it("erases the athlete and its contacts when the prospect is deleted", () =>
    withRollback(async (db) => {
      const p = await insertProspect(db, {
        facts: { fullName: "Rui Costa", guardianEmail: "g@example.test" },
        values: { retainUntil: "2030-01-01" },
        source: "scout",
        createdBy: null,
      });
      await db.delete(prospects).where(eq(prospects.id, p.id));
      expect(await db.select().from(athletes).where(eq(athletes.id, p.id))).toHaveLength(0);
      expect(
        await db.select().from(contacts).where(eq(contacts.value, "g@example.test")),
      ).toHaveLength(0);
    }));

  it("erases a person's contact history with the person", () =>
    withRollback(async (db) => {
      const person = await makePerson(db, { email: "old@example.test" });
      await db.update(persons).set({ email: "new@example.test" }).where(eq(persons.id, person.id));
      await db.delete(persons).where(eq(persons.id, person.id));
      const left = await db.select().from(contacts);
      expect(left.filter((c) => c.value.includes("@example.test"))).toHaveLength(0);
    }));
});
