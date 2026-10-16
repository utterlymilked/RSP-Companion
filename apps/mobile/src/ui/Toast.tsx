import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, fontSize, radius, spacing, useColors } from "../theme";

type Tone = "success" | "error";
interface ToastMessage {
  id: number;
  text: string;
  tone: Tone;
}

const DURATION_MS = 4000;
let counter = 0;
let current: ToastMessage | null = null;
const listeners = new Set<(toast: ToastMessage | null) => void>();
const publish = (toast: ToastMessage | null) => {
  current = toast;
  for (const listener of listeners) listener(toast);
};

/** Shows a short message at the bottom of the screen for a few seconds, from anywhere. */
export function showToast(text: string, tone: Tone = "success") {
  publish({ id: ++counter, text, tone });
}

/** Renders the current toast; mounted once in the root layout. */
export function ToastHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(current);

  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => publish(current?.id === toast.id ? null : current), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const ok = toast.tone === "success";
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 72 }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, elevation, { backgroundColor: colors.header }]}
      >
        <Ionicons
          name={ok ? "checkmark-circle" : "alert-circle"}
          size={20}
          color={ok ? colors.accent : colors.danger}
        />
        <Text style={[styles.text, { color: colors.onHeader }]}>{toast.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxWidth: 480,
  },
  text: { fontSize: fontSize.md, fontWeight: "600", flexShrink: 1 },
});
