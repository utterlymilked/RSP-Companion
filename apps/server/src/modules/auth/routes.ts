import {
  acceptInvitationSchema,
  createInvitationSchema,
  linkPersonSchema,
  type MeResponse,
  permissionsOf,
  roleGrantInputSchema,
} from "@rsp/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { invitationMail } from "../../mail/templates.js";
import { principalOf, requireAuth, requirePermission } from "../access/middleware.js";
import {
  acceptInvitation,
  createInvitation,
  grantRole,
  linkPerson,
  listUsers,
  revokeRole,
} from "./service.js";

const userParam = z.object({ userId: z.uuid() });
const assignmentParam = userParam.extend({ assignmentId: z.uuid() });

/** GET /api/me: the signed-in user, their roles and permissions. */
export const meRoutes = () =>
  new Hono<AppEnv>().get("/", requireAuth, (c) => {
    const p = principalOf(c);
    return c.json<MeResponse>({
      user: { id: p.userId, email: p.email, name: p.name },
      personId: p.personId,
      roles: p.grants,
      permissions: permissionsOf(p.grants),
    });
  });

/** /api/users: user administration (users.manage). */
export const usersRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("users.manage"))
    .get("/", async (c) => c.json({ users: await listUsers(db) }))
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

/** /api/invitations: invite (users.manage) and accept (public, with the emailed token). */
export const invitationsRoutes = ({ db, mailer, appUrl }: AppDeps) =>
  new Hono<AppEnv>()
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
        const url = new URL("/invite", appUrl);
        url.searchParams.set("token", token);
        await mailer.send(invitationMail(invitation.email, url.toString()));
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
