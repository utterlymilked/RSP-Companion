import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../theme";

/** What a list shows when it has nothing yet: an icon and one short sentence. */
export function EmptyState({
  icon = "file-tray-outline",
  text,
}: {
  icon?: ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.box}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.text, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: fontSize.md, textAlign: "center", maxWidth: 280 },
});
