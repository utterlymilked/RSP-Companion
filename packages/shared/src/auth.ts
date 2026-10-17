import { z } from "zod";
import type { Permission, RoleGrant } from "./permissions.ts";
import { isScopedRole, ROLES, type Role } from "./roles.ts";

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

/** PUT /api/users/:userId/active: deactivate (signs them out, blocks sign-in) or reactivate. */
export const setUserActiveSchema = z.object({ active: z.boolean() });

/** A role a user holds, with the team or class it applies to (scoped roles only). */
export interface UserRole {
  id: string;
  role: Role;
  teamId: string | null;
  classId: string | null;
  /** Name of the team or class, for scoped roles. */
  scopeName: string | null;
}

/** A row of GET /api/users. */
export interface UserSummary {
  id: string;
  email: string;
  name: string;
  personId: string | null;
  personName: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  roles: UserRole[];
}

/** GET /api/users/:userId: one user for the management screen. */
export interface UserDetail extends UserSummary {
  /** Last time one of their sessions was used (refreshed at most daily), or null. */
  lastSeenAt: string | null;
}

/** A row of GET /api/invitations: an invitation not accepted yet (possibly expired). */
export interface PendingInvitation {
  id: string;
  email: string;
  personId: string | null;
  personName: string | null;
  roles: RoleGrantInput[];
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/** GET /api/me: who is signed in and what they may do (the UI mirrors the API with it). */
export interface MeResponse {
  user: { id: string; email: string; name: string };
  personId: string | null;
  roles: RoleGrant[];
  permissions: Permission[];
  /** Holds a club-wide role chosen to approve bookings (club setting, see `BookingSettings`). */
  bookingApprover: boolean;
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
  "self_deactivation", // a user cannot deactivate their own account
  "person_has_user", // the person is already linked to another login
  "booking_conflict",
  "insufficient_stock",
  "overpayment",
  "charge_cancelled",
  "not_a_sale",
  "consent_required",
  "not_a_guardian",
  "file_too_large",
  "unsupported_file_type",
  "storage_unavailable",
  "ride_full",
  "not_called_up",
  "invalid_grantor",
  "erasure_blocked",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
