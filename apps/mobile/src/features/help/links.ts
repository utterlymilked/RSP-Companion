import { Linking } from "react-native";

/**
 * The only addresses the "production app" screen can open. They are fixed here (never read from
 * the server, a query string or user input), so the screen cannot be turned into an open
 * redirect. Both are https. The APK is a GitHub release asset of this repository (tag
 * `android-prod`, see `.github/workflows/android-apk.yml`); its SHA-256 is in the release notes.
 */
export const PROD_WEB_URL = "https://prod.178-105-48-29.sslip.io";
export const PROD_APK_URL =
  "https://github.com/utterlymilked/RSP-Companion/releases/download/android-prod/rsc-companion-production.apk";
export const PROD_RELEASE_URL =
  "https://github.com/utterlymilked/RSP-Companion/releases/tag/android-prod";

const ALLOWED: readonly string[] = [PROD_WEB_URL, PROD_APK_URL, PROD_RELEASE_URL];

/** Opens one of the fixed addresses above; anything else is refused. On the web it opens a new tab with `noopener`. */
export async function openAllowedLink(url: string): Promise<boolean> {
  if (!ALLOWED.includes(url)) return false;
  await Linking.openURL(url);
  return true;
}
