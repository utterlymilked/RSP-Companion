import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "rsc_api_origin";
/** Better Auth's native session keys (storagePrefix "rsc"): dropped so one server's login never reaches another. */
const SESSION_KEYS = ["rsc_cookie", "rsc_session_data"];

/** The API address a tester chose on this device (staging or prod), or null for the built-in one. */
export function savedServer(): string | null {
  if (Platform.OS === "web") return null;
  try {
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}

/** Saves the chosen address (null restores the built-in one) and signs this device out of the old one. */
export async function saveServer(origin: string | null): Promise<void> {
  if (origin) await SecureStore.setItemAsync(KEY, origin);
  else await SecureStore.deleteItemAsync(KEY);
  await Promise.all(SESSION_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
}
