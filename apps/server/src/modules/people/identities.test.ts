import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { describeDb, pgCode, savepoint, withRollback } from "../../test/db.js";
import { makePerson } from "../../test/factories.js";
import { userPersons, users } from "../auth/schema.js";
import { contacts, personContactLinks, personIdentities, persons } from "./schema.js";

describeDb("identities and contacts (ADR 0024 step 1)", () => {
  it("gives every person an rsc_code identity and mirrors nif and federation id", () =>
    withRollback(async (db) => {
      const p = await makePerson(db, { nif: "123 456 789", federationId: "FPF-1" });
      const rows = await db
        .select()
        .from(personIdentities)
        .where(eq(personIdentities.personId, p.id));
      expect(rows.map((r) => r.type).sort()).toEqual(["fpf_licence", "nif", "rsc_code"]);
      expect(rows.find((r) => r.type === "nif")?.valueNormalised).toBe("123456789");
      await db.update(persons).set({ nif: null }).where(eq(persons.id, p.id));
      const after = await db
        .select()
        .from(personIdentities)
        .where(eq(personIdentities.personId, p.id));
      expect(after.map((r) => r.type)).not.toContain("nif");
    }));

  it("refuses a second person with the same normalised identity", () =>
    withRollback(async (db) => {
      const a = await makePerson(db);
      const b = await makePerson(db);
      await db.insert(personIdentities).values({
        personId: a.id,
        type: "passport",
        value: "ab 12",
        valueNormalised: "AB12",
      });
      const error = await savepoint(db, (tx) =>
        tx.insert(personIdentities).values({
          personId: b.id,
          type: "passport",
          value: "AB-12",
          valueNormalised: "AB12",
        }),
      );
      expect(pgCode(error)).toBe("23505");
    }));

  it("refuses to remove the last identity of a person", () =>
    withRollback(async (db) => {
      const p = await makePerson(db);
      const error = await savepoint(db, async (tx) => {
        await tx.delete(personIdentities).where(eq(personIdentities.personId, p.id));
        await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      });
      expect(pgCode(error)).toBe("23514");
    }));

  it("keeps contact history when email changes", () =>
    withRollback(async (db) => {
      const p = await makePerson(db, { email: "a@example.test" });
      await db.update(persons).set({ email: "b@example.test" }).where(eq(persons.id, p.id));
      const links = await db
        .select({ value: contacts.value, validTo: personContactLinks.validTo })
        .from(personContactLinks)
        .innerJoin(contacts, eq(contacts.id, personContactLinks.contactId))
        .where(eq(personContactLinks.personId, p.id));
      expect(links).toHaveLength(2);
      expect(links.filter((l) => l.validTo === null).map((l) => l.value)).toEqual([
        "b@example.test",
      ]);
    }));

  it("mirrors users.person_id into user_persons", () =>
    withRollback(async (db) => {
      const p = await makePerson(db);
      const [u] = await db
        .insert(users)
        .values({ name: "U", email: "u@example.test", personId: p.id })
        .returning();
      const rows = await db
        .select()
        .from(userPersons)
        .where(eq(userPersons.userId, u?.id ?? ""));
      expect(rows).toMatchObject([{ personId: p.id, relationship: "owner", status: "approved" }]);
      await db
        .update(users)
        .set({ personId: null })
        .where(eq(users.id, u?.id ?? ""));
      const after = await db
        .select()
        .from(userPersons)
        .where(eq(userPersons.userId, u?.id ?? ""));
      expect(after[0]?.status).toBe("revoked");
    }));
});
