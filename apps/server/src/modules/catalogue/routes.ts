import {
  changeModule,
  MODULE_IDS,
  type ModuleId,
  type ModulesResponse,
  moduleStatuses,
  setModuleSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { audit } from "../audit/service.js";
import { getModuleOverrides, setModuleOverrides } from "./service.js";

const moduleParam = z.object({ id: z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]) });

/** /api/modules: the catalogue with its state, and the switches (modules.manage). */
export const modulesRoutes = ({ db, stack }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("modules.manage"))
    .get("/", async (c) =>
      c.json<ModulesResponse>({
        stack,
        modules: moduleStatuses(stack, await getModuleOverrides(db)),
      }),
    )
    .put("/:id", validate("param", moduleParam), validate("json", setModuleSchema), async (c) => {
      const { id } = c.req.valid("param");
      const { enabled } = c.req.valid("json");
      const result = changeModule(stack, await getModuleOverrides(db), id, enabled);
      if ("error" in result) throw new ApiError(409, result.error);
      await setModuleOverrides(db, result.overrides);
      await audit(db, {
        actorUserId: principalOf(c).userId,
        action: "settings.change",
        tier: "general",
        details: { module: id, enabled: String(enabled) },
      });
      return c.json<ModulesResponse>({
        stack,
        modules: moduleStatuses(stack, result.overrides),
      });
    });
