import {
  type BookingSettings,
  bookingSettingsSchema,
  DEFAULT_BOOKING_APPROVER_ROLES,
  DEFAULT_IDENTITY_RETENTION,
  type IdentityRetention,
  identityRetentionSchema,
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

const IDENTITY_RETENTION_KEY = "identity_retention";

/** How long identity evidence is kept (ADR 0026 section 10); the defaults apply until saved. */
export async function getIdentityRetention(db: Db): Promise<IdentityRetention> {
  const [row] = await db
    .select()
    .from(clubSettings)
    .where(eq(clubSettings.key, IDENTITY_RETENTION_KEY));
  const parsed = identityRetentionSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...DEFAULT_IDENTITY_RETENTION };
}

export async function setIdentityRetention(db: Db, settings: IdentityRetention) {
  await db
    .insert(clubSettings)
    .values({ key: IDENTITY_RETENTION_KEY, value: settings })
    .onConflictDoUpdate({ target: clubSettings.key, set: { value: settings } });
  return settings;
}
