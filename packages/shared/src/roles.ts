import type { StaffFunction } from "./domain.ts";

/**
 * Roles a user can hold (club-confirmed list, see docs/REQUIREMENTS.md). A user may hold
 * several. Access rights come from roles; staff functions only decide which teams a
 * coach or team manager reaches (ADR 0027). See docs/adr/0003-auth-roles-privacy.md.
 */
export const ROLES = [
  "admin", // direção
  "staff", // secretaria
  "treasurer",
  "stores", // economato
  "coach",
  "team_manager", // delegado
  "scout",
  "recruiter",
  "doctor",
  "nurse",
  "physio",
  "nutritionist",
  "psychologist",
  "sociologist",
  "athlete",
  "guardian",
  "member", // sócio
  "developer", // the app's owner/maintainer: every menu and admin screen, no clinical data (ADR 0019)
  "tester", // sees the in-app feedback widget (pre-release testing)
  "hr", // recursos humanos: reviews identity claims with the direction (ADR 0026)
  "anonymous", // self-registered, email verified, no person yet (ADR 0026): profile and settings only
  "external", // verified real person who is not in the club's records (ADR 0026)
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles that only reach the teams and classes (turmas) their holder is assigned to. The role
 * itself names no team: which ones comes from the person's staff assignments (ADR 0027).
 */
export const SCOPED_ROLES = ["coach", "team_manager"] as const satisfies readonly Role[];
export type ScopedRole = (typeof SCOPED_ROLES)[number];

/** Staff functions that make a scoped role apply to the team or class of the assignment. */
export const SCOPED_ROLE_FUNCTIONS: Record<ScopedRole, readonly StaffFunction[]> = {
  coach: ["head_coach", "assistant_coach", "goalkeeper_coach", "fitness_coach"],
  team_manager: ["team_manager"],
};

export function isScopedRole(role: Role): role is ScopedRole {
  return (SCOPED_ROLES as readonly Role[]).includes(role);
}

/**
 * Clinical disciplines. Health data (GDPR art. 9) is recorded per discipline and each clinical
 * role reads only its own; coaches see a derived availability status instead (M13).
 */
export const HEALTH_DISCIPLINES = ["medical", "physio", "nutrition", "psychology"] as const;
export type HealthDiscipline = (typeof HEALTH_DISCIPLINES)[number];
