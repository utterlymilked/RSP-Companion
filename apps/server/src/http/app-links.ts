import { APP_ID, APP_LINK_PATHS } from "@rsp/shared";
import { Hono } from "hono";

export interface AppLinksConfig {
  /** Apple Developer Team ID (10 characters); iOS universal links stay off without it. */
  appleTeamId?: string;
  /** SHA-256 fingerprints of the Android signing certificates; App Links stay off without. */
  androidCertSha256?: string[];
}

/**
 * The well-known files that let emailed links (invitations, password resets) open the
 * installed app instead of the browser (ADR 0004). /api paths are never claimed: magic links
 * must be verified by the server in the browser first.
 */
export function appLinksRoutes({ appleTeamId, androidCertSha256 }: AppLinksConfig) {
  const app = new Hono();
  if (appleTeamId) {
    app.get("/.well-known/apple-app-site-association", (c) =>
      c.json({
        applinks: {
          details: [
            {
              appIDs: [`${appleTeamId}.${APP_ID}`],
              components: APP_LINK_PATHS.map((path) => ({ "/": `${path}*` })),
            },
          ],
        },
      }),
    );
  }
  if (androidCertSha256?.length) {
    app.get("/.well-known/assetlinks.json", (c) =>
      c.json([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: APP_ID,
            sha256_cert_fingerprints: androidCertSha256,
          },
        },
      ]),
    );
  }
  return app;
}
