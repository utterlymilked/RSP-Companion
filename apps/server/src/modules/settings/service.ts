import {
  type BookingSettings,
  bookingSettingsSchema,
  DEFAULT_BOOKING_APPROVER_ROLES,
} from "@rsc/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { clubSettings } from "./schema.js";

const BOOKINGS_KEY = "bookings";

/** Booking settings; the defaults apply until an admin saves them. */
export async function getBookingSettings(db: Db): Promise<BookingSettings> {
  const [row] = await db.select().from(clubSettings).where(eq(clubSettings.key, BOOKINGS_KEY));
  const parsed = bookingSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { approverRoles: [...DEFAULT_BOOKING_APPROVER_ROLES] };
}

export async function setBookingSettings(db: Db, settings: BookingSettings) {
  await db
    .insert(clubSettings)
    .values({ key: BOOKINGS_KEY, value: settings })
    .onConflictDoUpdate({ target: clubSettings.key, set: { value: settings } });
  return settings;
}
