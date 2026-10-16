import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, spacing, useColors } from "../theme";

/** A titled group on a screen, with an optional "see all" style action. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={12}>
            <Text style={[styles.action, { color: colors.primary }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: "700" },
  action: { fontSize: fontSize.sm, fontWeight: "600" },
});
