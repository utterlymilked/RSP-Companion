/**
 * Where the API lives. The web build is served by the API server, so it uses the same
 * origin. Native builds have no origin and need `EXPO_PUBLIC_API_URL` (inlined at build
 * time), e.g. `http://192.168.1.10:3000` in development or the production URL in EAS.
 */
export function apiBaseUrl(envUrl: string | undefined, os: string): string {
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (os === "web") return "/";
  throw new Error("EXPO_PUBLIC_API_URL is required for native builds");
}
