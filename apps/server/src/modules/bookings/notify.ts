import { and, inArray, isNull } from "drizzle-orm";
import { roleAssignments } from "../auth/schema.js";
import { announcementRecipients, type Channels, notifyUsers } from "../notifications/service.js";
import { getBookingSettings } from "../settings/service.js";
import type { bookings } from "./schema.js";

type BookingRow = typeof bookings.$inferSelect;

/** Users holding a club-wide approver role. */
async function approverUserIds(channels: Channels): Promise<string[]> {
  const { approverRoles } = await getBookingSettings(channels.db);
  const rows = await channels.db
    .selectDistinct({ id: roleAssignments.userId })
    .from(roleAssignments)
    .where(inArray(roleAssignments.role, approverRoles));
  return rows.map((r) => r.id);
}

/** Tells the approvers that a booking is waiting for confirmation. Generic text, ids only. */
export async function notifyBookingRequested(
  channels: Channels,
  created: readonly BookingRow[],
  actorId: string,
) {
  const first = created[0];
  if (!first || first.status !== "to_confirm") return;
  const approvers = (await approverUserIds(channels)).filter((id) => id !== actorId);
  await notifyUsers(channels, approvers, {
    kind: "booking",
    title: "Novo pedido de reserva",
    link: `/booking/${first.id}`,
  });
}

const TITLES = {
  confirmed: "Reserva confirmada",
  cancelled: "Reserva cancelada",
  moved: "Reserva alterada",
} as const;

/**
 * Tells the people a change affects: whoever made the booking and, for confirmed bookings of
 * a team, the team's staff, players and guardians. Only status, space and time changes count.
 */
export async function notifyBookingChanged(
  channels: Channels,
  before: BookingRow,
  after: BookingRow,
  actorId: string,
) {
  const moved =
    before.spaceId !== after.spaceId ||
    before.startsAt.getTime() !== after.startsAt.getTime() ||
    before.endsAt.getTime() !== after.endsAt.getTime();
  const statusChanged = before.status !== after.status;
  if (!moved && !statusChanged) return;
  const kind =
    statusChanged && after.status === "cancelled"
      ? "cancelled"
      : statusChanged && after.status === "confirmed"
        ? "confirmed"
        : "moved";
  const audience = new Set<string>();
  if (after.createdBy) audience.add(after.createdBy);
  if (after.teamId && after.status !== "to_confirm") {
    for (const id of await announcementRecipients(channels.db, after.teamId)) audience.add(id);
  }
  audience.delete(actorId);
  await notifyUsers(channels, [...audience], {
    kind: "booking",
    title: TITLES[kind],
    link: `/booking/${after.id}`,
  });
}
