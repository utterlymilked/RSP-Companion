import { APP_SCHEME, TESTER_APP_SCHEME } from "@rsc/shared";
import { Platform } from "react-native";

/**
 * Which build this is (ADR 0020). The store/club app is `production` and talks only to the
 * prod server; the `tester` app (own package, installs next to it) talks only to staging and
 * carries the tester tools. Set at build time by `APP_VARIANT` (app.config.js) and
 * `EXPO_PUBLIC_APP_VARIANT` (inlined by Metro); anything else, including local development
 * and the web build, counts as `tester`.
 */
export const IS_PRODUCTION_APP = process.env.EXPO_PUBLIC_APP_VARIANT === "production";

/** Demo-account picker and feedback bubble: never in the production app. The web app is one build for both stacks, so the server decides there (DEMO_MODE, feedback permission). */
export const TESTER_TOOLS = Platform.OS === "web" || !IS_PRODUCTION_APP;

export const URL_SCHEME = IS_PRODUCTION_APP ? APP_SCHEME : TESTER_APP_SCHEME;
