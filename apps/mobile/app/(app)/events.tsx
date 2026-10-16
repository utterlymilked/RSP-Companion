import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { type DayMark, MonthGrid } from "../../src/features/bookings/CalendarGrid";
import { DateNav } from "../../src/features/bookings/DateNav";
import {
  addDays,
  addMonths,
  byName,
  dayHeading,
  dayOf,
  mondayOf,
  monthGrid,
  monthTitle,
  todayLisbon,
} from "../../src/features/bookings/time";
import { WeekStrip } from "../../src/features/bookings/WeekStrip";
import { EventCard, type EventSummary } from "../../src/features/events/EventCard";
import { fontSize, spacing, useColors } from "../../src/theme";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Choice } from "../../src/ui/Choice";
import { EmptyState } from "../../src/ui/EmptyState";
import { Fab } from "../../src/ui/Fab";
import { Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Message } from "../../src/ui/Text";

type AgendaView = "day" | "week" | "month";

/**
 * Trainings, matches and club events, optionally for one team: a day, a week (tap a day to
 * open it) or a month calendar whose days list their events underneath, as Google Calendar does.
 */
export default function Events() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const today = todayLisbon();
  const [view, setView] = useState<AgendaView>("week");
  const [date, setDate] = useState(today);
  const [teamId, setTeamId] = useState("all");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const grid = monthGrid(date);
  const range =
    view === "month"
      ? { from: grid[0] ?? date, to: grid[grid.length - 1] ?? date }
      : { from: mondayOf(date), to: addDays(mondayOf(date), 6) };
  const list = useQuery({
    queryKey: ["events", range.from, range.to, teamId],
    queryFn: async () =>
      jsonOrThrow(
        await api.events.$get({
          query: { ...range, ...(teamId === "all" ? {} : { teamId }) },
        }),
      ),
  });

  const byDay = new Map<string, EventSummary[]>();
  for (const event of (list.data?.events ?? []) as EventSummary[]) {
    const day = dayOf(event.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  const marks = new Map<string, DayMark>();
  for (const [day, items] of byDay) {
    marks.set(day, { count: items.filter((e) => e.status !== "cancelled").length });
  }
  const shown = view === "week" ? [...byDay] : [[date, byDay.get(date) ?? []] as const];
  const empty = shown.every(([, items]) => items.length === 0);

  return (
    <Screen
      overlay={
        permissions.includes("events.write") ? (
          <Fab label={t("events.new")} onPress={() => router.push("/event/new")} />
        ) : null
      }
    >
      <Segmented
        label={t("events.views.label")}
        value={view}
        onChange={setView}
        options={[
          { value: "day", label: t("events.views.day"), icon: "today-outline" },
          { value: "week", label: t("events.views.week"), icon: "calendar-outline" },
          { value: "month", label: t("events.views.month"), icon: "grid-outline" },
        ]}
      />
      <Card>
        {view === "month" ? (
          <>
            <DateNav
              title={monthTitle(date, i18n.language)}
              previousLabel={t("bookings.previousMonth")}
              nextLabel={t("bookings.nextMonth")}
              onPrevious={() => setDate(addMonths(date, -1))}
              onNext={() => setDate(addMonths(date, 1))}
              onToday={date.slice(0, 7) !== today.slice(0, 7) ? () => setDate(today) : undefined}
            />
            <MonthGrid
              date={date}
              marks={marks}
              onDay={setDate}
              describe={(count) => t("events.count", { count })}
            />
          </>
        ) : (
          <WeekStrip
            selected={date}
            marked={(d) => (marks.get(d)?.count ?? 0) > 0}
            onSelect={(d) => {
              setDate(d);
              setView("day");
            }}
          />
        )}
      </Card>
      <Choice
        label={t("events.team")}
        value={teamId}
        onChange={setTeamId}
        options={[
          { value: "all", label: t("events.allTeams") },
          ...[...(teams.data?.teams ?? [])]
            .sort(byName)
            .map((team) => ({ value: team.id, label: team.name })),
        ]}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && empty ? (
        <>
          {view === "week" ? null : <DayHeading day={date} />}
          <EmptyState
            icon="calendar-clear-outline"
            text={t(view === "week" ? "events.empty" : "events.emptyDay")}
          />
        </>
      ) : (
        shown.map(([day, items]) => (
          <View key={day} style={styles.day}>
            <DayHeading day={day} />
            {items.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                onPress={() =>
                  router.push({ pathname: "/event/[eventId]", params: { eventId: e.id } })
                }
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function DayHeading({ day }: { day: string }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const today = todayLisbon();
  return (
    <Text style={[styles.dayHeading, { color: day === today ? colors.primary : colors.textMuted }]}>
      {day === today ? `${t("events.today")} · ` : ""}
      {dayHeading(day, i18n.language)}
    </Text>
  );
}

const styles = StyleSheet.create({
  day: { gap: spacing.sm },
  dayHeading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
});
