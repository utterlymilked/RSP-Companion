import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { createUserWithPassword } from "../modules/auth/service.js";
import { getCurrentSeason } from "../modules/seasons/service.js";
import { describeDb, withRollback } from "../test/db.js";
import { schema } from "./index.js";
import { DEMO_LOGINS, reseedKeepingAccounts, seed, truncateAll } from "./seed.js";

describeDb("seed", () => {
  it("fills an empty database with the registry, demo logins and club activity", () =>
    withRollback(async (db) => {
      await truncateAll(db);
      await seed(db, { today: "2026-10-16" });
      const total = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n;
      expect((await getCurrentSeason(db))?.name).toBe("2026/27");
      expect(await total(schema.classes)).toBe(9);
      expect(await total(schema.teams)).toBe(9);
      expect(await total(schema.classMembers)).toBe(72);
      expect(await total(schema.users)).toBe(DEMO_LOGINS.length);
      expect(await total(schema.roleAssignments)).toBe(DEMO_LOGINS.length);

      // The week around "today" has trainings and matches, and nearby matches have call-ups.
      const [week] = await db
        .select({ n: count() })
        .from(schema.events)
        .where(
          and(
            gte(schema.events.startsAt, new Date("2026-10-12T00:00:00Z")),
            lt(schema.events.startsAt, new Date("2026-10-19T00:00:00Z")),
          ),
        );
      expect(week?.n).toBeGreaterThanOrEqual(9 * 3);
      expect(await total(schema.eventParticipants)).toBeGreaterThan(100);
      expect(await total(schema.charges)).toBeGreaterThan(400);
      expect(await total(schema.payments)).toBeGreaterThan(100);
      expect(await total(schema.equipmentItems)).toBeGreaterThan(10);
      expect(await total(schema.incidents)).toBe(4);
      expect(await total(schema.announcements)).toBe(4);

      // No two trainings share a field at the same time.
      const clashes = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from bookings a join bookings b
              on a.space_id = b.space_id and a.id < b.id
             and a.starts_at < b.ends_at and b.starts_at < a.ends_at`,
      );
      expect(clashes.rows[0]?.n).toBe(0);

      const [guardian] = await db
        .select({ personId: schema.users.personId })
        .from(schema.users)
        .where(eq(schema.users.email, "pais@rsc.test"));
      expect(guardian?.personId).toBeTruthy();
    }));

  it(
    "replaces the demo data but keeps real logins",
    () =>
      withRollback(async (db) => {
        await truncateAll(db);
        await seed(db, { today: "2026-10-01" });
        const pedro = await createUserWithPassword(db, {
          email: "pedro@example.test",
          name: "Pedro",
          password: "a-long-password-1",
        });
        await db.insert(schema.roleAssignments).values({ userId: pedro.id, role: "admin" });

        await reseedKeepingAccounts(db, { today: "2026-10-16" });
        const total = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n;
        expect(await total(schema.users)).toBe(DEMO_LOGINS.length + 1);
        expect(await total(schema.teams)).toBe(9);
        const [account] = await db
          .select({ password: schema.accounts.password })
          .from(schema.accounts)
          .where(eq(schema.accounts.userId, pedro.id));
        expect(account?.password).toBeTruthy();
        const roles = await db
          .select({ role: schema.roleAssignments.role })
          .from(schema.roleAssignments)
          .where(eq(schema.roleAssignments.userId, pedro.id));
        expect(roles).toEqual([{ role: "admin" }]);
      }),
    30_000,
  ); // seeds twice
});
