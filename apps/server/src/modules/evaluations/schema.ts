import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "../../db/columns.js";
import { users } from "../auth/schema.js";
import { persons } from "../people/schema.js";
import { teams } from "../teams/schema.js";

/** A configurable evaluation form: criteria scored 1..scaleMax. Criteria never change. */
export const evaluationTemplates = pgTable(
  "evaluation_templates",
  {
    id: id(),
    name: text().notNull().unique("evaluation_templates_name_key"),
    scaleMax: integer().notNull().default(5),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [check("evaluation_templates_scale_check", sql`${t.scaleMax} between 2 and 10`)],
);

export const evaluationCriteria = pgTable(
  "evaluation_criteria",
  {
    id: id(),
    templateId: uuid()
      .notNull()
      .references(() => evaluationTemplates.id, { onDelete: "restrict" }),
    label: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [unique("evaluation_criteria_template_position_key").on(t.templateId, t.position)],
);

/** One evaluation of an athlete on a date, by one evaluator. Personal-tier performance data. */
export const evaluations = pgTable(
  "evaluations",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    templateId: uuid()
      .notNull()
      .references(() => evaluationTemplates.id, { onDelete: "restrict" }),
    evaluatedOn: date({ mode: "string" }).notNull(),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    comment: text(),
    evaluatorId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("evaluations_person_idx").on(t.personId, t.evaluatedOn)],
);

export const evaluationScores = pgTable(
  "evaluation_scores",
  {
    evaluationId: uuid()
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    criterionId: uuid()
      .notNull()
      .references(() => evaluationCriteria.id, { onDelete: "restrict" }),
    score: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.evaluationId, t.criterionId] }),
    check("evaluation_scores_score_check", sql`${t.score} >= 1`),
  ],
);

export type EvaluationTemplate = typeof evaluationTemplates.$inferSelect;
export type EvaluationCriterion = typeof evaluationCriteria.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
