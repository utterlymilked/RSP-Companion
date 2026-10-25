import type {
  CreateEvaluationInput,
  CreateEvaluationTemplateInput,
  UpdateEvaluationTemplateInput,
} from "@rsc/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { athletes } from "../athletes/schema.js";
import {
  type Evaluation,
  type EvaluationCriterion,
  type EvaluationTemplate,
  evaluationCriteria,
  evaluationScores,
  evaluations,
  evaluationTemplates,
} from "./schema.js";

export type TemplateWithCriteria = EvaluationTemplate & { criteria: EvaluationCriterion[] };

export async function createTemplate(
  db: Db,
  input: CreateEvaluationTemplateInput,
): Promise<TemplateWithCriteria> {
  const [template] = await db
    .insert(evaluationTemplates)
    .values({ name: input.name, scaleMax: input.scaleMax })
    .returning();
  if (!template) throw new Error("Insert returned no row");
  const criteria = await db
    .insert(evaluationCriteria)
    .values(input.criteria.map((label, position) => ({ templateId: template.id, label, position })))
    .returning();
  return { ...template, criteria: criteria.sort((a, b) => a.position - b.position) };
}

export async function updateTemplate(
  db: Db,
  templateId: string,
  input: UpdateEvaluationTemplateInput,
): Promise<boolean> {
  const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) {
    const [row] = await db
      .select({ id: evaluationTemplates.id })
      .from(evaluationTemplates)
      .where(eq(evaluationTemplates.id, templateId));
    return Boolean(row);
  }
  const rows = await db
    .update(evaluationTemplates)
    .set(values)
    .where(eq(evaluationTemplates.id, templateId))
    .returning({ id: evaluationTemplates.id });
  return rows.length > 0;
}

export async function listTemplates(
  db: Db,
  { includeInactive }: { includeInactive: boolean },
): Promise<TemplateWithCriteria[]> {
  const templates = await db
    .select()
    .from(evaluationTemplates)
    .orderBy(asc(evaluationTemplates.name));
  const shown = includeInactive ? templates : templates.filter((t) => t.active);
  if (shown.length === 0) return [];
  const criteria = await db
    .select()
    .from(evaluationCriteria)
    .where(
      inArray(
        evaluationCriteria.templateId,
        shown.map((t) => t.id),
      ),
    )
    .orderBy(asc(evaluationCriteria.position));
  return shown.map((t) => ({ ...t, criteria: criteria.filter((c) => c.templateId === t.id) }));
}

/**
 * Records an evaluation. Every score must be for a criterion of the chosen (active)
 * template and within its scale, otherwise 400 `invalid_request`; unknown template or
 * person answers 404.
 */
export async function createEvaluation(
  db: Db,
  input: CreateEvaluationInput,
  evaluatorId: string,
): Promise<Evaluation> {
  const [template] = await db
    .select()
    .from(evaluationTemplates)
    .where(eq(evaluationTemplates.id, input.templateId));
  if (!template) throw new ApiError(404, "not_found");
  if (!template.active) throw new ApiError(400, "invalid_request");
  const criteria = await db
    .select({ id: evaluationCriteria.id })
    .from(evaluationCriteria)
    .where(eq(evaluationCriteria.templateId, template.id));
  const known = new Set(criteria.map((c) => c.id));
  for (const { criterionId, score } of input.scores) {
    if (!known.has(criterionId) || score > template.scaleMax) {
      throw new ApiError(400, "invalid_request");
    }
  }
  const { scores, ...fields } = input;
  const [athlete] = await db
    .select({ personId: athletes.personId })
    .from(athletes)
    .where(eq(athletes.id, fields.athleteId));
  if (!athlete) throw new ApiError(404, "not_found");
  const [evaluation] = await db
    .insert(evaluations)
    .values({ ...fields, personId: athlete.personId, evaluatorId })
    .returning();
  if (!evaluation) throw new Error("Insert returned no row");
  await db
    .insert(evaluationScores)
    .values(scores.map((s) => ({ evaluationId: evaluation.id, ...s })));
  return evaluation;
}

export interface EvaluationWithScores extends Evaluation {
  templateName: string;
  scaleMax: number;
  scores: { criterionId: string; label: string; score: number }[];
}

/** An athlete's evaluations, newest first, with the scores per criterion (their history). */
export async function listEvaluations(db: Db, athleteId: string): Promise<EvaluationWithScores[]> {
  const rows = await db
    .select({
      evaluation: evaluations,
      templateName: evaluationTemplates.name,
      scaleMax: evaluationTemplates.scaleMax,
    })
    .from(evaluations)
    .innerJoin(evaluationTemplates, eq(evaluationTemplates.id, evaluations.templateId))
    .where(eq(evaluations.athleteId, athleteId))
    .orderBy(desc(evaluations.evaluatedOn), desc(evaluations.createdAt))
    .limit(200);
  if (rows.length === 0) return [];
  const scores = await db
    .select({
      evaluationId: evaluationScores.evaluationId,
      criterionId: evaluationScores.criterionId,
      label: evaluationCriteria.label,
      position: evaluationCriteria.position,
      score: evaluationScores.score,
    })
    .from(evaluationScores)
    .innerJoin(evaluationCriteria, eq(evaluationCriteria.id, evaluationScores.criterionId))
    .where(
      inArray(
        evaluationScores.evaluationId,
        rows.map((r) => r.evaluation.id),
      ),
    )
    .orderBy(asc(evaluationCriteria.position));
  return rows.map(({ evaluation, templateName, scaleMax }) => ({
    ...evaluation,
    templateName,
    scaleMax,
    scores: scores
      .filter((s) => s.evaluationId === evaluation.id)
      .map(({ criterionId, label, score }) => ({ criterionId, label, score })),
  }));
}
