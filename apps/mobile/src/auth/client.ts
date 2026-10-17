import { expoClient } from "@better-auth/expo/client";
import { APP_SCHEME } from "@rsc/shared";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiOrigin } from "../config";
import { savedServer } from "../server";

export const isWeb = Platform.OS === "web";

export const API_ORIGIN = apiOrigin(
  process.env.EXPO_PUBLIC_API_URL,
  Platform.OS,
  typeof window === "undefined" ? undefined : window.location?.origin,
  savedServer(),
);

/** Where native builds keep the session cookie (Keychain / Keystore via SecureStore). */
export const STORAGE_PREFIX = "rsc";

/**
 * Better Auth client. On the web it uses the httpOnly session cookie like any site; on
 * iOS/Android the expo plugin keeps the cookie in secure storage and sends it as a header
 * (ADR 0004).
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: "/api/auth",
  plugins: [
    expoClient({ scheme: APP_SCHEME, storagePrefix: STORAGE_PREFIX, storage: SecureStore }),
    magicLinkClient(),
  ],
});

/** The Cookie header for our own API calls on native; the browser handles it on web. */
export async function sessionHeaders(): Promise<Record<string, string>> {
  if (isWeb) return {};
  const cookie = authClient.getCookie ? await authClient.getCookie() : "";
  return cookie ? { cookie } : {};
}
