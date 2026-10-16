import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Body of POST /api/evaluations/templates: a named list of criteria scored 1..scaleMax. */
export const createEvaluationTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scaleMax: z.number().int().min(2).max(10).default(5),
  /** Criteria in display order; labels must be distinct. */
  criteria: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(30)
    .refine((labels) => new Set(labels).size === labels.length),
});
export type CreateEvaluationTemplateInput = z.infer<typeof createEvaluationTemplateSchema>;

/** Criteria and scale are fixed once created (old evaluations stay comparable); rename or retire. */
export const updateEvaluationTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});
export type UpdateEvaluationTemplateInput = z.infer<typeof updateEvaluationTemplateSchema>;

/** Body of POST /api/evaluations: one score per criterion evaluated (at least one). */
export const createEvaluationSchema = z.object({
  personId: z.uuid(),
  templateId: z.uuid(),
  evaluatedOn: z.iso.date(),
  teamId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  comment: optionalText(2000),
  scores: z
    .array(z.object({ criterionId: z.uuid(), score: z.number().int().min(1).max(10) }))
    .min(1)
    .max(30)
    .refine((s) => new Set(s.map((x) => x.criterionId)).size === s.length),
});
export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export const listEvaluationsQuerySchema = z.object({ personId: z.uuid() });
export type ListEvaluationsQuery = z.infer<typeof listEvaluationsQuerySchema>;
