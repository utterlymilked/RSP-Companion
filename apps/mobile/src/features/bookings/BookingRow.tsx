import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Badge, type Tone } from "../../ui/Badge";
import { blockLook } from "./CalendarGrid";
import type { BookingSummary } from "./occupancy";
import { clockTime } from "./time";

const STATUS_TONE: Partial<Record<BookingSummary["status"], Tone>> = {
  to_confirm: "warning",
  voided: "danger",
  cancelled: "danger",
  not_confirmed: "danger",
};

/** One booking in a list: time, what, where and who; a badge when it is not simply confirmed. */
export function BookingRow({
  booking,
  showSpace = true,
  onPress,
}: {
  booking: BookingSummary;
  showSpace?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const look = blockLook(booking.status, colors);
  const title = booking.title ?? t(`activities.${booking.activity}`);
  const time = `${clockTime(booking.startsAt)}–${clockTime(booking.endsAt)}`;
  const where = [showSpace ? booking.spaceName : null, booking.departmentName]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${time} ${title}, ${where}, ${t(`bookingStatus.${booking.status}`)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: look.edge }]} />
      <View style={styles.time}>
        <Text style={[styles.start, { color: colors.text }]}>{clockTime(booking.startsAt)}</Text>
        <Text style={[styles.end, { color: colors.textMuted }]}>{clockTime(booking.endsAt)}</Text>
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: look.fg }, look.off && styles.off]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.where, { color: colors.textMuted }]}>
          {where}
        </Text>
      </View>
      {booking.status === "confirmed" || booking.status === "done" ? null : (
        <Badge
          label={t(`bookingStatus.${booking.status}`)}
          tone={STATUS_TONE[booking.status] ?? "neutral"}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.md,
    overflow: "hidden",
  },
  bar: { width: 4, alignSelf: "stretch" },
  time: { width: 44, alignItems: "flex-start" },
  start: { fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] },
  end: { fontSize: fontSize.xs, fontVariant: ["tabular-nums"] },
  body: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "700" },
  where: { fontSize: fontSize.sm },
  off: { textDecorationLine: "line-through" },
});
