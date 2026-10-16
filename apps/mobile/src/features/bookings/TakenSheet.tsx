import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { BottomSheet } from "../../ui/BottomSheet";
import { Button } from "../../ui/Button";
import { type BookingSummary, contiguousChain, makerOf, type SpaceSummary } from "./occupancy";
import { clockTime, dayHeading, dayOf } from "./time";

/**
 * Who has a taken stretch: a sheet with the booking tapped and, swipeable beside it, the ones
 * back to back with it in the same space. `reason` explains why a start time is not offered.
 */
export function TakenSheet({
  booking,
  bookings,
  spaces,
  reason,
  onClose,
  onOpen,
}: {
  booking: BookingSummary | null;
  bookings: BookingSummary[];
  spaces: SpaceSummary[];
  reason?: string;
  onClose: () => void;
  onOpen: (booking: BookingSummary) => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet title={t("bookings.occupied")} visible={!!booking} onClose={onClose}>
      {booking ? (
        <Carousel
          key={booking.id}
          items={contiguousChain(booking, bookings, spaces)}
          startId={booking.id}
          reason={reason}
          onOpen={onOpen}
        />
      ) : null}
    </BottomSheet>
  );
}

function Carousel({
  items,
  startId,
  reason,
  onOpen,
}: {
  items: BookingSummary[];
  startId: string;
  reason?: string;
  onOpen: (booking: BookingSummary) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const first = Math.max(
    0,
    items.findIndex((b) => b.id === startId),
  );
  const [index, setIndex] = useState(first);

  // Open on the booking that was tapped, once the page width is known.
  useEffect(() => {
    if (width > 0) scroll.current?.scrollTo({ x: first * width, animated: false });
  }, [width, first]);

  const go = (to: number) => {
    const next = Math.min(items.length - 1, Math.max(0, to));
    setIndex(next);
    scroll.current?.scrollTo({ x: next * width, animated: true });
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {reason ? (
        <View style={[styles.reason, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name="information-circle" size={18} color={colors.warning} />
          <Text style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
        </View>
      ) : null}
      {items.length > 1 ? (
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("bookings.previousBooking")}
            disabled={index === 0}
            hitSlop={8}
            onPress={() => go(index - 1)}
            style={[styles.arrow, index === 0 && styles.off]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {t("bookings.page", { current: index + 1, total: items.length })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("bookings.nextBooking")}
            disabled={index === items.length - 1}
            hitSlop={8}
            onPress={() => go(index + 1)}
            style={[styles.arrow, index === items.length - 1 && styles.off]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
      {width > 0 ? (
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={items.length > 1}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / (width || 1)))
          }
        >
          {items.map((b) => (
            <Page key={b.id} booking={b} width={width} onOpen={onOpen} />
          ))}
        </ScrollView>
      ) : (
        // Before the width is measured, show the tapped booking on its own.
        items[first] && <Page booking={items[first]} onOpen={onOpen} />
      )}
      {items.length > 1 ? (
        <View style={styles.dots}>
          {items.map((b, i) => (
            <View
              key={b.id}
              style={[
                styles.dot,
                { backgroundColor: i === index ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Row({ icon, text }: { icon: ComponentProps<typeof Ionicons>["name"]; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={[styles.rowText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  reasonText: { flex: 1, fontSize: fontSize.sm, fontWeight: "600" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.3 },
  count: { fontSize: fontSize.sm, fontWeight: "700" },
  page: { gap: spacing.sm, paddingRight: spacing.xs },
  pageHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowText: { flex: 1, fontSize: fontSize.md },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

function Page({
  booking: b,
  width,
  onOpen,
}: {
  booking: BookingSummary;
  width?: number;
  onOpen: (booking: BookingSummary) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const maker = makerOf(b);
  return (
    <View style={[styles.page, width ? { width } : null]}>
      <View style={styles.pageHead}>
        <Text style={[styles.title, { color: colors.text }]}>
          {b.title ?? t(`activities.${b.activity}`)}
        </Text>
        <Badge
          label={t(`bookingStatus.${b.status}`)}
          tone={b.status === "to_confirm" ? "warning" : "primary"}
        />
      </View>
      <Row
        icon="time-outline"
        text={`${dayHeading(dayOf(b.startsAt), i18n.language)}, ${clockTime(b.startsAt)}–${clockTime(b.endsAt)}`}
      />
      <Row icon="location-outline" text={b.spaceName} />
      <Row
        icon="people-outline"
        text={[b.teamName, b.departmentName].filter(Boolean).join(" · ")}
      />
      {b.createdByName ? (
        <Row
          icon="person-outline"
          text={t("bookings.bookedByName", { name: maker ?? b.createdByName })}
        />
      ) : null}
      <Button
        compact
        variant="secondary"
        label={t("bookings.viewBooking")}
        onPress={() => onOpen(b)}
      />
    </View>
  );
}
