import { bookingSettingsSchema } from "@rsc/shared";
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { audit } from "../audit/service.js";
import { getBookingSettings, setBookingSettings } from "./service.js";

/** /api/settings: club settings, readable by anyone who manages users and changed only by them. */
export const settingsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("users.manage"))
    .get("/bookings", async (c) => c.json(await getBookingSettings(db)))
    .put("/bookings", validate("json", bookingSettingsSchema), async (c) => {
      const settings = await setBookingSettings(db, c.req.valid("json"));
      await audit(db, {
        actorUserId: principalOf(c).userId,
        action: "settings.change",
        tier: "general",
        details: { approverRoles: settings.approverRoles.join(",") },
      });
      return c.json(settings);
    });
