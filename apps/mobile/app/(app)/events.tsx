import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import {
  addDays,
  byName,
  dateParts,
  dayHeading,
  dayOf,
  mondayOf,
  todayLisbon,
} from "../../src/features/bookings/time";
import { EventCard, type EventSummary } from "../../src/features/events/EventCard";
import { fontSize, radius, spacing, useColors } from "../../src/theme";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { EmptyState } from "../../src/ui/EmptyState";
import { Fab } from "../../src/ui/Fab";
import { Screen } from "../../src/ui/Screen";
import { Message } from "../../src/ui/Text";

/** Week view of trainings, matches and club events, optionally for one team. */
export default function Events() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const today = todayLisbon();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [teamId, setTeamId] = useState("all");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const week = useQuery({
    queryKey: ["events", monday, teamId],
    queryFn: async () =>
      jsonOrThrow(
        await api.events.$get({
          query: { from: monday, to: addDays(monday, 6), ...(teamId === "all" ? {} : { teamId }) },
        }),
      ),
  });

  const days = new Map<string, EventSummary[]>();
  for (const event of (week.data?.events ?? []) as EventSummary[]) {
    const day = dayOf(event.startsAt);
    days.set(day, [...(days.get(day) ?? []), event]);
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const first = dateParts(monday, i18n.language);
  const last = dateParts(addDays(monday, 6), i18n.language);

  return (
    <Screen
      overlay={
        permissions.includes("events.write") ? (
          <Fab label={t("events.new")} onPress={() => router.push("/event/new")} />
        ) : null
      }
    >
      <View style={[styles.week, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.weekRow}>
          <RoundButton
            icon="chevron-back"
            label={t("events.previous")}
            onPress={() => setMonday(addDays(monday, -7))}
          />
          <Text
            accessibilityRole="header"
            accessibilityLabel={t("events.weekOf", { date: dayHeading(monday, i18n.language) })}
            style={[styles.weekTitle, { color: colors.text }]}
          >
            {`${first.day} ${first.month.replace(".", "")} – ${last.day} ${last.month.replace(".", "")}`}
          </Text>
          <RoundButton
            icon="chevron-forward"
            label={t("events.next")}
            onPress={() => setMonday(addDays(monday, 7))}
          />
        </View>
        <View style={styles.strip}>
          {weekDays.map((day) => {
            const parts = dateParts(day, i18n.language);
            const isToday = day === today;
            const busy = days.has(day);
            return (
              <View
                key={day}
                style={[styles.dayCell, isToday && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[styles.dayName, { color: isToday ? colors.onPrimary : colors.textMuted }]}
                >
                  {parts.weekday.replace(".", "").slice(0, 3)}
                </Text>
                <Text
                  style={[styles.dayNumber, { color: isToday ? colors.onPrimary : colors.text }]}
                >
                  {parts.day}
                </Text>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: busy
                        ? isToday
                          ? colors.accent
                          : colors.primary
                        : "transparent",
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        {monday !== mondayOf(today) ? (
          <Button
            compact
            variant="secondary"
            icon="today-outline"
            label={t("events.today")}
            onPress={() => setMonday(mondayOf(today))}
          />
        ) : null}
      </View>
      <Choice
        scroll
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
      {week.isError ? (
        <>
          <Message tone="error">{t(errorKey(week.error))}</Message>
          <Button label={t("common.retry")} onPress={() => week.refetch()} />
        </>
      ) : null}
      {week.data && days.size === 0 ? (
        <EmptyState icon="calendar-clear-outline" text={t("events.empty")} />
      ) : null}
      {[...days].map(([day, items]) => (
        <View key={day} style={styles.day}>
          <Text
            style={[
              styles.dayHeading,
              { color: day === today ? colors.primary : colors.textMuted },
            ]}
          >
            {day === today ? `${t("events.today")} · ` : ""}
            {dayHeading(day, i18n.language)}
          </Text>
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
      ))}
    </Screen>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-back" | "chevron-forward";
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: colors.primarySoft },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  week: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "stretch",
  },
  weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  weekTitle: { fontSize: fontSize.lg, fontWeight: "800" },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  strip: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
    gap: 2,
  },
  dayName: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase" },
  dayNumber: { fontSize: fontSize.md, fontWeight: "800" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  day: { gap: spacing.sm },
  dayHeading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
});
