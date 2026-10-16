import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { BookingRow } from "./BookingRow";
import type { AreaStatus } from "./FloorPlan";
import type { BookingSummary, SpaceSummary } from "./occupancy";
import { clockTime } from "./time";

const STATE_TONE = { free: "success", pending: "warning", busy: "danger" } as const;

/** The space picked on the plan: its state at the chosen time, the day's bookings, actions. */
export function SpacePanel({
  space,
  status,
  bookings,
  onOpen,
  onBook,
  onWeek,
}: {
  space: SpaceSummary;
  status: AreaStatus;
  bookings: BookingSummary[];
  onOpen: (booking: BookingSummary) => void;
  /** Absent for people who cannot book. */
  onBook?: () => void;
  onWeek: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const what = status.booking
    ? (status.booking.title ?? t(`activities.${status.booking.activity}`))
    : null;
  const summary =
    status.state === "free"
      ? status.until
        ? t("bookings.freeUntil", { time: clockTime(status.until) })
        : t("bookings.freeRestOfDay")
      : `${what} · ${t("bookings.until", { time: clockTime(status.until ?? "") })}`;
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
            {space.name}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {[
              t(`spaceKinds.${space.kind}`),
              space.capacity ? t("bookings.capacity", { count: space.capacity }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <Badge label={t(`bookings.state.${status.state}`)} tone={STATE_TONE[status.state]} />
      </View>
      <View style={styles.summary}>
        <Ionicons
          name={status.state === "free" ? "checkmark-circle" : "time"}
          size={18}
          color={status.state === "free" ? colors.success : colors.textMuted}
        />
        <Text style={[styles.summaryText, { color: colors.text }]}>{summary}</Text>
      </View>
      <Text style={[styles.section, { color: colors.textMuted }]}>{t("bookings.dayBookings")}</Text>
      {bookings.length === 0 ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>{t("bookings.emptyDay")}</Text>
      ) : (
        <View style={styles.list}>
          {bookings.map((b) => (
            <BookingRow
              key={b.id}
              booking={b}
              showSpace={b.spaceId !== space.id}
              onPress={() => onOpen(b)}
            />
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {onBook ? (
          <View style={styles.flex}>
            <Button icon="add-circle-outline" label={t("bookings.bookThis")} onPress={onBook} />
          </View>
        ) : null}
        <View style={onBook ? undefined : styles.flex}>
          <Button
            icon="calendar-outline"
            variant="secondary"
            label={t("bookings.seeWeek")}
            onPress={onWeek}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.lg, fontWeight: "800" },
  meta: { fontSize: fontSize.sm },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  summaryText: { fontSize: fontSize.md, fontWeight: "600", flex: 1 },
  section: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.xs,
  },
  list: { gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
});
