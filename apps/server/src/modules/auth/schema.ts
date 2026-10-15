import { ROLES, type RoleGrantInput, SCOPED_ROLES } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { persons } from "../people/schema.js";
import { classes, teams } from "../teams/schema.js";

// Better Auth's tables (user, session, account, verification), with our names and UUID keys.
// Their columns are Better Auth's contract: change them only together with its options in
// auth.ts. See docs/adr/0003-auth-roles-privacy.md.

/** A login. Linked to at most one person; minors usually have none (guardians act for them). */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    personId: uuid().references(() => persons.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique("users_email_key").on(t.email), unique("users_person_key").on(t.personId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [unique("sessions_token_key").on(t.token), index("sessions_user_idx").on(t.userId)],
);

/** Sign-in methods of a user; `providerId = 'credential'` holds the password hash. */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/** One-time tokens of Better Auth (password reset, magic links). */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const role = pgEnum("role", ROLES);

const scopedRoles = sql.raw(SCOPED_ROLES.map((r) => `'${r}'`).join(", "));

/**
 * A role held by a user. Coach and team manager name exactly one team or class; every other
 * role is club-wide. Access rights come from these rows through ROLE_PERMISSIONS.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: role().notNull(),
    teamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    classId: uuid().references(() => classes.id, { onDelete: "cascade" }),
    grantedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("role_assignments_grant_key")
      .on(t.userId, t.role, t.teamId, t.classId)
      .nullsNotDistinct(),
    index("role_assignments_user_idx").on(t.userId),
    check(
      "role_assignments_scope",
      sql`CASE WHEN ${t.role} IN (${scopedRoles}) THEN num_nonnulls(${t.teamId}, ${t.classId}) = 1 ELSE num_nonnulls(${t.teamId}, ${t.classId}) = 0 END`,
    ),
  ],
);

/**
 * Invitation to create a login. Only the SHA-256 of the token is stored; the token itself is
 * sent by email once. Accepting creates the user with these roles and person link.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    email: text().notNull(),
    tokenHash: text().notNull(),
    personId: uuid().references(() => persons.id, { onDelete: "cascade" }),
    roles: jsonb().$type<RoleGrantInput[]>().notNull(),
    invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("invitations_token_hash_key").on(t.tokenHash),
    index("invitations_email_idx").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type NewRoleAssignment = typeof roleAssignments.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
