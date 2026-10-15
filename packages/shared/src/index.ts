import { z } from "zod";

/** Supported UI/content locales. Portuguese (pt-PT) is the default. */
export const LOCALES = ["pt-PT", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-PT";

/** URL scheme of the native apps (`rsp://…`); keep in sync with `scheme` in apps/mobile/app.json. */
export const APP_SCHEME = "rsp";

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
