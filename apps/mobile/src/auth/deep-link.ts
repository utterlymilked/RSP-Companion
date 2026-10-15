import { getSetCookie } from "@better-auth/expo/client";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { STORAGE_PREFIX } from "./client";

const COOKIE_KEY = `${STORAGE_PREFIX}_cookie`;

/** The session cookie the server appends when a magic link redirects back to the app. */
export function cookieFromUrl(url: string): string | null {
  const value = Linking.parse(url).queryParams?.cookie;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Native only. A magic link opens in the browser; after verifying it the server redirects to
 * `rsc:///?cookie=…` (the expo plugin adds the cookie only for trusted schemes). This stores
 * that cookie where the Better Auth expo client keeps it, so the app is signed in. The stored
 * value is small JSON, below the client's chunking threshold.
 */
export async function storeSessionFromUrl(url: string): Promise<boolean> {
  const cookie = cookieFromUrl(url);
  if (!cookie) return false;
  const previous = await SecureStore.getItemAsync(COOKIE_KEY);
  await SecureStore.setItemAsync(COOKIE_KEY, getSetCookie(cookie, previous ?? undefined));
  return true;
}
