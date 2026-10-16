import {
  createIncidentSchema,
  fromLisbon,
  hasPermission,
  INCIDENT_TYPES,
  type IncidentType,
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
import { newClientKey } from "../../src/features/incidents/draft";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * Reports an incident. The idempotency key is made once per form, so sending again after a
 * lost connection never creates a second incident.
 */
export default function NewIncident() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const clubWide = !!me && hasPermission(me.roles, "incidents.write");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const [clientKey] = useState(newClientKey);
  const [form, setForm] = useState({
    type: "other" as IncidentType,
    date: todayLisbon(),
    time: "",
    place: "",
    teamId: "",
    description: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const when = parseLocal(form.date, form.time);
  const parsed = createIncidentSchema.safeParse({
    type: form.type,
    occurredAt: when && fromLisbon(when).toISOString(),
    place: form.place,
    teamId: form.teamId || null,
    description: form.description,
    clientKey,
  });
  const needsTeam = !clubWide && !form.teamId;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.incidents.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["incidents"] });
      router.back();
    },
  });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("incidents.new")}</Title>
      <Choice
        label={t("incidents.type")}
        value={form.type}
        onChange={set("type")}
        options={INCIDENT_TYPES.map((v) => ({ value: v, label: t(`incidentType.${v}`) }))}
      />
      {form.type === "injury" ? <Body muted>{t("incidents.injuryHint")}</Body> : null}
      <TextField label={t("incidents.date")} value={form.date} onChangeText={set("date")} />
      <TextField label={t("incidents.time")} value={form.time} onChangeText={set("time")} />
      <TextField label={t("incidents.place")} value={form.place} onChangeText={set("place")} />
      <Choice
        label={t("incidents.team")}
        value={form.teamId}
        onChange={set("teamId")}
        options={(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name }))}
      />
      {needsTeam && submitted ? <Message tone="error">{t("incidents.chooseTeam")}</Message> : null}
      <TextField
        label={t("incidents.description")}
        value={form.description}
        onChangeText={set("description")}
      />
      {submitted && !parsed.success ? (
        <Message tone="error">
          {t(when ? "incidents.needDescription" : "incidents.invalidTime")}
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
