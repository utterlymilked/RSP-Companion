import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** Week view of the rooms and fields calendar, optionally for one space. */
export default function Bookings() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const [monday, setMonday] = useState(() => mondayOf(todayLisbon()));
  const [spaceId, setSpaceId] = useState("all");
  const facilities = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const week = useQuery({
    queryKey: ["bookings", monday, spaceId],
    queryFn: async () =>
      jsonOrThrow(
        await api.bookings.$get({
          query: {
            from: monday,
            to: addDays(monday, 6),
            ...(spaceId === "all" ? {} : { spaceId }),
          },
        }),
      ),
  });

  const days = new Map<string, NonNullable<typeof week.data>["bookings"]>();
  for (const booking of week.data?.bookings ?? []) {
    const day = dayOf(booking.startsAt);
    days.set(day, [...(days.get(day) ?? []), booking]);
  }

  return (
    <Screen
      overlay={
        permissions.includes("bookings.write") ? (
          <Fab label={t("bookings.new")} onPress={() => router.push("/booking/new")} />
        ) : null
      }
    >
      <Choice
        label={t("bookings.space")}
        value={spaceId}
        onChange={setSpaceId}
        options={[
          { value: "all", label: t("bookings.allSpaces") },
          ...(facilities.data?.spaces
            .filter((s) => s.active)
            .map((s) => ({ value: s.id, label: s.name })) ?? []),
        ]}
      />
      <Body>{t("bookings.weekOf", { date: dayHeading(monday, i18n.language) })}</Body>
      <Button
        label={t("bookings.previous")}
        variant="secondary"
        onPress={() => setMonday(addDays(monday, -7))}
      />
      <Button
        label={t("bookings.next")}
        variant="secondary"
        onPress={() => setMonday(addDays(monday, 7))}
      />
      <Button
        label={t("bookings.today")}
        variant="secondary"
        onPress={() => setMonday(mondayOf(todayLisbon()))}
      />
      {week.isError ? (
        <>
          <Message tone="error">{t(errorKey(week.error))}</Message>
          <Button label={t("common.retry")} onPress={() => week.refetch()} />
        </>
      ) : null}
      {week.data && days.size === 0 ? <Body>{t("bookings.empty")}</Body> : null}
      {[...days].map(([day, items]) => (
        <Section key={day} title={dayHeading(day, i18n.language)}>
          {items.map((b) => (
            <ListItem
              key={b.id}
              title={`${clockTime(b.startsAt)}–${clockTime(b.endsAt)} ${b.title ?? t(`activities.${b.activity}`)}`}
              subtitle={`${b.spaceName} · ${b.departmentName} · ${t(`bookingStatus.${b.status}`)}`}
              onPress={() =>
                router.push({ pathname: "/booking/[bookingId]", params: { bookingId: b.id } })
              }
            />
          ))}
        </Section>
      ))}
      <CalendarLink />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Body muted>{title}</Body>
      {children}
    </>
  );
}

/** Personal iCal link for calendar apps, shown on request and replaceable. */
function CalendarLink() {
  const { t } = useTranslation();
  const show = useMutation({
    mutationFn: async () => jsonOrThrow(await api.bookings.feed.$get()),
  });
  const rotate = useMutation({
    mutationFn: async () => jsonOrThrow(await api.bookings.feed.rotate.$post()),
  });
  const url = rotate.data?.url ?? show.data?.url;
  return (
    <>
      <Body muted>{t("bookings.calendarLink")}</Body>
      {url ? (
        <>
          <Body>{url}</Body>
          <Body muted>{t("bookings.calendarHint")}</Body>
          <Button
            label={t("bookings.newLink")}
            variant="secondary"
            busy={rotate.isPending}
            onPress={() => rotate.mutate()}
          />
        </>
      ) : (
        <Button
          label={t("bookings.showLink")}
          variant="secondary"
          busy={show.isPending}
          onPress={() => show.mutate()}
        />
      )}
      {show.isError || rotate.isError ? (
        <Message tone="error">{t(errorKey(show.error ?? rotate.error))}</Message>
      ) : null}
    </>
  );
}
