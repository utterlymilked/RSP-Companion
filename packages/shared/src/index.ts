import { z } from "zod";

/** Supported UI/content locales. Portuguese (pt-PT) is the default. */
export const LOCALES = ["pt-PT", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-PT";

/** URL scheme of the native apps (`rsc://…`); keep in sync with `scheme` in apps/mobile/app.json. */
export const APP_SCHEME = "rsc";

/**
 * iOS bundle identifier and Android package of the native apps; keep in sync with app.json.
 * A placeholder until the club confirms its domain: it cannot change after the first store
 * release (ADR 0004).
 */
export const APP_ID = "pt.realsportmassama.companion";

/** Web paths that open the native app when it is installed (universal links / App Links). */
export const APP_LINK_PATHS = ["/invite", "/reset-password"] as const;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./audit.ts";
export * from "./auth.ts";
export * from "./domain.ts";
export * from "./permissions.ts";
export * from "./roles.ts";
export * from "./sensitivity.ts";
