import { Linking } from "react-native";

/**
 * The only addresses the "production app" screen can open. They are fixed here (never read from
 * the server, a query string or user input), so the screen cannot be turned into an open
 * redirect. All are https. The APK is served by the prod server itself (`/download/android.apk`,
 * put there by the Ops task `publish-apk` after each build of `.github/workflows/android-apk.yml`),
 * not by GitHub, whose downloads time out for some users.
 */
export const PROD_WEB_URL = "https://prod.178-105-48-29.sslip.io";
export const PROD_APK_URL = `${PROD_WEB_URL}/download/android.apk`;

const ALLOWED: readonly string[] = [PROD_WEB_URL, PROD_APK_URL];

/** Opens one of the fixed addresses above; anything else is refused. On the web it opens a new tab with `noopener`. */
export async function openAllowedLink(url: string): Promise<boolean> {
  if (!ALLOWED.includes(url)) return false;
  await Linking.openURL(url);
  return true;
}
