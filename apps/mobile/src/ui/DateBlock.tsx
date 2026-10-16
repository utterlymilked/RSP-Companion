import { StyleSheet, Text, View } from "react-native";
import { dateParts } from "../features/bookings/time";
import { fontSize, radius, useColors } from "../theme";

/** A calendar-page badge for a YYYY-MM-DD date: weekday, day number and month. */
export function DateBlock({ date, locale }: { date: string; locale: string }) {
  const colors = useColors();
  const { weekday, day, month } = dateParts(date, locale);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { backgroundColor: colors.primarySoft }]}
    >
      <Text style={[styles.small, { color: colors.primary }]}>{weekday.replace(".", "")}</Text>
      <Text style={[styles.day, { color: colors.primary }]}>{day}</Text>
      <Text style={[styles.small, { color: colors.primary }]}>{month.replace(".", "")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: 52,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: "center",
  },
  small: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase" },
  day: { fontSize: fontSize.lg, fontWeight: "800", lineHeight: 24 },
});
