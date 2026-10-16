/**
 * What the audit log records: reads of sensitive data about someone else, and changes to who
 * can access what. Adding a value needs a migration (it is a Postgres enum).
 */
export const AUDIT_ACTIONS = [
  "person.read_personal", // personal-tier record of someone who is not the reader or their ward
  "health.read", // any read of health data (M13), with the discipline in details
  "health.write", // a clinical record was created or changed (M13)
  "health.consent", // guardian consent for health records given or withdrawn (M13)
  "role.granted",
  "role.revoked",
  "user.person_linked",
  "invitation.created",
  "invitation.accepted",
  "admin.bootstrapped",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
