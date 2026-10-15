import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { ApiError } from "./errors.js";

/** zod validation of a request part; failures become 400 `invalid_request` with the issues. */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw new ApiError(400, "invalid_request", result.error.issues);
  });
