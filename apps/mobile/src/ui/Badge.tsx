import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../theme";

export type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger";

/** A small status label, e.g. "Cancelado" or "Em atraso". */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const colors = useColors();
  const look = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    primary: { bg: colors.primarySoft, fg: colors.primary },
    accent: { bg: colors.accent, fg: colors.onAccent },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }]}>
      <Text style={[styles.text, { color: look.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { fontSize: fontSize.xs, fontWeight: "700" },
});
