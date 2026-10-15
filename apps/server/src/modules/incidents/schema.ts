import { INCIDENT_PERSON_ROLES, INCIDENT_STATUSES, INCIDENT_TYPES } from "@rsc/shared";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";
import { teams } from "../teams/schema.js";

export const incidentType = pgEnum("incident_type", INCIDENT_TYPES);
export const incidentStatus = pgEnum("incident_status", INCIDENT_STATUSES);
export const incidentPersonRole = pgEnum("incident_person_role", INCIDENT_PERSON_ROLES);

/**
 * An ocorrência. The description is free text written by the reporter; for injuries it must
 * not hold clinical detail (that belongs to M13), and the API only returns it to the
 * reporter and to roles with `incidents.read_injury` (ADR 0006).
 */
export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    type: incidentType().notNull(),
    status: incidentStatus().notNull().default("open"),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    place: text(),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    description: text().notNull(),
    followUp: text(),
    reportedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Idempotency key of an app draft; unique per reporter so a replayed draft is a no-op. */
    clientKey: uuid(),
    ...timestamps,
  },
  (t) => [
    index("incidents_occurred_idx").on(t.occurredAt),
    index("incidents_team_idx").on(t.teamId),
    unique("incidents_reporter_client_key_key").on(t.reportedBy, t.clientKey),
  ],
);

/** People involved in an incident. */
export const incidentPeople = pgTable(
  "incident_people",
  {
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    role: incidentPersonRole().notNull().default("involved"),
  },
  (t) => [primaryKey({ columns: [t.incidentId, t.personId] })],
);

export type Incident = typeof incidents.$inferSelect;
