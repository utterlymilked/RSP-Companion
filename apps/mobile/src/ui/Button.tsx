import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  busy?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", busy, disabled }: Props) {
  const colors = useColors();
  const primary = variant === "primary";
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
        (pressed || inactive) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={[styles.label, { color: primary ? colors.onPrimary : colors.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: fontSize.md, fontWeight: "600" },
  dim: { opacity: 0.6 },
});
