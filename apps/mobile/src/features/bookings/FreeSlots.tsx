import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Segmented } from "../../ui/Segmented";
import { whoOf } from "./occupancy";
import { DURATIONS, durationLabel, groupStarts, type Slot } from "./slots";
import { clockTime, minutesToClock } from "./time";

/**
 * How long, then when: the booking pattern of TheFork and Playtomic. Start times are grouped
 * by part of the day; one tap picks a free one. Taken ones stay in place, greyed out, with who
 * has them and for what, so nobody wonders why a time is missing.
 */
export function FreeSlots({
  duration,
  onDuration,
  slots,
  selected,
  onPick,
}: {
  duration: number;
  onDuration: (minutes: number) => void;
  /** Start times for `duration` with the booking that has each one (see `daySlots`). */
  slots: Slot[];
  selected?: number | null;
  onPick: (start: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Segmented
        label={t("bookings.duration")}
        value={String(duration)}
        onChange={(v) => onDuration(Number(v))}
        options={DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))}
      />
      {slots.length === 0 ? (
        <Text style={[styles.none, { color: colors.textMuted }]}>{t("bookings.noSlots")}</Text>
      ) : (
        groupStarts(slots).map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
              {t(`bookings.partOfDay.${group.key}`)}
            </Text>
            <View style={styles.grid}>
              {group.starts.map(({ start, booking }) => {
                const active = start === selected;
                const range = `${minutesToClock(start)}–${minutesToClock(start + duration)}`;
                if (booking) {
                  const what = booking.title ?? t(`activities.${booking.activity}`);
                  return (
                    <View
                      key={start}
                      accessible
                      accessibilityRole="text"
                      accessibilityState={{ disabled: true }}
                      accessibilityLabel={t("bookings.slotTaken", {
                        range,
                        who: whoOf(booking),
                        what,
                      })}
                      style={[
                        styles.slot,
                        styles.taken,
                        { backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.slotText, styles.struck, { color: colors.textMuted }]}>
                        {minutesToClock(start)}
                      </Text>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={start}
                    accessibilityRole="button"
                    accessibilityLabel={t("bookings.slot", { range })}
                    accessibilityState={{ selected: active }}
                    onPress={() => onPick(start)}
                    style={({ pressed }) => [
                      styles.slot,
                      {
                        backgroundColor: active ? colors.primary : colors.primarySoft,
                        borderColor: active ? colors.primary : colors.primarySoft,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        { color: active ? colors.onPrimary : colors.primary },
                      ]}
                    >
                      {minutesToClock(start)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {[
              ...new Map(
                group.starts.flatMap((x) => (x.booking ? [[x.booking.id, x.booking]] : [])),
              ).values(),
            ].map((b) => (
              <View key={b.id} style={styles.caption}>
                <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
                <Text style={[styles.captionText, { color: colors.textMuted }]}>
                  {t("bookings.takenBy", {
                    range: `${clockTime(b.startsAt)}–${clockTime(b.endsAt)}`,
                    who: whoOf(b),
                    what: b.title ?? t(`activities.${b.activity}`),
                  })}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  none: { fontSize: fontSize.sm, textAlign: "center", paddingVertical: spacing.sm },
  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  taken: { opacity: 0.85 },
  struck: { textDecorationLine: "line-through", fontWeight: "500" },
  caption: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  captionText: { fontSize: fontSize.xs, flex: 1 },
  slotText: { fontSize: fontSize.md, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
