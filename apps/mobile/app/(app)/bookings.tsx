import Ionicons from "@expo/vector-icons/Ionicons";
import { fromLisbon, parseLocal } from "@rsc/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BookingRow } from "../../src/features/bookings/BookingRow";
import { DayGrid, MonthGrid, WeekGrid } from "../../src/features/bookings/CalendarGrid";
import { DateNav, TimeStepper } from "../../src/features/bookings/DateNav";
import { FloorPlan } from "../../src/features/bookings/FloorPlan";
import {
  type BookingSummary,
  bookingsOf,
  lisbonMinutes,
  type SpaceSummary,
  stateAt,
} from "../../src/features/bookings/occupancy";
import { placeSpaces, planOrder } from "../../src/features/bookings/planLayout";
import { SpacePanel } from "../../src/features/bookings/SpacePanel";
import {
  addDays,
  addMonths,
  dayHeading,
  dayOf,
  minutesToClock,
  mondayOf,
  monthGrid,
  monthTitle,
  shortDayTitle,
  todayLisbon,
  weekTitle,
} from "../../src/features/bookings/time";
import { fontSize, radius, spacing, useColors } from "../../src/theme";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { EmptyState } from "../../src/ui/EmptyState";
import { Fab } from "../../src/ui/Fab";
import { Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Select } from "../../src/ui/Select";
import { Body, Message } from "../../src/ui/Text";

type View_ = "plan" | "day" | "week" | "month" | "list";

const VIEW_ICONS = {
  plan: "map-outline",
  day: "today-outline",
  week: "calendar-outline",
  month: "grid-outline",
  list: "list-outline",
} as const;

/** Now in Lisbon, rounded down to the half hour, in minutes since midnight. */
const nowSlot = () => Math.floor(lisbonMinutes(new Date()) / 30) * 30;

/** The days a view needs bookings for, both inclusive. */
function rangeOf(view: View_, date: string): { from: string; to: string } {
  if (view === "plan" || view === "day") return { from: date, to: date };
  if (view === "month") {
    const days = monthGrid(date);
    return { from: days[0] ?? date, to: days[days.length - 1] ?? date };
  }
  const monday = mondayOf(date);
  return { from: monday, to: addDays(monday, 6) };
}

/**
 * Rooms and fields: a floor plan of the complex showing what is free at a chosen time, a
 * calendar (day by space, week, month) and a list, all over the same bookings.
 */
export default function Bookings() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const canWrite = permissions.includes("bookings.write");
  const today = todayLisbon();
  const [view, setView] = useState<View_>("plan");
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(nowSlot);
  const [spaceId, setSpaceId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const facilities = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const range = rangeOf(view, date);
  const list = useQuery({
    queryKey: ["bookings", range.from, range.to],
    queryFn: async () => jsonOrThrow(await api.bookings.$get({ query: range })),
  });

  const spaces = (facilities.data?.spaces ?? []) as SpaceSummary[];
  const ordered = planOrder(spaces);
  const bookings = (list.data?.bookings ?? []) as BookingSummary[];
  const filtered = spaceId === "all" ? bookings : bookingsOf(spaceId, bookings, spaces);
  const local = parseLocal(date, minutesToClock(minutes));
  const at = local ? fromLisbon(local) : new Date();
  const status = (id: string) => stateAt(id, at, bookings, spaces);
  const open = (b: BookingSummary) =>
    router.push({ pathname: "/booking/[bookingId]", params: { bookingId: b.id } });
  const book = (id: string, start: number) =>
    router.push({
      pathname: "/booking/new",
      params: {
        spaceId: id,
        date,
        start: minutesToClock(start),
        end: minutesToClock(Math.min(start + 90, 23 * 60 + 59)),
      },
    });

  const step = { plan: 1, day: 1, week: 7, list: 7, month: 0 }[view];
  const move = (direction: 1 | -1) =>
    setDate(view === "month" ? addMonths(date, direction) : addDays(date, step * direction));
  const onToday =
    view === "month"
      ? date.slice(0, 7) !== today.slice(0, 7)
      : view === "week" || view === "list"
        ? mondayOf(date) !== mondayOf(today)
        : date !== today;
  const title =
    view === "month"
      ? monthTitle(date, i18n.language)
      : view === "week" || view === "list"
        ? weekTitle(mondayOf(date), i18n.language)
        : shortDayTitle(date, i18n.language);
  const [previousLabel, nextLabel] =
    view === "month"
      ? [t("bookings.previousMonth"), t("bookings.nextMonth")]
      : view === "week" || view === "list"
        ? [t("bookings.previous"), t("bookings.next")]
        : [t("bookings.previousDay"), t("bookings.nextDay")];

  const selected = spaces.find((s) => s.id === selectedId) ?? null;
  const plan = placeSpaces(spaces);
  const spaceOptions = [
    { value: "all", label: t("bookings.allSpaces") },
    ...ordered.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Screen
      overlay={
        canWrite ? (
          <Fab
            label={t("bookings.new")}
            onPress={() =>
              selected && view === "plan"
                ? book(selected.id, minutes)
                : router.push({ pathname: "/booking/new", params: { date } })
            }
          />
        ) : null
      }
    >
      <Segmented
        label={t("bookings.views.label")}
        value={view}
        onChange={setView}
        options={(["plan", "day", "week", "month", "list"] as const).map((v) => ({
          value: v,
          label: t(`bookings.views.${v}`),
          icon: VIEW_ICONS[v],
        }))}
      />
      <Card>
        <DateNav
          title={title}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          onToday={onToday ? () => setDate(today) : undefined}
        />
        {view === "plan" ? (
          <TimeStepper
            minutes={minutes}
            onChange={setMinutes}
            onNow={
              date !== today || minutes !== nowSlot()
                ? () => {
                    setDate(today);
                    setMinutes(nowSlot());
                  }
                : undefined
            }
          />
        ) : (
          <Select
            icon="location-outline"
            label={t("bookings.space")}
            value={spaceId}
            onChange={setSpaceId}
            options={spaceOptions}
          />
        )}
      </Card>

      {list.isError || facilities.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error ?? facilities.error))}</Message>
          <Button
            label={t("common.retry")}
            onPress={() => {
              list.refetch();
              facilities.refetch();
            }}
          />
        </>
      ) : null}

      {view === "plan" ? (
        <>
          <Legend />
          <FloorPlan
            areas={plan.areas}
            combinations={plan.combinations}
            status={status}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          />
          {plan.others.length > 0 ? (
            <View style={styles.others}>
              <Text style={[styles.caption, { color: colors.textMuted }]}>
                {t("bookings.otherSpaces")}
              </Text>
              <View style={styles.otherRow}>
                {plan.others.map((s) => (
                  <OtherSpace
                    key={s.id}
                    space={s}
                    state={status(s.id).state}
                    selected={selectedId === s.id}
                    onPress={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {selected ? (
            <SpacePanel
              space={selected}
              status={status(selected.id)}
              bookings={bookingsOf(selected.id, bookings, spaces)}
              onOpen={open}
              onBook={canWrite ? () => book(selected.id, minutes) : undefined}
              onWeek={() => {
                setSpaceId(selected.id);
                setView("week");
              }}
            />
          ) : (
            <View style={styles.hint}>
              <Ionicons name="hand-left-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.hintText, { color: colors.textMuted }]}>
                {t("bookings.planHint")}
              </Text>
            </View>
          )}
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            {t("bookings.planNote")}
          </Text>
        </>
      ) : null}

      {view === "day" ? (
        <>
          <DayGrid
            day={date}
            spaces={spaceId === "all" ? ordered : ordered.filter((s) => s.id === spaceId)}
            allSpaces={spaces}
            bookings={bookings.filter((b) => dayOf(b.startsAt) <= date && dayOf(b.endsAt) >= date)}
            onOpen={open}
            onSlot={canWrite ? book : undefined}
          />
          {canWrite ? (
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {t("bookings.slotHint")}
            </Text>
          ) : null}
        </>
      ) : null}

      {view === "week" ? (
        <WeekGrid
          monday={mondayOf(date)}
          bookings={filtered}
          onOpen={open}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : null}

      {view === "month" ? (
        <MonthGrid
          date={date}
          bookings={filtered}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : null}

      {view === "list" ? <WeekList bookings={filtered} loaded={!!list.data} onOpen={open} /> : null}
      {view === "list" ? <CalendarLink /> : null}
    </Screen>
  );
}

/** Free, to confirm and taken colours, above the plan. */
function Legend() {
  const { t } = useTranslation();
  const colors = useColors();
  const items = [
    { key: "free", color: colors.success },
    { key: "pending", color: colors.warning },
    { key: "busy", color: colors.danger },
  ];
  return (
    <View accessibilityLabel={t("bookings.legend")} style={styles.legend}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>
            {t(`bookings.state.${item.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A bookable space that is not drawn on the plan. */
function OtherSpace({
  space,
  state,
  selected,
  onPress,
}: {
  space: SpaceSummary;
  state: "free" | "pending" | "busy";
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const fg = { free: colors.success, pending: colors.warning, busy: colors.danger }[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${space.name}, ${t(`bookings.state.${state}`)}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.other,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.legendDot, { backgroundColor: fg }]} />
      <Text numberOfLines={1} style={[styles.otherText, { color: colors.text }]}>
        {space.name}
      </Text>
    </Pressable>
  );
}

/** The week's bookings by day, as cards. */
function WeekList({
  bookings,
  loaded,
  onOpen,
}: {
  bookings: BookingSummary[];
  loaded: boolean;
  onOpen: (b: BookingSummary) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const today = todayLisbon();
  const days = new Map<string, BookingSummary[]>();
  for (const b of bookings) {
    const day = dayOf(b.startsAt);
    days.set(day, [...(days.get(day) ?? []), b]);
  }
  if (loaded && days.size === 0) {
    return <EmptyState icon="calendar-clear-outline" text={t("bookings.empty")} />;
  }
  return (
    <>
      {[...days].map(([day, items]) => (
        <View key={day} style={styles.day}>
          <Text
            style={[
              styles.dayHeading,
              { color: day === today ? colors.primary : colors.textMuted },
            ]}
          >
            {day === today ? `${t("bookings.today")} · ` : ""}
            {dayHeading(day, i18n.language)}
          </Text>
          {items.map((b) => (
            <BookingRow key={b.id} booking={b} onPress={() => onOpen(b)} />
          ))}
        </View>
      ))}
    </>
  );
}

/** Personal iCal link for calendar apps, shown on request and replaceable. */
function CalendarLink() {
  const { t } = useTranslation();
  const colors = useColors();
  const show = useMutation({
    mutationFn: async () => jsonOrThrow(await api.bookings.feed.$get()),
  });
  const rotate = useMutation({
    mutationFn: async () => jsonOrThrow(await api.bookings.feed.rotate.$post()),
  });
  const url = rotate.data?.url ?? show.data?.url;
  return (
    <Card>
      <View style={styles.linkHead}>
        <Ionicons name="link-outline" size={20} color={colors.primary} />
        <Text style={[styles.linkTitle, { color: colors.text }]}>{t("bookings.calendarLink")}</Text>
      </View>
      <Body muted>{t("bookings.calendarHint")}</Body>
      {url ? (
        <>
          <Text selectable style={[styles.url, { color: colors.text }]}>
            {url}
          </Text>
          <Button
            compact
            label={t("bookings.newLink")}
            variant="secondary"
            busy={rotate.isPending}
            onPress={() => rotate.mutate()}
          />
        </>
      ) : (
        <Button
          compact
          label={t("bookings.showLink")}
          variant="secondary"
          busy={show.isPending}
          onPress={() => show.mutate()}
        />
      )}
      {show.isError || rotate.isError ? (
        <Message tone="error">{t(errorKey(show.error ?? rotate.error))}</Message>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: fontSize.sm, fontWeight: "600" },
  caption: { fontSize: fontSize.xs, textAlign: "center" },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hintText: { fontSize: fontSize.sm, flexShrink: 1 },
  others: { gap: spacing.sm },
  otherRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  other: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  otherText: { fontSize: fontSize.sm, fontWeight: "600" },
  day: { gap: spacing.sm },
  dayHeading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
  linkHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linkTitle: { fontSize: fontSize.md, fontWeight: "700" },
  url: { fontSize: fontSize.sm },
});
