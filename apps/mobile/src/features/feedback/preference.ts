import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "rsc.feedbackWidget";
type Saved = { enabled: boolean; position: { x: number; y: number } | null };
const DEFAULT: Saved = { enabled: true, position: null };

let current: Saved = DEFAULT;
let loaded = false;
const listeners = new Set<(saved: Saved) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    // Nothing saved or storage unavailable: the defaults apply.
  }
  for (const l of listeners) l(current);
}

function save(patch: Partial<Saved>) {
  current = { ...current, ...patch };
  for (const l of listeners) l(current);
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => undefined);
}

/**
 * Per-device settings of the feedback widget: whether it shows (testers can switch it off in
 * "Conta") and where the tester last left it. Not personal data; kept in local storage only.
 */
export function useFeedbackSettings() {
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
    ...saved,
    setEnabled: (enabled: boolean) => save({ enabled }),
    setPosition: (position: Saved["position"]) => save({ position }),
  };
}
