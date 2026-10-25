import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Props {
  label: string;
  onPress: () => void;
  /**
   * primary: the one action that completes the screen; secondary: a tinted alternative;
   * tertiary: a quiet text action; destructive: deletes or cancels something (tinted red).
   */
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  icon?: IconName;
  /** Small (40 pt) buttons size to their label and sit inline (in cards and rows). */
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
    tertiary: { bg: "transparent", fg: colors.primary },
    destructive: { bg: colors.dangerSoft, fg: colors.danger },
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
          <Text
            numberOfLines={2}
            style={[styles.label, compact && styles.compactLabel, { color: look.fg }]}
          >
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
    paddingVertical: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  compact: {
    minHeight: 40,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: fontSize.md, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  compactLabel: { fontSize: fontSize.sm },
  dim: { opacity: 0.6 },
});

/** Buttons side by side; they wrap onto the next line instead of overflowing on small phones. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={rowStyles.row}>{children}</View>;
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
});
