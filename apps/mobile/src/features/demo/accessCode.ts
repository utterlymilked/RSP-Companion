import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "rsc_demo_code";

/** The tester access code typed on this device (ADR 0018), kept so switching accounts needs no retyping. */
export function savedCode(): string | null {
  try {
    if (Platform.OS === "web") return window.localStorage.getItem(KEY);
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveCode(code: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (code) window.localStorage.setItem(KEY, code);
      else window.localStorage.removeItem(KEY);
    } else if (code) await SecureStore.setItemAsync(KEY, code);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Storage blocked (private window): the code just has to be typed again next time.
  }
}
