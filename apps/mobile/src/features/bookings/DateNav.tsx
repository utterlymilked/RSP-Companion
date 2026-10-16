import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";

/** Previous / title / next, with a "Hoje" shortcut when away from today. */
export function DateNav({
  title,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onToday,
}: {
  title: string;
  previousLabel: string;
  nextLabel: string;
  /** Absent when there is nothing earlier to go to (booking cannot go back in time). */
  onPrevious?: () => void;
  onNext: () => void;
  /** Shown when the view is not on today. */
  onToday?: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {onPrevious ? (
        <RoundButton icon="chevron-back" label={previousLabel} onPress={onPrevious} />
      ) : (
        <View style={styles.placeholder} />
      )}
      <View style={styles.middle}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        {onToday ? (
          <Pressable accessibilityRole="button" onPress={onToday} hitSlop={8}>
            <Text style={[styles.today, { color: colors.primary }]}>{t("bookings.today")}</Text>
          </Pressable>
        ) : null}
      </View>
      <RoundButton icon="chevron-forward" label={nextLabel} onPress={onNext} />
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: colors.primarySoft },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  middle: { flex: 1, alignItems: "center", gap: 2 },
  title: { fontSize: fontSize.lg, fontWeight: "800" },
  today: { fontSize: fontSize.sm, fontWeight: "700" },
  placeholder: { width: 44, height: 44 },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
