/**
 * Origin of the API (and of Better Auth under /api/auth). The web build is served by the API
 * server, so it uses the page's origin. Native builds have no origin and need
 * `EXPO_PUBLIC_API_URL` (inlined at build time), e.g. `http://192.168.1.10:3000` in
 * development, the staging URL in the tester app and the prod URL in the production app
 * (ADR 0020). A build is wired to one server at build time and cannot be pointed elsewhere.
 */
export function apiOrigin(
  envUrl: string | undefined,
  os: string,
  webOrigin: string | undefined,
): string {
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (os === "web" && webOrigin) return webOrigin;
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}
