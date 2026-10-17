import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];

const KEY = "rsc.appearance";

let current: Appearance = "system";
let loaded = false;
const listeners = new Set<(value: Appearance) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw && (APPEARANCES as readonly string[]).includes(raw)) current = raw as Appearance;
  } catch {
    // Nothing saved or storage unavailable: follow the system.
  }
  for (const l of listeners) l(current);
}

/** The saved choice: "system" (default) follows the phone or browser, the others force a theme. */
export function useAppearance() {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    load();
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return {
    appearance: value,
    setAppearance: (next: Appearance) => {
      current = next;
      for (const l of listeners) l(current);
      AsyncStorage.setItem(KEY, next).catch(() => undefined);
    },
  };
}

/** The theme in effect: the saved choice, else the system setting. */
export function useResolvedScheme(): "light" | "dark" {
  const { appearance } = useAppearance();
  const system = useColorScheme();
  if (appearance !== "system") return appearance;
  return system === "dark" ? "dark" : "light";
}
