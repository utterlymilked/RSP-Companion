import Ionicons from "@expo/vector-icons/Ionicons";
import { EVENT_STATUSES } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayHeading, dayOf } from "../../src/features/bookings/time";
import { eventHeadline } from "../../src/features/events/EventCard";
import { spacing, useColors } from "../../src/theme";
import { BackBar } from "../../src/ui/BackBar";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";
import { Tile, TileGrid } from "../../src/ui/Tile";

/** One event with its match details; writers can change its status and notes. */
export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const colors = useColors();
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
  const who = event.data?.participants;
  const participantRows = (
    [
      [t("events.participantOffices"), who?.departments],
      [t("events.participantTeams"), who?.teams],
      [t("events.participantStaff"), who?.staff],
    ] as const
  ).flatMap(([label, list]) => (list?.length ? [[label, list.map((x) => x.name)] as const] : []));
  const place = e
    ? [...new Set([e.spaceName, e.venueName, e.location].filter(Boolean))].join(" · ")
    : "";
  const statusTone =
    e?.status === "cancelled" ? "danger" : e?.status === "postponed" ? "warning" : null;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {event.isError ? <Message tone="error">{t(errorKey(event.error))}</Message> : null}
      {e ? (
        <>
          <Card>
            <View style={styles.badges}>
              <Badge label={t(`eventKinds.${e.kind}`)} tone="primary" />
              {e.competition ? <Badge label={e.competition} /> : null}
              {statusTone ? <Badge label={t(`eventStatus.${e.status}`)} tone={statusTone} /> : null}
            </View>
            <Title>{eventHeadline(e, t)}</Title>
            <InfoRow
              icon="calendar-outline"
              text={`${dayHeading(dayOf(e.startsAt), i18n.language)}, ${clockTime(e.startsAt)}–${clockTime(e.endsAt)}`}
            />
            {e.teamName && e.teamName !== eventHeadline(e, t) ? (
              <InfoRow icon="shirt-outline" text={e.teamName} />
            ) : null}
            {place ? (
              <InfoRow
                icon="location-outline"
                text={
                  e.homeAway ? `${place} (${t(`homeAway.${e.homeAway}`).toLowerCase()})` : place
                }
              />
            ) : null}
            {e.bookingStatus ? (
              <InfoRow
                icon="key-outline"
                text={`${t("events.space_booked")} · ${t(`bookingStatus.${e.bookingStatus}`)}`}
              />
            ) : null}
            {e.seriesId ? <InfoRow icon="repeat-outline" text={t("events.inSeries")} /> : null}
          </Card>
          {participantRows.length > 0 ? (
            <Card flush>
              {participantRows.map(([label, names]) => (
                <View key={label} style={[styles.detail, { borderColor: colors.border }]}>
                  <Body muted>{label}</Body>
                  <Body style={styles.value}>{names.join(", ")}</Body>
                </View>
              ))}
            </Card>
          ) : null}
          {permissions.includes("callups.read") ? (
            <TileGrid>
              <Tile
                icon="people"
                label={t("callups.open")}
                onPress={() =>
                  router.push({ pathname: "/event/callups/[eventId]", params: { eventId } })
                }
              />
              <Tile
                icon="bus"
                label={t("transport.open")}
                onPress={() =>
                  router.push({ pathname: "/event/transport/[eventId]", params: { eventId } })
                }
              />
            </TileGrid>
          ) : null}
          {rows.some(([, value]) => value) ? (
            <Card flush>
              {rows.map(([label, value]) =>
                value ? (
                  <View key={label} style={[styles.detail, { borderColor: colors.border }]}>
                    <Body muted>{label}</Body>
                    <Body style={styles.value}>{value}</Body>
                  </View>
                ) : null,
              )}
            </Card>
          ) : null}
          {e.notes ? (
            <Card>
              <Body>{e.notes}</Body>
            </Card>
          ) : null}
          {canWrite ? (
            <Section title={t("events.manage")}>
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
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function InfoRow({ icon, text }: { icon: ComponentProps<typeof Ionicons>["name"]; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Body style={styles.infoText}>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  info: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoText: { flex: 1 },
  detail: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  value: { flexShrink: 1, textAlign: "right", fontWeight: "600" },
});
