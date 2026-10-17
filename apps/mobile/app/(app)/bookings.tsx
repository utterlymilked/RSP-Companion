import Ionicons from "@expo/vector-icons/Ionicons";
import { buildTimetable, TIMETABLE_DEFAULT_RANGE, TIMETABLE_HOURS } from "@rsc/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { isWeb } from "../../src/auth/client";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import {
  bookingMarks,
  DayGrid,
  MonthGrid,
  WeekGrid,
} from "../../src/features/bookings/CalendarGrid";
import { DateNav } from "../../src/features/bookings/DateNav";
import { type AreaStatus, FloorPlan } from "../../src/features/bookings/FloorPlan";
import {
  type BookingSummary,
  bookingsOf,
  type SpaceSummary,
  stateAt,
  whoOf,
} from "../../src/features/bookings/occupancy";
import { placeSpaces, planOrder } from "../../src/features/bookings/planLayout";
import { printTimetable, timetableHtml } from "../../src/features/bookings/printTimetable";
import { SpacePanel } from "../../src/features/bookings/SpacePanel";
import {
  categoryOf,
  DEFAULT_DURATION,
  daySlots,
  freeStarts,
  type SpaceCategory,
} from "../../src/features/bookings/slots";
import { TakenSheet } from "../../src/features/bookings/TakenSheet";
import { Timetable, TimetableLegend } from "../../src/features/bookings/Timetable";
import {
  addDays,
  addMonths,
  clockTime,
  dayOf,
  minutesToClock,
  mondayOf,
  monthGrid,
  monthTitle,
  todayLisbon,
  weekTitle,
} from "../../src/features/bookings/time";
import { saveTimetable } from "../../src/features/bookings/timetableFiles";
import { WeekStrip } from "../../src/features/bookings/WeekStrip";
import { fontSize, radius, spacing, useColors } from "../../src/theme";
import { BottomSheet } from "../../src/ui/BottomSheet";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Fab } from "../../src/ui/Fab";
import { Narrow, Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Select } from "../../src/ui/Select";
import { Body, Message } from "../../src/ui/Text";
import { showToast } from "../../src/ui/Toast";

type View_ = "plan" | "day" | "week" | "timetable" | "month";

const VIEW_ICONS = {
  plan: "map-outline",
  day: "today-outline",
  week: "calendar-outline",
  timetable: "reader-outline",
  month: "grid-outline",
} as const;

/** The days a view loads bookings for, both inclusive: its week, or its month's six weeks. */
function rangeOf(view: View_, date: string): { from: string; to: string } {
  if (view === "month") {
    const days = monthGrid(date);
    return { from: days[0] ?? date, to: days[days.length - 1] ?? date };
  }
  const monday = mondayOf(date);
  return { from: monday, to: addDays(monday, 6) };
}

/**
 * Fields and rooms, booked separately: the plan of the complex shows what is taken on the
 * chosen day; tapping a space lists its free times, and one more tap books one. The calendar
 * views (day by space, week, month) show the same bookings.
 */
export default function Bookings() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const canWrite = permissions.includes("bookings.write");
  const today = todayLisbon();
  const [category, setCategory] = useState<SpaceCategory>("fields");
  const [view, setView] = useState<View_>("plan");
  const [date, setDate] = useState(today);
  const [spaceId, setSpaceId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [hours, setHours] = useState<{ from: number; to: number }>(TIMETABLE_DEFAULT_RANGE);

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
  const inCategory = planOrder(spaces).filter((s) => categoryOf(s) === category);
  const ids = new Set(inCategory.map((s) => s.id));
  const bookings = (list.data?.bookings ?? []) as BookingSummary[];
  const categoryBookings = bookings.filter((b) => ids.has(b.spaceId));
  const filtered = spaceId === "all" ? categoryBookings : bookingsOf(spaceId, bookings, spaces);
  const dayBookings = bookings.filter((b) => dayOf(b.startsAt) <= date && dayOf(b.endsAt) >= date);
  const isToday = date === today;

  /** Today: what each space is doing now. Another day: how many bookings it has. */
  const status = (id: string): AreaStatus => {
    if (isToday) return stateAt(id, new Date(), dayBookings, spaces);
    const count = bookingsOf(id, dayBookings, spaces).length;
    const full = freeStarts(id, date, 60, dayBookings, spaces).length === 0;
    return {
      state: full ? "busy" : "free",
      booking: null,
      until: null,
      label: count ? t("bookings.count", { count }) : t("bookings.freeAllDay"),
    };
  };
  // Tapping a taken stretch says who has it, in a sheet; the sheet leads on to the booking.
  const [taken, setTaken] = useState<{ booking: BookingSummary; overlap?: boolean } | null>(null);
  const open = (b: BookingSummary, overlap?: boolean) => setTaken({ booking: b, overlap });
  const openBooking = (b: BookingSummary) => {
    setTaken(null);
    router.push({ pathname: "/booking/[bookingId]", params: { bookingId: b.id } });
  };
  /** Straight to the confirmation, with the space, day and times filled in. */
  const book = (id: string, start: number, minutes = DEFAULT_DURATION) =>
    router.push({
      pathname: "/booking/new",
      params: {
        spaceId: id,
        date,
        start: minutesToClock(start),
        end: minutesToClock(start + minutes),
      },
    });

  const overlapReason = (b: BookingSummary) =>
    t("bookings.overlaps", {
      range: `${clockTime(b.startsAt)}–${clockTime(b.endsAt)}`,
      who: whoOf(b),
    });
  const selected = inCategory.find((s) => s.id === selectedId) ?? null;
  const monday = mondayOf(date);
  const sheets =
    view === "timetable"
      ? buildTimetable(
          spaces,
          bookings,
          Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
          category,
          hours,
        )
      : [];
  const exportFile = useMutation({
    mutationFn: (format: "pdf" | "xlsx") =>
      saveTimetable(format, { week: monday, category, ...hours }),
    onError: (error) => showToast(t(errorKey(error)), "error"),
  });
  const print = () => {
    const label = (key: string) => t(`bookings.timetable.${key}`);
    const week = t("bookings.timetable.week", { week: weekTitle(monday, i18n.language) });
    const html = timetableHtml(sheets, hours, {
      heading: t(category === "fields" ? "bookings.category.fields" : "bookings.category.rooms"),
      week,
      printed: t("bookings.timetable.printed", {
        date: new Date().toLocaleDateString(i18n.language, { timeZone: "Europe/Lisbon" }),
      }),
      legend: {
        free: label("free"),
        confirmed: label("confirmed"),
        request: label("request"),
        via: label("via"),
      },
      activity: (b) => t(`activities.${b.activity}`),
      locale: i18n.language,
    });
    if (!printTimetable(html)) showToast(label("popupBlocked"), "error");
  };
  /** From a free time in the timetable straight to the confirmation, as from the day view. */
  const bookSlot = (id: string, day: string, start: number, minutes: number) =>
    router.push({
      pathname: "/booking/new",
      params: {
        spaceId: id,
        date: day,
        start: minutesToClock(start),
        end: minutesToClock(start + minutes),
      },
    });
  const hourOptions = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => ({
      value: String(h),
      label: minutesToClock(h * 60),
    }));
  const plan = placeSpaces(spaces);
  const others = plan.others.filter((s) => categoryOf(s) === category);
  const marks = bookingMarks(view === "month" ? filtered : categoryBookings);
  const pick = (d: string) => {
    setDate(d);
    if (view === "month") setView("day");
  };

  return (
    <Screen
      wide={view === "timetable"}
      overlay={
        canWrite ? (
          <Fab
            label={t("bookings.new")}
            onPress={() =>
              router.push({
                pathname: "/booking/new",
                params: { category, date },
              })
            }
          />
        ) : null
      }
    >
      <Narrow>
        <Button
          compact
          variant="secondary"
          icon="bookmarks-outline"
          label={t("bookings.mine.title")}
          onPress={() => router.push("/booking/mine")}
        />
        <Segmented
          label={t("bookings.category.label")}
          value={category}
          onChange={(c) => {
            setCategory(c);
            setSelectedId(null);
            setSpaceId("all");
          }}
          options={[
            { value: "fields", label: t("bookings.category.fields"), icon: "football-outline" },
            { value: "rooms", label: t("bookings.category.rooms"), icon: "business-outline" },
          ]}
        />
        <Segmented
          label={t("bookings.views.label")}
          value={view}
          onChange={setView}
          options={(["plan", "day", "week", "timetable", "month"] as const).map((v) => ({
            value: v,
            label: t(`bookings.views.${v}`),
            icon: VIEW_ICONS[v],
          }))}
        />
        <Card>
          {view === "timetable" ? (
            <DateNav
              title={weekTitle(monday, i18n.language)}
              previousLabel={t("bookings.timetable.previousWeek")}
              nextLabel={t("bookings.timetable.nextWeek")}
              onPrevious={() => setDate(addDays(date, -7))}
              onNext={() => setDate(addDays(date, 7))}
              onToday={monday !== mondayOf(today) ? () => setDate(today) : undefined}
            />
          ) : view === "month" ? (
            <DateNav
              title={monthTitle(date, i18n.language)}
              previousLabel={t("bookings.previousMonth")}
              nextLabel={t("bookings.nextMonth")}
              onPrevious={() => setDate(addMonths(date, -1))}
              onNext={() => setDate(addMonths(date, 1))}
              onToday={date.slice(0, 7) !== today.slice(0, 7) ? () => setDate(today) : undefined}
            />
          ) : (
            <WeekStrip selected={date} onSelect={setDate} marked={(d) => marks.has(d)} />
          )}
          {view === "week" || view === "month" ? (
            <Select
              icon="location-outline"
              label={t("bookings.space")}
              value={spaceId}
              onChange={setSpaceId}
              options={[
                {
                  value: "all",
                  label: t(category === "fields" ? "bookings.allFields" : "bookings.allRooms"),
                },
                ...inCategory.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          ) : null}
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
              part={category}
              spaces={spaces}
              areas={plan.areas}
              combinations={plan.combinations}
              status={status}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            />
            {others.length > 0 ? (
              <View style={styles.others}>
                <Text style={[styles.caption, { color: colors.textMuted }]}>
                  {t("bookings.otherSpaces")}
                </Text>
                <View style={styles.otherRow}>
                  {others.map((s) => (
                    <OtherSpace
                      key={s.id}
                      space={s}
                      status={status(s.id)}
                      selected={selectedId === s.id}
                      onPress={() => setSelectedId(s.id === selectedId ? null : s.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.hint}>
              <Ionicons name="hand-left-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.hintText, { color: colors.textMuted }]}>
                {t(category === "fields" ? "bookings.planHintFields" : "bookings.planHintRooms")}
              </Text>
            </View>
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {t("bookings.planNote")}
            </Text>
          </>
        ) : null}

        {view === "day" ? (
          <>
            <DayGrid
              day={date}
              spaces={inCategory.filter((s) => !s.parentId)}
              allSpaces={spaces}
              bookings={dayBookings}
              onOpen={open}
              onSlot={canWrite ? (id, start) => book(id, start) : undefined}
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

        {view === "timetable" ? (
          <>
            <View style={styles.hours}>
              <View style={styles.hour}>
                <Select
                  icon="time-outline"
                  label={t("bookings.timetable.from")}
                  value={String(hours.from)}
                  onChange={(h) => setHours({ ...hours, from: Number(h) })}
                  options={hourOptions(TIMETABLE_HOURS.min, hours.to - 1)}
                />
              </View>
              <View style={styles.hour}>
                <Select
                  icon="time-outline"
                  label={t("bookings.timetable.to")}
                  value={String(hours.to)}
                  onChange={(h) => setHours({ ...hours, to: Number(h) })}
                  options={hourOptions(hours.from + 1, TIMETABLE_HOURS.max)}
                />
              </View>
            </View>
            <View style={styles.exports}>
              {isWeb ? (
                <Button
                  compact
                  variant="secondary"
                  icon="print-outline"
                  label={t("bookings.timetable.print")}
                  onPress={print}
                />
              ) : null}
              <Button
                compact
                variant="secondary"
                icon="document-text-outline"
                label={t("bookings.timetable.pdf")}
                busy={exportFile.isPending && exportFile.variables === "pdf"}
                onPress={() => exportFile.mutate("pdf")}
              />
              <Button
                compact
                variant="secondary"
                icon="grid-outline"
                label={t("bookings.timetable.excel")}
                busy={exportFile.isPending && exportFile.variables === "xlsx"}
                onPress={() => exportFile.mutate("xlsx")}
              />
            </View>
            <TimetableLegend />
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {t(canWrite ? "bookings.timetable.hint" : "bookings.timetable.hintReadOnly")}
            </Text>
          </>
        ) : null}

        {view === "month" ? (
          <>
            <MonthGrid
              date={date}
              marks={marks}
              onDay={pick}
              describe={(count) => t("bookings.count", { count })}
            />
            <CalendarLink />
          </>
        ) : null}
      </Narrow>
      {view === "timetable" ? (
        <Timetable
          sheets={sheets}
          spaces={spaces}
          bookings={bookings}
          range={hours}
          onOpen={open}
          onSlot={canWrite ? bookSlot : undefined}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : null}
      <BottomSheet
        title={selected?.name ?? ""}
        visible={view === "plan" && !!selected}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <SpacePanel
            space={selected}
            spaces={spaces}
            onSelect={setSelectedId}
            status={status(selected.id)}
            bookings={bookingsOf(selected.id, dayBookings, spaces)}
            onOpen={(b) => {
              setSelectedId(null);
              open(b);
            }}
            free={
              canWrite
                ? {
                    duration,
                    onDuration: setDuration,
                    slots: daySlots(selected.id, date, dayBookings, spaces),
                    onPick: (start, minutes) => {
                      setSelectedId(null);
                      book(selected.id, start, minutes);
                    },
                    onTaken: (b, overlap) => {
                      setSelectedId(null);
                      open(b, overlap);
                    },
                  }
                : undefined
            }
            onWeek={() => {
              setSelectedId(null);
              setSpaceId(selected.id);
              setView("week");
            }}
          />
        ) : null}
      </BottomSheet>
      <TakenSheet
        booking={taken?.booking ?? null}
        bookings={bookings}
        spaces={spaces}
        reason={taken?.overlap ? overlapReason(taken.booking) : undefined}
        onClose={() => setTaken(null)}
        onOpen={openBooking}
      />
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
  status,
  selected,
  onPress,
}: {
  space: SpaceSummary;
  status: AreaStatus;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const state = status.state;
  const fg = { free: colors.success, pending: colors.warning, busy: colors.danger }[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${space.name}, ${status.label ?? t(`bookings.state.${state}`)}`}
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
  hours: { flexDirection: "row", gap: spacing.sm },
  hour: { flex: 1 },
  exports: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  linkHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  linkTitle: { fontSize: fontSize.md, fontWeight: "700" },
  url: { fontSize: fontSize.sm },
});
