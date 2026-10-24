import {
  acceptInvitationSchema,
  createInvitationSchema,
  hasPermission,
  linkPersonSchema,
  type MeResponse,
  permissionsOf,
  roleGrantInputSchema,
  setUserActiveSchema,
  visibleModules,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { invitationMail } from "../../mail/templates.js";
import { principalOf, requireAuth, requirePermission } from "../access/middleware.js";
import { isApprover } from "../bookings/approval.js";
import { getModuleOverrides } from "../catalogue/service.js";
import { getBookingSettings } from "../settings/service.js";
import {
  acceptInvitation,
  createInvitation,
  getUser,
  grantRole,
  linkPerson,
  listPendingInvitations,
  listUsers,
  resendInvitation,
  revokeInvitation,
  revokeRole,
  setUserActive,
} from "./service.js";

const userParam = z.object({ userId: z.uuid() });
const invitationParam = z.object({ invitationId: z.uuid() });
const assignmentParam = userParam.extend({ assignmentId: z.uuid() });

/** GET /api/me: the signed-in user, their roles and permissions. */
export const meRoutes = ({ db, stack }: AppDeps) =>
  new Hono<AppEnv>().get("/", requireAuth, async (c) => {
    const p = principalOf(c);
    return c.json<MeResponse>({
      user: { id: p.userId, email: p.email, name: p.name },
      personId: p.personId,
      roles: p.grants,
      permissions: permissionsOf(p.grants),
      bookingApprover: isApprover(p, (await getBookingSettings(db)).approverRoles),
      modules: visibleModules(
        stack,
        await getModuleOverrides(db),
        hasPermission(p.grants, "modules.beta"),
      ),
    });
  });

/** /api/users: user administration (users.manage). */
export const usersRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("users.manage"))
    .get("/", async (c) => c.json({ users: await listUsers(db) }))
    .get("/:userId", validate("param", userParam), async (c) =>
      c.json({ user: await getUser(db, c.req.valid("param").userId) }),
    )
    .put(
      "/:userId/active",
      validate("param", userParam),
      validate("json", setUserActiveSchema),
      async (c) => {
        const { userId } = c.req.valid("param");
        const { active } = c.req.valid("json");
        await setUserActive(db, { userId, active, changedBy: principalOf(c).userId });
        return c.body(null, 204);
      },
    )
    .post(
      "/:userId/roles",
      validate("param", userParam),
      validate("json", roleGrantInputSchema),
      async (c) => {
        const { userId } = c.req.valid("param");
        const grant = c.req.valid("json");
        const row = await grantRole(db, { userId, grant, grantedBy: principalOf(c).userId });
        return c.json(
          { id: row.id, role: row.role, teamId: row.teamId, classId: row.classId },
          201,
        );
      },
    )
    .delete("/:userId/roles/:assignmentId", validate("param", assignmentParam), async (c) => {
      const { userId, assignmentId } = c.req.valid("param");
      await revokeRole(db, { userId, assignmentId, revokedBy: principalOf(c).userId });
      return c.body(null, 204);
    })
    .put(
      "/:userId/person",
      validate("param", userParam),
      validate("json", linkPersonSchema),
      async (c) => {
        const { userId } = c.req.valid("param");
        const { personId } = c.req.valid("json");
        await linkPerson(db, { userId, personId, linkedBy: principalOf(c).userId });
        return c.body(null, 204);
      },
    );

/** The accept link emailed with an invitation. */
const inviteUrl = (appUrl: string, token: string) => {
  const url = new URL("/invite", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
};

/**
 * /api/invitations: list, invite, resend and revoke (users.manage), and accept (public, with
 * the emailed token).
 */
export const invitationsRoutes = ({ db, mailer, appUrl }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", requirePermission("users.manage"), async (c) =>
      c.json({ invitations: await listPendingInvitations(db) }),
    )
    .post(
      "/:invitationId/resend",
      requirePermission("users.manage"),
      validate("param", invitationParam),
      async (c) => {
        const { invitation, token } = await resendInvitation(db, {
          invitationId: c.req.valid("param").invitationId,
          resentBy: principalOf(c).userId,
        });
        await mailer.send(invitationMail(invitation.email, inviteUrl(appUrl, token)));
        return c.json({ id: invitation.id, expiresAt: invitation.expiresAt.toISOString() });
      },
    )
    .delete(
      "/:invitationId",
      requirePermission("users.manage"),
      validate("param", invitationParam),
      async (c) => {
        await revokeInvitation(db, {
          invitationId: c.req.valid("param").invitationId,
          revokedBy: principalOf(c).userId,
        });
        return c.body(null, 204);
      },
    )
    .post(
      "/",
      requirePermission("users.manage"),
      validate("json", createInvitationSchema),
      async (c) => {
        const input = c.req.valid("json");
        const { invitation, token } = await createInvitation(db, {
          ...input,
          invitedBy: principalOf(c).userId,
        });
        await mailer.send(invitationMail(invitation.email, inviteUrl(appUrl, token)));
        return c.json(
          {
            id: invitation.id,
            email: invitation.email,
            expiresAt: invitation.expiresAt.toISOString(),
          },
          201,
        );
      },
    )
    .post("/accept", validate("json", acceptInvitationSchema), async (c) => {
      const user = await acceptInvitation(db, c.req.valid("json"));
      return c.json({ userId: user.id, email: user.email }, 201);
    });
