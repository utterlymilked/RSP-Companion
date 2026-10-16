import { EVENT_STATUSES } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayHeading, dayOf } from "../../src/features/bookings/time";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** One event with its match details; writers can change its status and notes. */
export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const permissions = useMe().data?.permissions ?? [];
  const canWrite = permissions.includes("events.write");
  const [notes, setNotes] = useState<string | null>(null);

  const event = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => jsonOrThrow(await api.events[":eventId"].$get({ param: { eventId } })),
  });
  const update = useMutation({
    mutationFn: async (json: { status?: string; notes?: string }) =>
      jsonOrThrow(await api.events[":eventId"].$patch({ param: { eventId }, json: json as never })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  if (event.isPending) return <Centered />;
  const e = event.data?.event;
  const rows = e
    ? ([
        [t("events.matchType"), e.matchType && t(`matchTypes.${e.matchType}`)],
        [t("events.competition"), e.competition],
        [t("events.round"), e.round],
        [t("events.format"), e.format && t(`matchFormats.${e.format}`)],
        [t("events.homeAway"), e.homeAway && t(`homeAway.${e.homeAway}`)],
        [t("events.kit"), e.kit],
        [t("events.transport"), e.transport],
        [t("events.medicalCover"), e.medicalCover],
      ] as const)
    : [];
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      {event.isError ? <Message tone="error">{t(errorKey(event.error))}</Message> : null}
      {e ? (
        <>
          <Title>
            {e.opponent
              ? `${e.teamName ?? ""} – ${e.opponent}`
              : (e.title ?? t(`eventKinds.${e.kind}`))}
          </Title>
          <ListItem
            title={`${dayHeading(dayOf(e.startsAt), i18n.language)}, ${clockTime(e.startsAt)}–${clockTime(e.endsAt)}`}
            subtitle={`${t(`eventKinds.${e.kind}`)} · ${t(`eventStatus.${e.status}`)}`}
          />
          {e.teamName ? <ListItem title={e.teamName} subtitle={t("events.team")} /> : null}
          {e.spaceName || e.venueName || e.location ? (
            <ListItem
              title={[e.spaceName, e.venueName, e.location].filter(Boolean).join(" · ")}
              subtitle={
                e.bookingStatus
                  ? `${t("events.space_booked")} · ${t(`bookingStatus.${e.bookingStatus}`)}`
                  : t("events.space_booked")
              }
            />
          ) : null}
          {rows.map(([label, value]) =>
            value ? <ListItem key={label} title={value} subtitle={label} /> : null,
          )}
          {e.notes ? <Body>{e.notes}</Body> : null}
          {permissions.includes("callups.read") ? (
            <Button
              label={t("callups.open")}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: "/event/callups/[eventId]", params: { eventId } })
              }
            />
          ) : null}
          {permissions.includes("callups.read") ? (
            <Button
              label={t("transport.open")}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: "/event/transport/[eventId]", params: { eventId } })
              }
            />
          ) : null}
          {e.seriesId ? <Body muted>{t("events.inSeries")}</Body> : null}
          {canWrite ? (
            <>
              <Choice
                label={t("events.setStatus")}
                value={e.status}
                onChange={(status) => update.mutate({ status })}
                options={EVENT_STATUSES.map((s) => ({ value: s, label: t(`eventStatus.${s}`) }))}
              />
              <TextField
                label={t("events.notes")}
                value={notes ?? e.notes ?? ""}
                onChangeText={setNotes}
              />
              <Button
                label={t("events.save")}
                variant="secondary"
                busy={update.isPending}
                onPress={() => update.mutate({ notes: notes ?? e.notes ?? "" })}
              />
              {update.isError ? <Message tone="error">{t(errorKey(update.error))}</Message> : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
