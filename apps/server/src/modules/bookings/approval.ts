import { ROLE_PERMISSIONS, type Role } from "@rsc/shared";
import type { Db } from "../../db/index.js";
import { forbidden } from "../../http/errors.js";
import { type Principal, readScope } from "../access/service.js";
import { getBookingSettings } from "../settings/service.js";

/** True when the user holds a club-wide role in `approverRoles`; a developer (ADR 0019) always approves. */
export const isApprover = (principal: Principal, approverRoles: readonly Role[]) =>
  principal.grants.some(
    (g) =>
      g.teamId === null &&
      g.classId === null &&
      (g.role === "developer" || approverRoles.includes(g.role)),
  );

/**
 * What a user may do with bookings:
 * - `approver`: anything (the club setting `approverRoles`, default direção and secretaria);
 * - `requester`: creates `to_confirm` bookings and withdraws them. `teamIds` are the teams
 *   they may book for ("all" for an office role that is not an approver); with `ownOnly`
 *   (staff and gabinetes that only hold `bookings.request`) they touch just their own
 *   bookings and book for no team.
 */
export type BookingMode =
  | { kind: "approver" }
  | { kind: "requester"; teamIds: "all" | string[]; ownOnly: boolean };

export async function bookingMode(db: Db, principal: Principal): Promise<BookingMode> {
  const { approverRoles } = await getBookingSettings(db);
  if (isApprover(principal, approverRoles)) return { kind: "approver" };
  const write = readScope(principal, "bookings.write");
  if (write === "all") return { kind: "requester", teamIds: "all", ownOnly: false };
  if (write.teamIds.length > 0) {
    return { kind: "requester", teamIds: write.teamIds, ownOnly: false };
  }
  const canRequest = principal.grants.some((g) =>
    ROLE_PERMISSIONS[g.role].includes("bookings.request"),
  );
  if (canRequest) return { kind: "requester", teamIds: [], ownOnly: true };
  throw forbidden();
}
