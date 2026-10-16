import {
  HEALTH_DISCIPLINES,
  type HealthDiscipline,
  INJURY_AVAILABILITIES,
  localDateString,
  toLisbon,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const today = () => localDateString(toLisbon(new Date()));
type Draft = { kind: "note" | "injury" } | null;

/**
 * Health records of one athlete, limited to the user's own discipline (the API enforces it
 * and audits every read). Minors need the guardian's consent before anything is recorded.
 */
export default function HealthRecords() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const permissions = useMe().data?.permissions ?? [];
  const canConsent = permissions.includes("health.consent");
  const writable = HEALTH_DISCIPLINES.filter((d) => permissions.includes(`health.${d}.write`));
  const [draft, setDraft] = useState<Draft>(null);
  const [discipline, setDiscipline] = useState<HealthDiscipline | undefined>(writable[0]);
  const [form, setForm] = useState({
    summary: "",
    bodyPart: "",
    description: "",
    date: today(),
    expectedReturn: "",
    impact: "unavailable" as (typeof INJURY_AVAILABILITIES)[number],
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const records = useQuery({
    queryKey: ["health", personId],
    queryFn: async () =>
      jsonOrThrow(await api.health.people[":personId"].records.$get({ param: { personId } })),
  });
  const needsGuardian =
    canConsent && records.data?.consent?.required && !records.data.consent.grantedOn;
  const guardians = useQuery({
    queryKey: ["person", personId, "guardians"],
    enabled: !!needsGuardian,
    queryFn: async () =>
      jsonOrThrow(await api.people[":personId"].guardians.$get({ param: { personId } })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["health", personId] });
    await queryClient.invalidateQueries({ queryKey: ["availability"] });
  };
  const done = async () => {
    setDraft(null);
    setSubmitted(false);
    setForm((f) => ({ ...f, summary: "", bodyPart: "", description: "", expectedReturn: "" }));
    await refresh();
  };

  const saveNote = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.health.people[":personId"].notes.$post({
          param: { personId },
          json: { discipline, recordedOn: form.date, summary: form.summary } as never,
        }),
      ),
    onSuccess: done,
  });
  const saveInjury = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.health.people[":personId"].injuries.$post({
          param: { personId },
          json: {
            discipline,
            bodyPart: form.bodyPart,
            description: form.description,
            startedOn: form.date,
            availability: form.impact,
            expectedReturnOn: form.expectedReturn || null,
          } as never,
        }),
      ),
    onSuccess: done,
  });
  const moveInjury = useMutation({
    mutationFn: async (v: { injuryId: string; status: "return_to_play" | "cleared" }) =>
      jsonOrThrow(
        await api.health.injuries[":injuryId"].$patch({
          param: { injuryId: v.injuryId },
          json: { status: v.status } as never,
        }),
      ),
    onSuccess: refresh,
  });
  const giveConsent = useMutation({
    mutationFn: async (grantedByPersonId: string) =>
      jsonOrThrow(
        await api.health.people[":personId"].consent.$post({
          param: { personId },
          json: { grantedByPersonId, grantedOn: today() } as never,
        }),
      ),
    onSuccess: refresh,
  });
  const revokeConsent = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.health.people[":personId"].consent.revoke.$post({ param: { personId } }),
      ),
    onSuccess: refresh,
  });

  if (records.isPending) return <Centered />;
  const consent = records.data?.consent;
  const error =
    records.error ??
    saveNote.error ??
    saveInjury.error ??
    moveInjury.error ??
    giveConsent.error ??
    revokeConsent.error;
  const blocked = !!consent?.required && !consent.grantedOn;
  const canWrite = writable.length > 0 && !blocked;
  const valid =
    discipline &&
    (draft?.kind === "note" ? form.summary.trim() : form.bodyPart.trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.date);
  const save = () => {
    setSubmitted(true);
    if (!valid) return;
    (draft?.kind === "note" ? saveNote : saveInjury).mutate();
  };

  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("health.title")}</Title>
      <Button
        label={t("health.documents")}
        variant="secondary"
        onPress={() => router.push({ pathname: "/documents/[personId]", params: { personId } })}
      />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {consent ? (
        <>
          <Body muted>{t("health.consentTitle")}</Body>
          <Body>
            {!consent.required
              ? t("health.consentNotNeeded")
              : consent.grantedOn
                ? t("health.consentGiven", { date: consent.grantedOn })
                : t("health.consentRequired")}
          </Body>
          {canConsent && consent.grantedOn ? (
            <Button
              label={t("health.revokeConsent")}
              variant="secondary"
              busy={revokeConsent.isPending}
              onPress={() => revokeConsent.mutate()}
            />
          ) : null}
          {needsGuardian
            ? guardians.data?.guardians.map((g) => (
                <Button
                  key={g.guardianId}
                  label={t("health.giveConsent", {
                    name: (g.guardian as { fullName?: string } | null)?.fullName ?? "",
                  })}
                  variant="secondary"
                  onPress={() => giveConsent.mutate(g.guardianId)}
                />
              ))
            : null}
        </>
      ) : null}

      {canWrite && !draft ? (
        <>
          <Button label={t("health.newNote")} onPress={() => setDraft({ kind: "note" })} />
          <Button
            label={t("health.newInjury")}
            variant="secondary"
            onPress={() => setDraft({ kind: "injury" })}
          />
        </>
      ) : null}
      {draft ? (
        <>
          {writable.length > 1 ? (
            <Choice
              label={t("health.discipline")}
              value={discipline ?? null}
              onChange={(v) => setDiscipline(v as HealthDiscipline)}
              options={writable.map((d) => ({ value: d, label: t(`health.disciplines.${d}`) }))}
            />
          ) : null}
          <TextField label={t("health.date")} value={form.date} onChangeText={set("date")} />
          {draft.kind === "note" ? (
            <TextField
              label={t("health.summary")}
              value={form.summary}
              onChangeText={set("summary")}
            />
          ) : (
            <>
              <TextField
                label={t("health.bodyPart")}
                value={form.bodyPart}
                onChangeText={set("bodyPart")}
              />
              <TextField
                label={t("health.description")}
                value={form.description}
                onChangeText={set("description")}
              />
              <Choice
                label={t("health.impact")}
                value={form.impact}
                onChange={set("impact")}
                options={INJURY_AVAILABILITIES.map((a) => ({
                  value: a,
                  label: t(`health.injuryImpact.${a}`),
                }))}
              />
              <TextField
                label={t("health.expectedReturn")}
                value={form.expectedReturn}
                onChangeText={set("expectedReturn")}
              />
            </>
          )}
          {submitted && !valid ? <Message tone="error">{t("health.needFields")}</Message> : null}
          <Button
            label={draft.kind === "note" ? t("health.saveNote") : t("health.saveInjury")}
            busy={saveNote.isPending || saveInjury.isPending}
            onPress={save}
          />
          <Button label={t("common.cancel")} variant="secondary" onPress={() => setDraft(null)} />
        </>
      ) : null}

      <Body muted>{t("health.injuries")}</Body>
      {records.data?.injuries.length === 0 ? <Body>{t("health.noRecords")}</Body> : null}
      {records.data?.injuries.map((i) => (
        <ListItem
          key={i.id}
          title={`${i.bodyPart} · ${t(`health.injuryStatus.${i.status}`)}`}
          subtitle={
            i.clearedOn
              ? t("health.cleared", { date: i.clearedOn })
              : t("health.since", { date: i.startedOn })
          }
          trailing={t(`health.disciplines.${i.discipline}`)}
        />
      ))}
      {records.data?.injuries.flatMap((i) =>
        i.status === "cleared" || !writable.includes(i.discipline)
          ? []
          : [
              i.status === "active" ? (
                <Button
                  key={`${i.id}:rtp`}
                  label={`${t("health.returnToPlay")} · ${i.bodyPart}`}
                  variant="secondary"
                  onPress={() => moveInjury.mutate({ injuryId: i.id, status: "return_to_play" })}
                />
              ) : null,
              <Button
                key={`${i.id}:clear`}
                label={`${t("health.clear")} · ${i.bodyPart}`}
                variant="secondary"
                onPress={() => moveInjury.mutate({ injuryId: i.id, status: "cleared" })}
              />,
            ],
      )}
      <Body muted>{t("health.notes")}</Body>
      {records.data?.notes.length === 0 ? <Body>{t("health.noRecords")}</Body> : null}
      {records.data?.notes.map((n) => (
        <ListItem
          key={n.id}
          title={n.summary}
          subtitle={n.recordedOn}
          trailing={t(`health.disciplines.${n.discipline}`)}
        />
      ))}
    </Screen>
  );
}
