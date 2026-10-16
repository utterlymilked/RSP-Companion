import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { DateNav } from "./DateNav";
import { addDays, dateParts, dayHeading, mondayOf, todayLisbon, weekTitle } from "./time";

/**
 * A week of days to tap, with the previous and next week either side (Google Calendar's and
 * TheFork's day strip). A dot marks days that have something on.
 */
export function WeekStrip({
  selected,
  onSelect,
  marked,
  minDate,
}: {
  selected: string;
  onSelect: (day: string) => void;
  marked?: (day: string) => boolean;
  /** Days before it cannot be picked (booking in the past). */
  minDate?: string;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const today = todayLisbon();
  const monday = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const moveWeek = (weeks: number) => {
    const day = addDays(selected, weeks * 7);
    onSelect(minDate && day < minDate ? minDate : day);
  };
  return (
    <View style={styles.wrap}>
      <DateNav
        title={weekTitle(monday, i18n.language)}
        previousLabel={t("bookings.previous")}
        nextLabel={t("bookings.next")}
        onPrevious={minDate && addDays(monday, -1) < minDate ? undefined : () => moveWeek(-1)}
        onNext={() => moveWeek(1)}
        onToday={selected !== today ? () => onSelect(today) : undefined}
      />
      <View style={styles.strip}>
        {days.map((day) => {
          const parts = dateParts(day, i18n.language);
          const active = day === selected;
          const isToday = day === today;
          const disabled = !!minDate && day < minDate;
          const fg = active ? colors.onPrimary : disabled ? colors.border : colors.text;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={dayHeading(day, i18n.language)}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(day)}
              style={({ pressed }) => [
                styles.day,
                active && { backgroundColor: colors.primary },
                !active && isToday && { borderColor: colors.primary, borderWidth: 1.5 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  {
                    color: active ? colors.onPrimary : disabled ? colors.border : colors.textMuted,
                  },
                ]}
              >
                {parts.weekday.replace(".", "").slice(0, 3)}
              </Text>
              <Text style={[styles.dayNumber, { color: fg }]}>{parts.day}</Text>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: marked?.(day)
                      ? active
                        ? colors.accent
                        : colors.primary
                      : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  strip: { flexDirection: "row", gap: 4 },
  day: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
    gap: 2,
    minHeight: 56,
  },
  dayName: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase" },
  dayNumber: { fontSize: fontSize.md, fontWeight: "800" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
