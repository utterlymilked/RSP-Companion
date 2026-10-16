import {
  createAnnouncementSchema,
  inboxQuerySchema,
  notificationPreferencesSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { readScope } from "../access/service.js";
import {
  deleteAnnouncement,
  getAnnouncement,
  getPreferences,
  listAnnouncements,
  listInbox,
  markRead,
  ownsNotification,
  publishAnnouncement,
  registerDevice,
  setPreferences,
  unregisterDevice,
} from "./service.js";

const announcementParam = z.object({ announcementId: z.uuid() });
const notificationParam = z.object({ notificationId: z.uuid() });

/** Whether the principal may address `teamId` (null = whole club) with announcements. */
function mayAnnounce(principal: ReturnType<typeof principalOf>, teamId: string | null) {
  const scope = readScope(principal, "announcements.write");
  if (scope === "all") return true;
  return teamId !== null && scope.teamIds.includes(teamId);
}

/** Anyone holding `announcements.write` somewhere may list; `mayAnnounce` checks the audience. */
function holdsAnnounce(principal: ReturnType<typeof principalOf>) {
  const scope = readScope(principal, "announcements.write");
  return scope === "all" || scope.teamIds.length > 0;
}

/**
 * /api/announcements: club and team announcements (ADR 0010). Admin and secretaria address the
 * club or any team; coaches and delegados only their own team. Readers get announcements in
 * their inbox (`/api/notifications`), so there is no read permission to hold.
 */
export const announcementsRoutes = ({ db, mailer, push, appUrl }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      if (!holdsAnnounce(principalOf(c))) throw forbidden();
      const scope = readScope(principalOf(c), "announcements.write");
      const teamIds = scope === "all" ? undefined : scope.teamIds;
      return c.json({ announcements: await listAnnouncements(db, teamIds) });
    })
    .post("/", validate("json", createAnnouncementSchema), async (c) => {
      const principal = principalOf(c);
      const input = c.req.valid("json");
      if (!mayAnnounce(principal, input.teamId)) throw forbidden();
      const result = await writeOrApiError(db, (tx) =>
        publishAnnouncement({ db: tx, mailer, push, appUrl }, input, principal.userId),
      );
      return c.json({ announcement: result.announcement, delivered: result.delivered }, 201);
    })
    .delete("/:announcementId", validate("param", announcementParam), async (c) => {
      if (!holdsAnnounce(principalOf(c))) throw forbidden();
      const found = await getAnnouncement(db, c.req.valid("param").announcementId);
      if (!found) throw notFound();
      if (!mayAnnounce(principalOf(c), found.teamId)) throw forbidden();
      await deleteAnnouncement(db, found.id);
      return c.body(null, 204);
    });

/** /api/notifications: the signed-in user's own inbox, push devices and channel preferences. */
export const notificationsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", validate("query", inboxQuerySchema), async (c) =>
      c.json(await listInbox(db, principalOf(c).userId, c.req.valid("query").limit)),
    )
    .post("/read-all", async (c) =>
      c.json({ marked: await markRead(db, principalOf(c).userId, null) }),
    )
    .post("/:notificationId/read", validate("param", notificationParam), async (c) => {
      const { userId } = principalOf(c);
      const { notificationId } = c.req.valid("param");
      if (!(await ownsNotification(db, userId, notificationId))) throw notFound();
      await markRead(db, userId, notificationId);
      return c.body(null, 204);
    })
    .put("/devices", validate("json", registerDeviceSchema), async (c) => {
      await registerDevice(db, principalOf(c).userId, c.req.valid("json"));
      return c.body(null, 204);
    })
    .delete("/devices", validate("json", unregisterDeviceSchema), async (c) => {
      await unregisterDevice(db, principalOf(c).userId, c.req.valid("json").token);
      return c.body(null, 204);
    })
    .get("/preferences", async (c) =>
      c.json({ preferences: await getPreferences(db, principalOf(c).userId) }),
    )
    .put("/preferences", validate("json", notificationPreferencesSchema), async (c) => {
      await setPreferences(db, principalOf(c).userId, c.req.valid("json"));
      return c.json({ preferences: c.req.valid("json") });
    });
