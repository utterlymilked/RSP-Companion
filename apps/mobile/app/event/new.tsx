import {
  createEventSchema,
  EVENT_KINDS,
  type EventKind,
  fromLisbon,
  HOME_AWAY,
  hasPermission,
  MATCH_FORMATS,
  MATCH_TYPES,
  parseLocal,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { todayLisbon } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { DateTimeField } from "../../src/ui/DateTimeField";
import { Screen } from "../../src/ui/Screen";
import { MultiSelect } from "../../src/ui/Select";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * Creates a training (optionally weekly), a match or a club event, optionally reserving a
 * space. Coaches and delegados pick their team and their space reservations stay requests.
 */
export default function NewEvent() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const clubWide = !!me && hasPermission(me.roles, "events.write");
  const facilities = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const [form, setForm] = useState({
    kind: "training" as EventKind,
    teamId: "",
    date: todayLisbon(),
    start: "",
    end: "",
    title: "",
    spaceId: "",
    departmentId: "",
    location: "",
    notes: "",
    repeatUntil: "",
    matchType: "friendly" as string,
    competition: "",
    round: "",
    format: "",
    opponent: "",
    homeAway: "home" as string,
    kit: "",
    transport: "",
    medicalCover: "",
  });
  const [participants, setParticipants] = useState({
    departmentIds: [] as string[],
    teamIds: [] as string[],
    userIds: [] as string[],
  });
  const pickable = useQuery({
    queryKey: ["event-participant-options"],
    enabled: clubWide,
    queryFn: async () => jsonOrThrow(await api.events["participant-options"].$get()),
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const start = parseLocal(form.date, form.start);
  const end = parseLocal(form.date, form.end);
  const isMatch = form.kind === "match";
  const parsed = createEventSchema.safeParse({
    kind: form.kind,
    teamId: form.teamId || null,
    title: form.title,
    startsAt: start && fromLisbon(start).toISOString(),
    endsAt: end && fromLisbon(end).toISOString(),
    spaceId: form.spaceId || null,
    departmentId: form.departmentId || null,
    location: form.location,
    notes: form.notes,
    participants,
    match: isMatch
      ? {
          matchType: form.matchType,
          competition: form.competition,
          round: form.round,
          format: form.format || null,
          opponent: form.opponent,
          homeAway: form.homeAway,
          kit: form.kit,
          transport: form.transport,
          medicalCover: form.medicalCover,
        }
      : null,
    repeat:
      form.kind === "training" && form.repeatUntil
        ? { everyWeeks: 1, until: form.repeatUntil }
        : null,
  });
  const needsTeam = !clubWide && !form.teamId;
  const needsDepartment = !!form.spaceId && !form.departmentId;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.events.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      router.back();
    },
  });

  const options = (values: readonly string[], prefix: string) =>
    values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{clubWide ? t("events.new") : t("events.request")}</Title>
      {clubWide ? null : <Body muted>{t("events.requestHint")}</Body>}
      <Choice
        label={t("events.kind")}
        value={form.kind}
        onChange={set("kind")}
        options={options(EVENT_KINDS, "eventKinds")}
      />
      <Choice
        label={t("events.team")}
        value={form.teamId}
        onChange={set("teamId")}
        options={(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name }))}
      />
      {needsTeam && submitted ? <Message tone="error">{t("events.chooseTeam")}</Message> : null}
      <DateTimeField
        label={t("events.date")}
        value={form.date}
        onChangeText={set("date")}
        mode="date"
      />
      <DateTimeField
        label={t("events.start")}
        value={form.start}
        onChangeText={set("start")}
        mode="time"
      />
      <DateTimeField
        label={t("events.end")}
        value={form.end}
        onChangeText={set("end")}
        mode="time"
      />
      <TextField label={t("events.titleLabel")} value={form.title} onChangeText={set("title")} />
      {isMatch ? (
        <>
          <TextField
            label={t("events.opponent")}
            value={form.opponent}
            onChangeText={set("opponent")}
          />
          <Choice
            label={t("events.matchType")}
            value={form.matchType}
            onChange={set("matchType")}
            options={options(MATCH_TYPES, "matchTypes")}
          />
          <TextField
            label={t("events.competition")}
            value={form.competition}
            onChangeText={set("competition")}
          />
          <TextField label={t("events.round")} value={form.round} onChangeText={set("round")} />
          <Choice
            label={t("events.format")}
            value={form.format}
            onChange={set("format")}
            options={options(MATCH_FORMATS, "matchFormats")}
          />
          <Choice
            label={t("events.homeAway")}
            value={form.homeAway}
            onChange={set("homeAway")}
            options={options(HOME_AWAY, "homeAway")}
          />
          <TextField label={t("events.kit")} value={form.kit} onChangeText={set("kit")} />
          <TextField
            label={t("events.transport")}
            value={form.transport}
            onChangeText={set("transport")}
          />
          <TextField
            label={t("events.medicalCover")}
            value={form.medicalCover}
            onChangeText={set("medicalCover")}
          />
        </>
      ) : null}
      <Choice
        label={t("events.space")}
        value={form.spaceId}
        onChange={(v) => setForm((f) => ({ ...f, spaceId: v === f.spaceId ? "" : v }))}
        options={(facilities.data?.spaces ?? [])
          .filter((s) => s.active)
          .map((s) => ({ value: s.id, label: s.name }))}
      />
      {form.spaceId ? (
        <Choice
          label={t("events.department")}
          value={form.departmentId}
          onChange={set("departmentId")}
          options={(facilities.data?.departments ?? []).map((d) => ({
            value: d.id,
            label: d.name,
          }))}
        />
      ) : (
        <TextField
          label={t("events.location")}
          value={form.location}
          onChangeText={set("location")}
        />
      )}
      {needsDepartment && submitted ? (
        <Message tone="error">{t("events.chooseDepartment")}</Message>
      ) : null}
      {clubWide ? (
        <>
          <MultiSelect
            label={t("events.participantOffices")}
            values={participants.departmentIds}
            onChange={(departmentIds) => setParticipants((p) => ({ ...p, departmentIds }))}
            options={(pickable.data?.departments ?? []).map((d) => ({
              value: d.id,
              label: d.name,
            }))}
          />
          <MultiSelect
            label={t("events.participantTeams")}
            values={participants.teamIds}
            onChange={(teamIds) => setParticipants((p) => ({ ...p, teamIds }))}
            options={(pickable.data?.teams ?? []).map((team) => ({
              value: team.id,
              label: team.name,
            }))}
          />
          <MultiSelect
            label={t("events.participantStaff")}
            values={participants.userIds}
            onChange={(userIds) => setParticipants((p) => ({ ...p, userIds }))}
            options={(pickable.data?.staff ?? []).map((u) => ({ value: u.id, label: u.name }))}
          />
        </>
      ) : null}
      <TextField label={t("events.notes")} value={form.notes} onChangeText={set("notes")} />
      {form.kind === "training" ? (
        <DateTimeField
          label={t("events.repeatUntil")}
          value={form.repeatUntil}
          onChangeText={set("repeatUntil")}
          mode="date"
          clearable
        />
      ) : null}
      {submitted && !parsed.success ? (
        <Message tone="error">
          {t(
            !start || !end
              ? "events.invalidTime"
              : isMatch && !form.opponent.trim()
                ? "events.needOpponent"
                : "errors.invalid_request",
          )}
        </Message>
      ) : null}
      {create.isError ? <Message tone="error">{t(errorKey(create.error))}</Message> : null}
      <Button
        label={t("common.save")}
        busy={create.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success && !needsTeam && !needsDepartment) create.mutate();
        }}
      />
    </Screen>
  );
}
