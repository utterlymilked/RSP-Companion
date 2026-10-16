import { relations } from "drizzle-orm";
import { roleAssignments, users } from "../modules/auth/schema.js";
import { departments, organisations } from "../modules/organisations/schema.js";
import { guardianships, memberships, persons, players } from "../modules/people/schema.js";
import { ageGroups, seasons } from "../modules/seasons/schema.js";
import {
  classAgeGroups,
  classes,
  classMembers,
  classSchedules,
  staffAssignments,
  teamMembers,
  teams,
} from "../modules/teams/schema.js";

// Relations for Drizzle's query API (db.query.x.findMany({ with })). They live in one file
// because they cross modules; they do not change the database.

export const organisationsRelations = relations(organisations, ({ many }) => ({
  departments: many(departments),
}));

export const departmentsRelations = relations(departments, ({ one }) => ({
  organisation: one(organisations, {
    fields: [departments.organisationId],
    references: [organisations.id],
  }),
}));

export const personsRelations = relations(persons, ({ one, many }) => ({
  guardians: many(guardianships, { relationName: "child" }),
  children: many(guardianships, { relationName: "guardian" }),
  player: one(players),
  memberships: many(memberships),
  classMemberships: many(classMembers),
  teamMemberships: many(teamMembers),
  staffAssignments: many(staffAssignments),
}));

export const playersRelations = relations(players, ({ one }) => ({
  person: one(persons, { fields: [players.personId], references: [persons.id] }),
}));

export const guardianshipsRelations = relations(guardianships, ({ one }) => ({
  guardian: one(persons, {
    fields: [guardianships.guardianId],
    references: [persons.id],
    relationName: "guardian",
  }),
  child: one(persons, {
    fields: [guardianships.childId],
    references: [persons.id],
    relationName: "child",
  }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  person: one(persons, { fields: [memberships.personId], references: [persons.id] }),
  organisation: one(organisations, {
    fields: [memberships.organisationId],
    references: [organisations.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  ageGroups: many(ageGroups),
  classes: many(classes),
  teams: many(teams),
}));

export const ageGroupsRelations = relations(ageGroups, ({ one }) => ({
  season: one(seasons, { fields: [ageGroups.seasonId], references: [seasons.id] }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  season: one(seasons, { fields: [classes.seasonId], references: [seasons.id] }),
  organisation: one(organisations, {
    fields: [classes.organisationId],
    references: [organisations.id],
  }),
  ageGroups: many(classAgeGroups),
  schedules: many(classSchedules),
  members: many(classMembers),
  staff: many(staffAssignments),
}));

export const classAgeGroupsRelations = relations(classAgeGroups, ({ one }) => ({
  class: one(classes, { fields: [classAgeGroups.classId], references: [classes.id] }),
  ageGroup: one(ageGroups, { fields: [classAgeGroups.ageGroupId], references: [ageGroups.id] }),
}));

export const classSchedulesRelations = relations(classSchedules, ({ one }) => ({
  class: one(classes, { fields: [classSchedules.classId], references: [classes.id] }),
}));

export const classMembersRelations = relations(classMembers, ({ one }) => ({
  class: one(classes, { fields: [classMembers.classId], references: [classes.id] }),
  person: one(persons, { fields: [classMembers.personId], references: [persons.id] }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  season: one(seasons, { fields: [teams.seasonId], references: [seasons.id] }),
  organisation: one(organisations, {
    fields: [teams.organisationId],
    references: [organisations.id],
  }),
  ageGroup: one(ageGroups, { fields: [teams.ageGroupId], references: [ageGroups.id] }),
  members: many(teamMembers),
  staff: many(staffAssignments),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  person: one(persons, { fields: [teamMembers.personId], references: [persons.id] }),
}));

export const staffAssignmentsRelations = relations(staffAssignments, ({ one }) => ({
  person: one(persons, { fields: [staffAssignments.personId], references: [persons.id] }),
  season: one(seasons, { fields: [staffAssignments.seasonId], references: [seasons.id] }),
  organisation: one(organisations, {
    fields: [staffAssignments.organisationId],
    references: [organisations.id],
  }),
  department: one(departments, {
    fields: [staffAssignments.departmentId],
    references: [departments.id],
  }),
  team: one(teams, { fields: [staffAssignments.teamId], references: [teams.id] }),
  class: one(classes, { fields: [staffAssignments.classId], references: [classes.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  person: one(persons, { fields: [users.personId], references: [persons.id] }),
  roles: many(roleAssignments, { relationName: "holder" }),
}));

export const roleAssignmentsRelations = relations(roleAssignments, ({ one }) => ({
  user: one(users, {
    fields: [roleAssignments.userId],
    references: [users.id],
    relationName: "holder",
  }),
  team: one(teams, { fields: [roleAssignments.teamId], references: [teams.id] }),
  class: one(classes, { fields: [roleAssignments.classId], references: [classes.id] }),
}));
