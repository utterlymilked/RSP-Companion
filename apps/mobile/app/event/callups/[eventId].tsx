import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@rsc/shared";
import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { api } from "../../../src/api";
import { useMe } from "../../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../../src/errors";
import {
  flushMarks,
  type PendingMark,
  pendingMarks,
  queueMark,
} from "../../../src/features/callups/outbox";
import { spacing } from "../../../src/theme";
import { BackBar } from "../../../src/ui/BackBar";
import { Badge } from "../../../src/ui/Badge";
import { Button } from "../../../src/ui/Button";
import { Centered } from "../../../src/ui/Centered";
import { Choice } from "../../../src/ui/Choice";
import { ListItem } from "../../../src/ui/ListItem";
import { Screen } from "../../../src/ui/Screen";
import { MultiSelect } from "../../../src/ui/Select";
import { Body, Message, Title } from "../../../src/ui/Text";

/**
 * Call-up list of one event: who is called up, their answers, and attendance taken by the
 * coach. Marks are queued on the device first and sent when there is a connection, so
 * attendance can be taken at a field without signal.
 */
export default function EventCallUps() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const canWrite = !!useMe().data?.permissions.includes("callups.write");
  const [queued, setQueued] = useState<PendingMark[]>([]);

  const list = useQuery({
    queryKey: ["callups", eventId],
    queryFn: async () =>
      jsonOrThrow(await api.callups.events[":eventId"].$get({ param: { eventId } })),
  });
  const callUp = useMutation({
    mutationFn: async () =>
      jsonOrThrow(await api.callups.events[":eventId"].$post({ param: { eventId }, json: {} })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["callups", eventId] }),
  });

  const [picked, setPicked] = useState<string[] | null>(null);
  const saveSquad = useMutation({
    mutationFn: async (ids: string[]) => {
      const current = (list.data?.participants ?? []).map((p) => p.personId);
      const add = ids.filter((id) => !current.includes(id));
      if (add.length > 0) {
        await jsonOrThrow(
          await api.callups.events[":eventId"].$post({
            param: { eventId },
            json: { personIds: add },
          }),
        );
      }
      for (const personId of current.filter((id) => !ids.includes(id))) {
        const res = await api.callups.events[":eventId"].people[":personId"].$delete({
          param: { eventId, personId },
        });
        if (!res.ok) await jsonOrThrow(res);
      }
    },
    onSuccess: () => {
      setPicked(null);
      return queryClient.invalidateQueries({ queryKey: ["callups", eventId] });
    },
  });
  const remind = useMutation({
    mutationFn: async () =>
      jsonOrThrow(await api.callups.events[":eventId"].remind.$post({ param: { eventId } })),
  });

  const sync = useCallback(async () => {
    try {
      const left = await flushMarks(eventId, async (marks) => {
        await jsonOrThrow(
          await api.callups.events[":eventId"].attendance.$put({
            param: { eventId },
            json: { marks: marks as never },
          }),
        );
      });
      setQueued(left);
      await queryClient.invalidateQueries({ queryKey: ["callups", eventId] });
    } catch {
      setQueued(await pendingMarks(eventId));
    }
  }, [eventId, queryClient]);

  useEffect(() => {
    void sync();
    return onlineManager.subscribe((online) => {
      if (online) void sync();
    });
  }, [sync]);

  const mark = async (personId: string, status: AttendanceStatus) => {
    setQueued(await queueMark(eventId, { personId, status, markedAt: new Date().toISOString() }));
    void sync();
  };

  if (list.isPending) return <Centered />;
  const participants = list.data?.participants ?? [];
  const roster = list.data?.roster ?? [];
  const count = (rsvp: string) => participants.filter((p) => p.rsvp === rsvp).length;
  const calledIds = participants.map((p) => p.personId);
  const squadOptions = [
    ...roster.map((r) => ({
      value: r.personId,
      label: `${r.shirtNumber ? `#${r.shirtNumber} ` : ""}${r.name}`,
    })),
    // Called up but no longer on the roster: still shown so they can be removed.
    ...participants
      .filter((p) => !roster.some((r) => r.personId === p.personId))
      .map((p) => ({ value: p.personId, label: p.name })),
  ];
  const attendanceOf = (personId: string, saved: string | null) =>
    queued.find((m) => m.personId === personId)?.status ?? saved;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("callups.title")}</Title>
      {list.isError ? <Message tone="error">{t(errorKey(list.error))}</Message> : null}
      {queued.length > 0 ? (
        <Message tone="error">{t("callups.pending", { count: queued.length })}</Message>
      ) : null}
      {participants.length > 0 ? (
        <View style={styles.summary}>
          <Badge label={`${t("rsvp.going")}: ${count("going")}`} tone="success" />
          <Badge label={`${t("rsvp.not_going")}: ${count("not_going")}`} tone="danger" />
          <Badge label={`${t("rsvp.pending")}: ${count("pending")}`} tone="warning" />
        </View>
      ) : null}
      {canWrite ? (
        <>
          <MultiSelect
            label={t("callups.squad")}
            placeholder={t("callups.squadPlaceholder")}
            values={picked ?? calledIds}
            onChange={setPicked}
            options={squadOptions}
          />
          {picked ? (
            <Button
              label={t("callups.saveSquad")}
              busy={saveSquad.isPending}
              onPress={() => saveSquad.mutate(picked)}
            />
          ) : (
            <Button
              label={t("callups.callUpRoster")}
              variant="secondary"
              busy={callUp.isPending}
              onPress={() => callUp.mutate()}
            />
          )}
          {count("pending") > 0 ? (
            <Button
              label={t("callups.remind")}
              variant="tertiary"
              icon="notifications-outline"
              busy={remind.isPending}
              onPress={() => remind.mutate()}
            />
          ) : null}
          {remind.isSuccess ? (
            <Message tone="success">
              {t("callups.reminded", { count: remind.data.reminded })}
            </Message>
          ) : null}
          {saveSquad.isError ? (
            <Message tone="error">{t(errorKey(saveSquad.error))}</Message>
          ) : null}
        </>
      ) : null}
      {callUp.isError ? <Message tone="error">{t(errorKey(callUp.error))}</Message> : null}
      {remind.isError ? <Message tone="error">{t(errorKey(remind.error))}</Message> : null}
      {participants.length === 0 ? <Body>{t("callups.empty")}</Body> : null}
      {participants.map((p) =>
        canWrite ? (
          <Choice
            key={p.personId}
            label={`${p.shirtNumber ? `#${p.shirtNumber} ` : ""}${p.name} · ${t(`rsvp.${p.rsvp}`)}`}
            value={attendanceOf(p.personId, p.attendance)}
            onChange={(status) => void mark(p.personId, status as AttendanceStatus)}
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: t(`attendance.${s}`) }))}
          />
        ) : (
          <ListItem
            key={p.personId}
            title={p.name}
            subtitle={t(`rsvp.${p.rsvp}`)}
            trailing={p.attendance ? t(`attendance.${p.attendance}`) : undefined}
          />
        ),
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
