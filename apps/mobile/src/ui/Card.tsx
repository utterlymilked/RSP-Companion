import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { elevation, radius, spacing, useColors } from "../theme";

interface Props {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Rows inside the card draw their own padding and dividers. */
  flush?: boolean;
  style?: ViewStyle;
}

/** A raised surface that groups related content. Pressable when given `onPress`. */
export function Card({ children, onPress, accessibilityLabel, flush, style }: Props) {
  const colors = useColors();
  const base = [
    styles.card,
    flush ? styles.flush : null,
    { backgroundColor: colors.surface, borderColor: colors.border },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation,
  },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
});
