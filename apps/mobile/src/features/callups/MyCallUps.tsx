import type { RsvpStatus } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { Choice } from "../../ui/Choice";
import { ListItem } from "../../ui/ListItem";
import { Body, Message } from "../../ui/Text";
import { clockTime, dayHeading, dayOf } from "../bookings/time";

/** Upcoming call-ups of the user and their wards, each with a going / not going answer. */
export function MyCallUps() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["callups", "mine"],
    queryFn: async () => jsonOrThrow(await api.callups.mine.$get()),
  });
  const answer = useMutation({
    mutationFn: async (v: { eventId: string; personId: string; rsvp: RsvpStatus }) =>
      jsonOrThrow(
        await api.callups.events[":eventId"].people[":personId"].rsvp.$put({
          param: { eventId: v.eventId, personId: v.personId },
          json: { rsvp: v.rsvp },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["callups", "mine"] }),
  });
  const callUps = mine.data?.callUps ?? [];
  if (callUps.length === 0) return null;
  return (
    <>
      <Body muted>{t("callups.mine")}</Body>
      {callUps.map((c) => (
        <Choice
          key={`${c.eventId}:${c.personId}`}
          label={`${c.personName} · ${t(`eventKinds.${c.kind}`)} · ${dayHeading(dayOf(c.startsAt), i18n.language)}, ${clockTime(c.startsAt)}`}
          value={c.rsvp === "pending" ? null : c.rsvp}
          onChange={(rsvp) =>
            answer.mutate({ eventId: c.eventId, personId: c.personId, rsvp: rsvp as RsvpStatus })
          }
          options={[
            { value: "going", label: t("rsvp.going") },
            { value: "not_going", label: t("rsvp.not_going") },
          ]}
        />
      ))}
      {answer.isError ? <Message tone="error">{t(errorKey(answer.error))}</Message> : null}
    </>
  );
}
