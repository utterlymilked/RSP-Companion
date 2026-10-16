import { BOOKING_STATUSES, hasPermission } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayHeading, dayOf } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * One booking. The club office can change its status (alone or for the rest of a series);
 * coaches and delegados of the team can record attendance and withdraw a request.
 */
export default function BookingDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const me = useMe().data;
  const canWrite = !!me?.permissions.includes("bookings.write");
  const clubWide = !!me && hasPermission(me.roles, "bookings.write");
  const [following, setFollowing] = useState(false);
  const [actual, setActual] = useState<string | null>(null);

  const booking = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () =>
      jsonOrThrow(await api.bookings[":bookingId"].$get({ param: { bookingId } })),
  });
  const update = useMutation({
    mutationFn: async (json: { status?: string; actualAttendance?: string }) =>
      jsonOrThrow(
        await api.bookings[":bookingId"].$patch({
          param: { bookingId },
          json: { ...json, applyTo: following ? "following" : "one" } as never,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
    },
  });

  if (booking.isPending) return <Centered />;
  const b = booking.data?.booking;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {booking.isError ? <Message tone="error">{t(errorKey(booking.error))}</Message> : null}
      {b ? (
        <>
          <Title>{b.title ?? t(`activities.${b.activity}`)}</Title>
          <ListItem
            title={`${dayHeading(dayOf(b.startsAt), i18n.language)}, ${clockTime(b.startsAt)}–${clockTime(b.endsAt)}`}
            subtitle={`${b.spaceName} · ${b.venueName}`}
          />
          <ListItem title={b.departmentName} subtitle={t(`bookingStatus.${b.status}`)} />
          {b.targetGroup ? (
            <ListItem title={b.targetGroup} subtitle={t("bookings.targetGroup")} />
          ) : null}
          {b.expectedAttendance !== null ? (
            <ListItem title={String(b.expectedAttendance)} subtitle={t("bookings.expected")} />
          ) : null}
          {b.notes ? <Body>{b.notes}</Body> : null}
          {b.seriesId ? <Body muted>{t("bookings.inSeries")}</Body> : null}
          {canWrite ? (
            <>
              {b.seriesId ? (
                <Choice
                  label={t("bookings.applyFollowing")}
                  value={following ? "yes" : "no"}
                  onChange={(v) => setFollowing(v === "yes")}
                  options={[
                    { value: "no", label: "1" },
                    { value: "yes", label: "+" },
                  ]}
                />
              ) : null}
              <TextField
                label={t("bookings.actual")}
                value={actual ?? String(b.actualAttendance ?? "")}
                onChangeText={setActual}
                keyboardType="numeric"
              />
              <Button
                label={t("bookings.saveAttendance")}
                variant="secondary"
                busy={update.isPending}
                onPress={() => update.mutate({ actualAttendance: actual ?? "" })}
              />
              {clubWide ? (
                <Choice
                  label={t("bookings.setStatus")}
                  value={b.status}
                  onChange={(status) => update.mutate({ status })}
                  options={BOOKING_STATUSES.map((s) => ({
                    value: s,
                    label: t(`bookingStatus.${s}`),
                  }))}
                />
              ) : (
                <Button
                  label={t("bookings.cancel")}
                  variant="secondary"
                  onPress={() => update.mutate({ status: "cancelled" })}
                />
              )}
              {update.isError ? <Message tone="error">{t(errorKey(update.error))}</Message> : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
