import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import { fontSize, spacing, useColors } from "../theme";

/** The "‹ Voltar" link at the top of a detail screen. */
export function BackBar({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.bar, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary }]}>{t("common.back")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 40,
    marginLeft: -spacing.xs,
    gap: 2,
  },
  text: { fontSize: fontSize.md, fontWeight: "600" },
});
