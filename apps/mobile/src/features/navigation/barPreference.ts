import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "rsc.bottomBar";
/** Saved bar per login (user id), so two people sharing a device keep their own. */
type Saved = Record<string, string[]>;

let current: Saved = {};
let loaded = false;
const listeners = new Set<(saved: Saved) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...(JSON.parse(raw) as Saved), ...current };
  } catch {
    // Nothing saved or storage unavailable: the default bar applies.
  }
  for (const l of listeners) l(current);
}

function save(userId: string, names: string[] | null) {
  const next = { ...current };
  if (names) next[userId] = names;
  else delete next[userId];
  current = next;
  for (const l of listeners) l(current);
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => undefined);
}

/**
 * The bottom bar a user chose (ordered screen names, null = default). Local to the device, not
 * personal data (docs/adr/0029-customizable-bottom-bar.md).
 */
export function useBarPreference(userId: string | undefined) {
  const [saved, setSaved] = useState(current);
  useEffect(() => {
    listeners.add(setSaved);
    load();
    setSaved(current);
    return () => {
      listeners.delete(setSaved);
    };
  }, []);
  return {
    saved: userId ? (saved[userId] ?? null) : null,
    set: (names: string[]) => userId && save(userId, names),
    reset: () => userId && save(userId, null),
  };
}
