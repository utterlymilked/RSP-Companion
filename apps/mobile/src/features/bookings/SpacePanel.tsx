import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { BookingRow } from "./BookingRow";
import type { AreaStatus } from "./FloorPlan";
import { FreeSlots } from "./FreeSlots";
import { type BookingSummary, type SpaceSummary, whoOf } from "./occupancy";
import type { Slot } from "./slots";
import { clockTime } from "./time";

const STATE_TONE = { free: "success", pending: "warning", busy: "danger" } as const;

/**
 * The space picked on the plan, shown in a bottom sheet titled with its name: its state, the day's free times (one tap books one, as on
 * TheFork) and the day's bookings.
 */
export function SpacePanel({
  space,
  status,
  bookings,
  onOpen,
  free,
  onWeek,
}: {
  space: SpaceSummary;
  status: AreaStatus;
  bookings: BookingSummary[];
  onOpen: (booking: BookingSummary) => void;
  /** Free times to book; absent for people who cannot book. */
  free?: {
    duration: number;
    onDuration: (minutes: number) => void;
    slots: Slot[];
    onPick: (start: number) => void;
    onTaken: (booking: BookingSummary, overlap?: boolean) => void;
  };
  onWeek: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const what = status.booking
    ? (status.booking.title ?? t(`activities.${status.booking.activity}`))
    : null;
  const summary = status.label
    ? status.label
    : status.state === "free"
      ? status.until
        ? t("bookings.freeUntil", { time: clockTime(status.until) })
        : t("bookings.freeRestOfDay")
      : `${status.booking ? whoOf(status.booking) : ""} · ${what} · ${t("bookings.until", { time: clockTime(status.until ?? "") })}`;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headText}>
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
      {free ? (
        <>
          <Text style={[styles.section, { color: colors.textMuted }]}>
            {t("bookings.freeTimes")}
          </Text>
          <FreeSlots {...free} />
        </>
      ) : null}
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
      <Button
        compact
        icon="calendar-outline"
        variant="secondary"
        label={t("bookings.seeWeek")}
        onPress={onWeek}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headText: { flex: 1, gap: 2 },
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
});
