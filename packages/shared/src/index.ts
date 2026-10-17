import { z } from "zod";

/** Supported UI/content locales. Portuguese (pt-PT) is the default. */
export const LOCALES = ["pt-PT", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-PT";

/** URL scheme of the native apps (`rsc://…`); keep in sync with `scheme` in apps/mobile/app.json. */
export const APP_SCHEME = "rsc";
/** URL scheme of the tester app, which installs next to the production one (ADR 0020). */
export const TESTER_APP_SCHEME = "rsc-teste";

/**
 * iOS bundle identifier and Android package of the native apps; keep in sync with app.json.
 * A placeholder until the club confirms its domain: it cannot change after the first store
 * release (ADR 0004).
 */
export const APP_ID = "pt.realsportmassama.companion";
/** Package of the tester app (staging only); no app links, no store listing (ADR 0020). */
export const TESTER_APP_ID = `${APP_ID}.teste`;

/** Web paths that open the native app when it is installed (universal links / App Links). */
export const APP_LINK_PATHS = ["/invite", "/reset-password"] as const;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./audit.ts";
export * from "./auth.ts";
export * from "./bookings.ts";
export * from "./callups.ts";
export * from "./documents.ts";
export * from "./domain.ts";
export * from "./equipment.ts";
export * from "./evaluations.ts";
export * from "./events.ts";
export * from "./feedback.ts";
export * from "./fees.ts";
export * from "./health.ts";
export * from "./imports.ts";
export * from "./incidents.ts";
export * from "./lisbon.ts";
export * from "./notifications.ts";
export * from "./people.ts";
export * from "./permissions.ts";
export * from "./pitch.ts";
export * from "./privacy.ts";
export * from "./roles.ts";
export * from "./scouting.ts";
export * from "./sensitivity.ts";
export * from "./timetable.ts";
export * from "./transport.ts";
