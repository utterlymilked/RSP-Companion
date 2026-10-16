import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Segmented } from "../../ui/Segmented";
import type { BookingSummary } from "./occupancy";
import { whoOf } from "./occupancy";
import { DURATIONS, durationLabel, fitDuration, groupStarts, type Slot } from "./slots";
import { clockTime, minutesToClock } from "./time";

/**
 * How long, then when: the booking pattern of TheFork and Playtomic. Start times are grouped
 * by part of the day; one tap picks a free one. What is taken stays visible: each occupied
 * stretch is listed once with its owner, and the start times that would overlap it are greyed
 * out. Tapping either opens who has it (`onTaken`), so nobody wonders why a time is missing.
 */
export function FreeSlots({
  duration,
  onDuration,
  slots,
  selected,
  onPick,
  onTaken,
}: {
  duration: number;
  onDuration: (minutes: number) => void;
  /** Start times for `duration` with the booking that has each one (see `daySlots`). */
  slots: Slot[];
  selected?: number | null;
  /** `minutes` is the session length, shortened when the next booking is closer. */
  onPick: (start: number, minutes: number) => void;
  /** Opens the details of a taken stretch; `overlap` is set when a start time was tapped. */
  onTaken: (booking: BookingSummary, overlap?: boolean) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const segments = [
    ...new Map(
      slots.flatMap((s) => (s.booking ? [[s.booking.id, s.booking] as const] : [])),
    ).values(),
  ];
  return (
    <View style={styles.wrap}>
      <Segmented
        label={t("bookings.duration")}
        value={String(duration)}
        onChange={(v) => onDuration(Number(v))}
        options={DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))}
      />
      {segments.length > 0 ? (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
            {t("bookings.takenSegments")}
          </Text>
          {segments.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityLabel={t("bookings.takenBy", {
                range: `${clockTime(b.startsAt)}–${clockTime(b.endsAt)}`,
                who: whoOf(b),
                what: b.title ?? t(`activities.${b.activity}`),
              })}
              onPress={() => onTaken(b)}
              style={({ pressed }) => [
                styles.segment,
                { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons name="lock-closed" size={16} color={colors.danger} />
              <View style={styles.segmentText}>
                <Text style={[styles.segmentTime, { color: colors.text }]}>
                  {clockTime(b.startsAt)}–{clockTime(b.endsAt)}
                </Text>
                <Text numberOfLines={1} style={[styles.segmentWho, { color: colors.text }]}>
                  {whoOf(b)} · {b.title ?? t(`activities.${b.activity}`)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {slots.length === 0 ? (
        <Text style={[styles.none, { color: colors.textMuted }]}>{t("bookings.noSlots")}</Text>
      ) : (
        groupStarts(slots).map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
              {t(`bookings.partOfDay.${group.key}`)}
            </Text>
            <View style={styles.grid}>
              {group.starts.map((slot) => {
                const { start, booking } = slot;
                const minutes = fitDuration(slot, duration);
                const short = !booking && minutes < duration;
                const range = `${minutesToClock(start)}–${minutesToClock(start + minutes)}`;
                if (booking) {
                  const overlap = t("bookings.overlaps", {
                    range: `${clockTime(booking.startsAt)}–${clockTime(booking.endsAt)}`,
                    who: whoOf(booking),
                  });
                  return (
                    <Pressable
                      key={start}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: true }}
                      accessibilityLabel={`${range}. ${overlap}`}
                      onPress={() => onTaken(booking, true)}
                      style={[
                        styles.slot,
                        styles.taken,
                        { backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.slotText, styles.struck, { color: colors.textMuted }]}>
                        {minutesToClock(start)}
                      </Text>
                    </Pressable>
                  );
                }
                const active = start === selected;
                return (
                  <Pressable
                    key={start}
                    accessibilityRole="button"
                    accessibilityLabel={t("bookings.slot", { range })}
                    accessibilityState={{ selected: active }}
                    onPress={() => onPick(start, minutes)}
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
                    {short ? (
                      <Text
                        style={[
                          styles.slotNote,
                          { color: active ? colors.onPrimary : colors.primary },
                        ]}
                      >
                        {durationLabel(minutes)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
      {segments.length > 0 ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t("bookings.overlapHint")}</Text>
      ) : null}
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
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  segmentText: { flex: 1 },
  segmentTime: { fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] },
  segmentWho: { fontSize: fontSize.sm },
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
  slotNote: { fontSize: fontSize.xs, fontWeight: "600" },
  slotText: { fontSize: fontSize.md, fontWeight: "700", fontVariant: ["tabular-nums"] },
  hint: { fontSize: fontSize.xs },
});
