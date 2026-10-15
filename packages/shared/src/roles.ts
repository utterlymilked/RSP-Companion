/**
 * Roles a user can hold (club-confirmed list, see docs/REQUIREMENTS.md). A user may hold
 * several. Access rights come from roles, never from staff functions (which only describe
 * what a person does). See docs/adr/0003-auth-roles-privacy.md.
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
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles that only apply to one team or class (turma). Every assignment of these roles names
 * exactly one; every other role is club-wide and names neither (a database check enforces it).
 */
export const SCOPED_ROLES = ["coach", "team_manager"] as const satisfies readonly Role[];
export type ScopedRole = (typeof SCOPED_ROLES)[number];

export function isScopedRole(role: Role): role is ScopedRole {
  return (SCOPED_ROLES as readonly Role[]).includes(role);
}

/**
 * Clinical disciplines. Health data (GDPR art. 9) is recorded per discipline and each clinical
 * role reads only its own; coaches see a derived availability status instead (M13).
 */
export const HEALTH_DISCIPLINES = ["medical", "physio", "nutrition", "psychology"] as const;
export type HealthDiscipline = (typeof HEALTH_DISCIPLINES)[number];
