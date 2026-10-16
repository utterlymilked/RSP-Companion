import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Props {
  label: string;
  onPress: () => void;
  /** primary: the main action; secondary: a tinted alternative; ghost: a quiet text action. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  /** Compact buttons sit inline (in cards and rows) instead of taking the full width. */
  compact?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** For screen readers when the visible label is ambiguous in a list ("Retirar" what). */
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  compact,
  busy,
  disabled,
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  const inactive = disabled || busy;
  const look = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.primarySoft, fg: colors.primary },
    ghost: { bg: "transparent", fg: colors.primary },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: look.bg },
        (pressed || inactive) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 16 : 20} color={look.fg} /> : null}
          <Text style={[styles.label, compact && styles.compactLabel, { color: look.fg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  compact: {
    minHeight: 40,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  label: { fontSize: fontSize.md, fontWeight: "600" },
  compactLabel: { fontSize: fontSize.sm },
  dim: { opacity: 0.6 },
});
