import {
  BOOKING_ACTIVITIES,
  BOOKING_STATUSES,
  type BookingActivity,
  createBookingSchema,
  fromLisbon,
  hasPermission,
  parseLocal,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import type { SpaceSummary } from "../../src/features/bookings/occupancy";
import { planOrder } from "../../src/features/bookings/planLayout";
import { byName, todayLisbon } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Select } from "../../src/ui/Select";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * Creates a booking, optionally repeating weekly. Club-wide writers pick the status; coaches
 * and delegados pick their team and send a request the club office confirms.
 */
export default function NewBooking() {
  const { t } = useTranslation();
  const router = useRouter();
  // Prefilled when booking from the floor plan or a free slot in the calendar.
  const params = useLocalSearchParams<{
    spaceId?: string;
    date?: string;
    start?: string;
    end?: string;
  }>();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const clubWide = !!me && hasPermission(me.roles, "bookings.write");
  const facilities = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const [form, setForm] = useState({
    spaceId: params.spaceId ?? "",
    departmentId: "",
    teamId: "",
    activity: "training" as BookingActivity,
    status: "to_confirm" as string,
    date: params.date ?? todayLisbon(),
    start: params.start ?? "",
    end: params.end ?? "",
    title: "",
    targetGroup: "",
    expectedAttendance: "",
    notes: "",
    repeatUntil: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const start = parseLocal(form.date, form.start);
  const end = parseLocal(form.date, form.end);
  const parsed = createBookingSchema.safeParse({
    spaceId: form.spaceId,
    departmentId: form.departmentId,
    teamId: form.teamId || null,
    activity: form.activity,
    status: clubWide ? form.status : "to_confirm",
    title: form.title,
    targetGroup: form.targetGroup,
    expectedAttendance: form.expectedAttendance,
    notes: form.notes,
    startsAt: start && fromLisbon(start).toISOString(),
    endsAt: end && fromLisbon(end).toISOString(),
    repeat: form.repeatUntil ? { everyWeeks: 1, until: form.repeatUntil } : null,
  });
  const needsTeam = !clubWide && !form.teamId;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.bookings.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      router.back();
    },
  });

  const spaces = (facilities.data?.spaces ?? []) as SpaceSummary[];
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{clubWide ? t("bookings.new") : t("bookings.request")}</Title>
      {clubWide ? null : <Body muted>{t("bookings.requestHint")}</Body>}
      <Select
        icon="location-outline"
        label={t("bookings.space")}
        placeholder={t("common.choose")}
        value={form.spaceId}
        onChange={set("spaceId")}
        options={planOrder(spaces).map((s) => ({ value: s.id, label: s.name }))}
      />
      <Select
        icon="briefcase-outline"
        label={t("bookings.department")}
        placeholder={t("common.choose")}
        value={form.departmentId}
        onChange={set("departmentId")}
        options={(facilities.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
      />
      <Select
        icon="shirt-outline"
        label={t("bookings.team")}
        value={form.teamId}
        onChange={set("teamId")}
        options={[
          { value: "", label: t("bookings.noTeam") },
          ...[...(teams.data?.teams ?? [])]
            .sort(byName)
            .map((team) => ({ value: team.id, label: team.name })),
        ]}
      />
      {needsTeam && submitted ? <Message tone="error">{t("bookings.chooseTeam")}</Message> : null}
      <Choice
        scroll
        label={t("bookings.activity")}
        value={form.activity}
        onChange={set("activity")}
        options={BOOKING_ACTIVITIES.map((a) => ({ value: a, label: t(`activities.${a}`) }))}
      />
      {clubWide ? (
        <Select
          icon="flag-outline"
          label={t("bookings.status")}
          value={form.status}
          onChange={set("status")}
          options={BOOKING_STATUSES.map((s) => ({ value: s, label: t(`bookingStatus.${s}`) }))}
        />
      ) : null}
      <TextField label={t("bookings.date")} value={form.date} onChangeText={set("date")} />
      <TextField label={t("bookings.start")} value={form.start} onChangeText={set("start")} />
      <TextField label={t("bookings.end")} value={form.end} onChangeText={set("end")} />
      <TextField label={t("bookings.titleLabel")} value={form.title} onChangeText={set("title")} />
      <TextField
        label={t("bookings.targetGroup")}
        value={form.targetGroup}
        onChangeText={set("targetGroup")}
      />
      <TextField
        label={t("bookings.expected")}
        value={form.expectedAttendance}
        onChangeText={set("expectedAttendance")}
        keyboardType="numeric"
      />
      <TextField label={t("bookings.notes")} value={form.notes} onChangeText={set("notes")} />
      <TextField
        label={t("bookings.repeatUntil")}
        value={form.repeatUntil}
        onChangeText={set("repeatUntil")}
      />
      {submitted && !parsed.success ? (
        <Message tone="error">
          {t(start && end ? "errors.invalid_request" : "bookings.invalidTime")}
        </Message>
      ) : null}
      {create.isError ? <Message tone="error">{t(errorKey(create.error))}</Message> : null}
      <Button
        label={t("common.save")}
        busy={create.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success && !needsTeam) create.mutate();
        }}
      />
    </Screen>
  );
}
