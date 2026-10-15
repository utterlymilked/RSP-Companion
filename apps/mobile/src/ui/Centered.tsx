import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { spacing, useColors } from "../theme";

/** Full-screen centred content: the loading spinner, or a message with a retry button. */
export function Centered({ children }: { children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {children ?? <ActivityIndicator color={colors.primary} size="large" />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
});
