import {
  ROLES,
  type RoleGrantInput,
  type UserPersonRelationship,
  type UserPersonStatus,
} from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { persons } from "../people/schema.js";

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
    /** Set while the login is deactivated: no sessions, sign-in refused (auth.ts). */
    deactivatedAt: timestamp({ withTimezone: true }),
    /** Last time a session was created (any sign-in method); drives the inactive-user job. */
    lastSignInAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique("users_email_key").on(t.email)],
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

/**
 * A role held by a user: a capability, with no team. Which teams a coach or team manager reaches
 * comes from the person's staff assignments (ADR 0027). Access rights come from these rows
 * through ROLE_PERMISSIONS.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: role().notNull(),
    grantedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("role_assignments_user_role_key").on(t.userId, t.role),
    index("role_assignments_user_idx").on(t.userId),
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

/**
 * Which people a user is (owner) or acts for (representative; alpha). Replaces
 * `users.person_id` (ADR 0024); see owner.ts.
 * A user may have no row. Links are made by approval in the back office, never by the user.
 */
export const userPersons = pgTable(
  "user_persons",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    relationship: text().$type<UserPersonRelationship>().notNull().default("owner"),
    status: text().$type<UserPersonStatus>().notNull().default("pending"),
    approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("user_persons_user_person_key").on(t.userId, t.personId),
    index("user_persons_person_idx").on(t.personId),
    uniqueIndex("user_persons_one_owner_per_person_idx")
      .on(t.personId)
      .where(sql`${t.relationship} = 'owner' and ${t.status} <> 'revoked'`),
    uniqueIndex("user_persons_one_person_per_owner_idx")
      .on(t.userId)
      .where(sql`${t.relationship} = 'owner' and ${t.status} <> 'revoked'`),
  ],
);
