import { APP_HEADERS } from "@rsc/shared";
import * as Updates from "expo-updates";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * What this install says about itself on every API request, so the server can refuse a build
 * that is too old (ADR 0028). The web app only names itself: it reloads on a new release.
 */
export function clientHeaders(): Record<string, string> {
  const headers: Record<string, string> = { [APP_HEADERS.platform]: Platform.OS };
  if (Platform.OS === "web" || !Updates.isEnabled) return headers;
  if (Updates.runtimeVersion) headers[APP_HEADERS.runtime] = Updates.runtimeVersion;
  if (Updates.createdAt) headers[APP_HEADERS.builtAt] = Updates.createdAt.toISOString();
  headers[APP_HEADERS.update] = Updates.updateId ?? "embedded";
  return headers;
}

/** What a blocked install has to do: `apk` (a new APK) or `bundle` (the latest over-the-air update). */
export type RequiredUpdate = "apk" | "bundle" | null;

let required: RequiredUpdate = null;
const listeners = new Set<() => void>();

/** Called when the server answers 426 or the published requirements say this install is too old. */
export function setRequiredUpdate(next: RequiredUpdate) {
  if (next === required) return;
  required = next;
  for (const listener of listeners) listener();
}

export function useRequiredUpdate(): RequiredUpdate {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => required,
    () => null,
  );
}

/** Notes a 426 answer: the blocking update screen takes over. The web app is never blocked. */
export async function noteUpdateRequired(res: Pick<Response, "status" | "clone">) {
  if (res.status !== 426 || Platform.OS === "web") return;
  try {
    const body = (await res.clone().json()) as { error?: { issues?: { update?: string } } };
    setRequiredUpdate(body.error?.issues?.update === "apk" ? "apk" : "bundle");
  } catch {
    setRequiredUpdate("bundle");
  }
}

/** `fetch` that reacts to the server refusing an outdated app. */
export const guardedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  await noteUpdateRequired(res);
  return res;
};
