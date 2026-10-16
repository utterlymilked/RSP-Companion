import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Segmented } from "../../ui/Segmented";
import { DURATIONS, durationLabel, groupStarts } from "./slots";
import { minutesToClock } from "./time";

/**
 * How long, then when: the booking pattern of TheFork and Playtomic. Only the start times that
 * are free for the whole length show, grouped by part of the day; one tap picks a slot.
 */
export function FreeSlots({
  duration,
  onDuration,
  starts,
  selected,
  onPick,
}: {
  duration: number;
  onDuration: (minutes: number) => void;
  /** Free start times for `duration`, in minutes since midnight (see `freeStarts`). */
  starts: number[];
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
      {starts.length === 0 ? (
        <Text style={[styles.none, { color: colors.textMuted }]}>{t("bookings.noSlots")}</Text>
      ) : (
        groupStarts(starts).map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
              {t(`bookings.partOfDay.${group.key}`)}
            </Text>
            <View style={styles.grid}>
              {group.starts.map((start) => {
                const active = start === selected;
                const range = `${minutesToClock(start)}–${minutesToClock(start + duration)}`;
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
  slotText: { fontSize: fontSize.md, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
