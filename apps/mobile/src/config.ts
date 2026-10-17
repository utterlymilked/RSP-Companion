/**
 * Origin of the API (and of Better Auth under /api/auth). The web build is served by the API
 * server, so it uses the page's origin. Native builds have no origin and need
 * `EXPO_PUBLIC_API_URL` (inlined at build time), e.g. `http://192.168.1.10:3000` in
 * development or the production URL in EAS build profiles. A native build can be pointed at
 * another stack (staging or prod, docs/OPERATIONS.md) with `override`, saved on the device.
 */
export function apiOrigin(
  envUrl: string | undefined,
  os: string,
  webOrigin: string | undefined,
  override?: string | null,
): string {
  if (override && os !== "web") return override.replace(/\/+$/, "");
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (os === "web" && webOrigin) return webOrigin;
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}

/** A server address the user typed: https only (http for a LAN address), trailing slashes dropped. */
export function parseServerUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const local = /^(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
}
