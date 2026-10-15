import { z } from "zod";
import type { Permission, RoleGrant } from "./permissions.ts";
import { isScopedRole, ROLES } from "./roles.ts";

/** Password rules, shared by invitation acceptance, password reset and the admin script. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** A role to grant: scoped roles (coach, team manager) name one team or class, others none. */
export const roleGrantInputSchema = z
  .object({
    role: z.enum(ROLES),
    teamId: z.uuid().nullish(),
    classId: z.uuid().nullish(),
  })
  .transform((g) => ({ role: g.role, teamId: g.teamId ?? null, classId: g.classId ?? null }))
  .refine(
    (g) => {
      const targets = Number(g.teamId !== null) + Number(g.classId !== null);
      return isScopedRole(g.role) ? targets === 1 : targets === 0;
    },
    { message: "scoped roles need exactly one team or class; other roles need none" },
  );
export type RoleGrantInput = z.infer<typeof roleGrantInputSchema>;

export const createInvitationSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  /** The person record this user is (staff member, guardian, adult athlete). */
  personId: z.uuid().nullish(),
  roles: z.array(roleGrantInputSchema).min(1).max(20),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const linkPersonSchema = z.object({ personId: z.uuid().nullable() });

/** GET /api/me: who is signed in and what they may do (the UI mirrors the API with it). */
export interface MeResponse {
  user: { id: string; email: string; name: string };
  personId: string | null;
  roles: RoleGrant[];
  permissions: Permission[];
}

/** Error codes the API returns in `{ error: { code } }`; the web app translates them. */
export const API_ERROR_CODES = [
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "invitation_invalid",
  "user_exists",
  "last_admin",
  "booking_conflict",
  "insufficient_stock",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
