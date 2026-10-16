import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@rsc/shared";
import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../src/api";
import { useMe } from "../../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../../src/errors";
import {
  flushMarks,
  type PendingMark,
  pendingMarks,
  queueMark,
} from "../../../src/features/callups/outbox";
import { Button } from "../../../src/ui/Button";
import { Centered } from "../../../src/ui/Centered";
import { Choice } from "../../../src/ui/Choice";
import { ListItem } from "../../../src/ui/ListItem";
import { Screen } from "../../../src/ui/Screen";
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
  const attendanceOf = (personId: string, saved: string | null) =>
    queued.find((m) => m.personId === personId)?.status ?? saved;
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("callups.title")}</Title>
      {list.isError ? <Message tone="error">{t(errorKey(list.error))}</Message> : null}
      {queued.length > 0 ? (
        <Message tone="error">{t("callups.pending", { count: queued.length })}</Message>
      ) : null}
      {canWrite ? (
        <Button
          label={t("callups.callUpRoster")}
          variant="secondary"
          busy={callUp.isPending}
          onPress={() => callUp.mutate()}
        />
      ) : null}
      {callUp.isError ? <Message tone="error">{t(errorKey(callUp.error))}</Message> : null}
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
