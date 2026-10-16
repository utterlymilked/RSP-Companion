import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { minutesToClock } from "./time";

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
  onPrevious: () => void;
  onNext: () => void;
  /** Shown when the view is not on today. */
  onToday?: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <RoundButton icon="chevron-back" label={previousLabel} onPress={onPrevious} />
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

/** "Às 18:30" with half-hour steps and a "Agora" shortcut, for the floor plan. */
export function TimeStepper({
  minutes,
  onChange,
  onNow,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  /** Shown when the plan is not showing the current time. */
  onNow?: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={[styles.time, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name="time-outline" size={18} color={colors.textMuted} />
      <Text style={[styles.at, { color: colors.textMuted }]}>{t("bookings.at")}</Text>
      <RoundButton
        small
        icon="remove"
        label={t("bookings.earlier")}
        onPress={() => onChange(Math.max(0, minutes - 30))}
      />
      <Text
        accessibilityLabel={t("bookings.atTime", { time: minutesToClock(minutes) })}
        style={[styles.clock, { color: colors.text }]}
      >
        {minutesToClock(minutes)}
      </Text>
      <RoundButton
        small
        icon="add"
        label={t("bookings.later")}
        onPress={() => onChange(Math.min(23 * 60 + 30, minutes + 30))}
      />
      <View style={styles.flex} />
      {onNow ? (
        <Pressable
          accessibilityRole="button"
          onPress={onNow}
          hitSlop={8}
          style={[styles.now, { backgroundColor: colors.primarySoft }]}
        >
          <Text style={[styles.nowText, { color: colors.primary }]}>{t("bookings.now")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  small,
}: {
  icon: "chevron-back" | "chevron-forward" | "add" | "remove";
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  const colors = useColors();
  const size = small ? 36 : 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={small ? 6 : 8}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          backgroundColor: small ? colors.surface : colors.primarySoft,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={small ? 18 : 20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  middle: { flex: 1, alignItems: "center", gap: 2 },
  title: { fontSize: fontSize.lg, fontWeight: "800" },
  today: { fontSize: fontSize.sm, fontWeight: "700" },
  round: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  time: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  at: { fontSize: fontSize.sm, fontWeight: "600" },
  clock: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    minWidth: 56,
    textAlign: "center",
  },
  flex: { flex: 1 },
  now: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  nowText: { fontSize: fontSize.sm, fontWeight: "700" },
});
