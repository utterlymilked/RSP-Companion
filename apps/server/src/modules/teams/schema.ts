import { STAFF_FUNCTIONS } from "@rsc/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { departments, organisations } from "../organisations/schema.js";
import { persons } from "../people/schema.js";
import { ageGroups, category, seasons } from "../seasons/schema.js";

export const staffFunction = pgEnum("staff_function", STAFF_FUNCTIONS);

/**
 * Turma: a training group in a season, run by an organisation (Escola de Futebol, club),
 * with a code ("11", "61/81"), a weekly schedule and a monthly fee. Covers one or more
 * age groups through class_age_groups.
 */
export const classes = pgTable(
  "classes",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    code: text().notNull(),
    name: text(),
    /** Monthly fee in integer cents (EUR); null when the class has no fee. */
    monthlyFeeCents: integer(),
    ...timestamps,
  },
  (t) => [
    unique("classes_season_organisation_code_key").on(t.seasonId, t.organisationId, t.code),
    check(
      "classes_fee_non_negative",
      sql`${t.monthlyFeeCents} IS NULL OR ${t.monthlyFeeCents} >= 0`,
    ),
  ],
);

export const classAgeGroups = pgTable(
  "class_age_groups",
  {
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    ageGroupId: uuid()
      .notNull()
      .references(() => ageGroups.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.classId, t.ageGroupId] })],
);

/** Weekly training slot of a class (local Europe/Lisbon wall-clock time). Space added in M6. */
export const classSchedules = pgTable(
  "class_schedules",
  {
    id: id(),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    /** ISO weekday: 1 = Monday … 7 = Sunday. */
    weekday: smallint().notNull(),
    startsAt: time().notNull(),
    endsAt: time().notNull(),
    ...timestamps,
  },
  (t) => [
    index("class_schedules_class_idx").on(t.classId),
    check("class_schedules_weekday", sql`${t.weekday} BETWEEN 1 AND 7`),
    check("class_schedules_times", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** Athlete enrolled in a class. Leaving sets leftOn; rejoining clears it. */
export const classMembers = pgTable(
  "class_members",
  {
    id: id(),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    joinedOn: date({ mode: "string" }).notNull(),
    leftOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    unique("class_members_class_person_key").on(t.classId, t.personId),
    index("class_members_person_idx").on(t.personId),
    check("class_members_dates", sql`${t.leftOn} IS NULL OR ${t.leftOn} >= ${t.joinedOn}`),
  ],
);

/** A competition squad in a season (e.g. Sub-13 A masculino), formed from classes. */
export const teams = pgTable(
  "teams",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    ageGroupId: uuid().references(() => ageGroups.id, { onDelete: "restrict" }),
    name: text().notNull(),
    category: category().notNull(),
    ...timestamps,
  },
  (t) => [unique("teams_season_organisation_name_key").on(t.seasonId, t.organisationId, t.name)],
);

/** Athlete on a team's roster. Staff are linked through staff_assignments instead. */
export const teamMembers = pgTable(
  "team_members",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    shirtNumber: smallint(),
    joinedOn: date({ mode: "string" }).notNull(),
    leftOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    unique("team_members_team_person_key").on(t.teamId, t.personId),
    index("team_members_person_idx").on(t.personId),
    check("team_members_dates", sql`${t.leftOn} IS NULL OR ${t.leftOn} >= ${t.joinedOn}`),
    check("team_members_shirt", sql`${t.shirtNumber} IS NULL OR ${t.shirtNumber} BETWEEN 1 AND 99`),
  ],
);

/**
 * What a person does in a season: coach of a class or team, nutritionist in a gabinete,
 * director of an organisation. Employer is the organisation (club, SAD, Escola, partner).
 * At most one of team / class: a coach of two teams gets two rows.
 */
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    function: staffFunction().notNull(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    departmentId: uuid().references(() => departments.id, { onDelete: "restrict" }),
    teamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    classId: uuid().references(() => classes.id, { onDelete: "cascade" }),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    index("staff_assignments_person_idx").on(t.personId),
    index("staff_assignments_team_idx").on(t.teamId),
    index("staff_assignments_class_idx").on(t.classId),
    check("staff_assignments_one_target", sql`num_nonnulls(${t.teamId}, ${t.classId}) <= 1`),
    check(
      "staff_assignments_dates",
      sql`${t.endsOn} IS NULL OR ${t.startsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`,
    ),
  ],
);

export type TrainingClass = typeof classes.$inferSelect;
export type NewTrainingClass = typeof classes.$inferInsert;
export type ClassSchedule = typeof classSchedules.$inferSelect;
export type ClassMember = typeof classMembers.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type NewStaffAssignment = typeof staffAssignments.$inferInsert;
