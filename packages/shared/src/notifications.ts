import { z } from "zod";

/** What an inbox entry is about. The app opens the matching screen from `kind` and `link`. */
export const NOTIFICATION_KINDS = ["announcement", "callup", "document_expiry"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Expo push tokens look like `ExponentPushToken[...]` (or `ExpoPushToken[...]`). */
export const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(/^Expo(nent)?PushToken\[[^\]\s]+\]$/);

/** Body of POST /api/announcements. `teamId` null addresses the whole club. */
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  teamId: z.uuid().nullable().default(null),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

/** Body of PUT /api/notifications/devices: this phone's push token. */
export const registerDeviceSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(PUSH_PLATFORMS),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

/** Body of DELETE /api/notifications/devices (sign-out). */
export const unregisterDeviceSchema = z.object({ token: expoPushTokenSchema });

/** Body of PUT /api/notifications/preferences. */
export const notificationPreferencesSchema = z.object({
  push: z.boolean(),
  email: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** Defaults for a user who never changed them: push on, email off. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: false,
};

/** Query of GET /api/notifications. */
export const inboxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
