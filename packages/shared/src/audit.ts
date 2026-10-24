/**
 * What the audit log records: reads of sensitive data about someone else, and changes to who
 * can access what. Adding a value needs a migration (it is a Postgres enum).
 */
export const AUDIT_ACTIONS = [
  "person.read_personal", // personal-tier record of someone who is not the reader or their ward
  "health.read", // any read of health data (M13), with the discipline in details
  "health.write", // a clinical record was created or changed (M13)
  "health.consent", // guardian consent for health records given or withdrawn (M13)
  "document.read", // a stored file was opened (M14), with the kind in details
  "document.write", // a file was uploaded or deleted (M14)
  "role.granted",
  "role.revoked",
  "user.person_linked",
  "invitation.created",
  "invitation.accepted",
  "invitation.resent", // a new link was emailed and the expiry reset
  "invitation.revoked", // a pending invitation was cancelled
  "user.deactivated", // signed out and blocked from signing in
  "user.reactivated",
  "admin.bootstrapped",
  "consent.changed", // a consent (image rights, transport) given or withdrawn (M17)
  "privacy.export", // a copy of a person's data was exported (M17)
  "person.erased", // a person record and everything about them was deleted (M17)
  "account.deleted", // a user deleted their own login (M17)
  "retention.purged", // the retention job deleted expired data, with counts in details (M17)
  "account.purged", // the inactive-user job deleted a login (details: reason)
  "account.deactivated", // the inactive-user job deactivated a login that belongs to a person
  "approval.decided", // an approval request was decided, with type and outcome in details
  "settings.change", // a club setting was changed (booking approver roles)
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
