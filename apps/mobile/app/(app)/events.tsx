import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import {
  addDays,
  clockTime,
  dayHeading,
  dayOf,
  mondayOf,
  todayLisbon,
} from "../../src/features/bookings/time";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** Week view of trainings, matches and club events, optionally for one team. */
export default function Events() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const [monday, setMonday] = useState(() => mondayOf(todayLisbon()));
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

  const days = new Map<string, NonNullable<typeof week.data>["events"]>();
  for (const event of week.data?.events ?? []) {
    const day = dayOf(event.startsAt);
    days.set(day, [...(days.get(day) ?? []), event]);
  }

  return (
    <Screen>
      {permissions.includes("events.write") ? (
        <Button label={t("events.new")} onPress={() => router.push("/event/new")} />
      ) : null}
      <Choice
        label={t("events.team")}
        value={teamId}
        onChange={setTeamId}
        options={[
          { value: "all", label: t("events.allTeams") },
          ...(teams.data?.teams.map((team) => ({ value: team.id, label: team.name })) ?? []),
        ]}
      />
      <Body>{t("events.weekOf", { date: dayHeading(monday, i18n.language) })}</Body>
      <Button
        label={t("events.previous")}
        variant="secondary"
        onPress={() => setMonday(addDays(monday, -7))}
      />
      <Button
        label={t("events.next")}
        variant="secondary"
        onPress={() => setMonday(addDays(monday, 7))}
      />
      <Button
        label={t("events.today")}
        variant="secondary"
        onPress={() => setMonday(mondayOf(todayLisbon()))}
      />
      {week.isError ? (
        <>
          <Message tone="error">{t(errorKey(week.error))}</Message>
          <Button label={t("common.retry")} onPress={() => week.refetch()} />
        </>
      ) : null}
      {week.data && days.size === 0 ? <Body>{t("events.empty")}</Body> : null}
      {[...days].map(([day, items]) => (
        <Day key={day} title={dayHeading(day, i18n.language)}>
          {items.map((e) => (
            <ListItem
              key={e.id}
              title={`${clockTime(e.startsAt)}–${clockTime(e.endsAt)} ${
                e.opponent
                  ? `${t(`eventKinds.${e.kind}`)} · ${e.opponent}`
                  : (e.title ?? t(`eventKinds.${e.kind}`))
              }`}
              subtitle={[
                e.teamName,
                e.spaceName ?? e.venueName ?? e.location,
                e.status === "scheduled" ? null : t(`eventStatus.${e.status}`),
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() =>
                router.push({ pathname: "/event/[eventId]", params: { eventId: e.id } })
              }
            />
          ))}
        </Day>
      ))}
    </Screen>
  );
}

function Day({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Body muted>{title}</Body>
      {children}
    </>
  );
}
