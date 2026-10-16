import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";
import type { DateTimeFieldProps } from "./DateTimeField";

/** Web build: the browser's own calendar / time input (`<input type="date" | "time">`). */
export function DateTimeField({
  label,
  value,
  onChangeText,
  mode,
  clearable,
  error,
}: DateTimeFieldProps) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.row}>
        {createElement("input", {
          type: mode,
          value,
          "aria-label": label,
          onChange: (e: { target: { value: string } }) => onChangeText(e.target.value),
          style: {
            flex: 1,
            minHeight: touchTarget,
            boxSizing: "border-box",
            border: `1px solid ${error ? colors.danger : colors.border}`,
            borderRadius: radius.md,
            padding: `0 ${spacing.md}px`,
            fontSize: fontSize.md,
            fontFamily: "inherit",
            color: colors.text,
            backgroundColor: colors.surface,
            colorScheme: "light dark",
          },
        })}
        {clearable && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
            onPress={() => onChangeText("")}
            style={styles.clear}
          >
            <Text style={{ color: colors.accent, fontSize: fontSize.md }}>{t("common.clear")}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  clear: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.sm },
  error: { fontSize: fontSize.sm },
});
