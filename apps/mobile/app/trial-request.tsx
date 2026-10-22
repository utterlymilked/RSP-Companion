import {
  ageOn,
  GUARDIAN_RELATIONS,
  PROSPECT_CONTEXTS,
  PROSPECT_ESCALOES,
  PROSPECT_ID_TYPES,
  PROSPECT_POSITIONS,
  trialRequestSchema,
} from "@rsc/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../src/api";
import { errorKey, jsonOrThrow } from "../src/errors";
import { BackBar } from "../src/ui/BackBar";
import { Button } from "../src/ui/Button";
import { Choice } from "../src/ui/Choice";
import { DateTimeField } from "../src/ui/DateTimeField";
import { Screen } from "../src/ui/Screen";
import { Section } from "../src/ui/Section";
import { MultiSelect, Select } from "../src/ui/Select";
import { Body, Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";

const EMPTY = {
  fullName: "",
  birthDate: "",
  targetEscalao: "",
  context: "",
  currentClub: "",
  positions: [] as string[],
  heightCm: "",
  seasonsPlayed: "",
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  guardianEmail: "",
  ownContact: "",
  socialUrl: "",
  idType: "",
  nationality: "",
  birthplace: "",
  postalCode: "",
  area: "",
  preferredDate: "",
  alternativeDate: "",
  clubAuthorisationNeeded: "",
  motive: "",
  goal: "",
  notes: "",
  consent: "",
};

const num = (v: string) => (v.trim() ? Number(v) : null);

/**
 * Public "pedido de treino de observação" (no login): a player, or the guardian of a minor,
 * asks the club for an observation training. Stored as a scouting prospect with source
 * `request`; the privacy notice must be accepted (RGPD) before it can be sent.
 */
export default function TrialRequest() {
  const { t } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const minor = form.birthDate ? ageOn(form.birthDate, new Date()) < 18 : true;
  const parsed = trialRequestSchema.safeParse({
    ...form,
    positions: form.positions,
    heightCm: num(form.heightCm),
    seasonsPlayed: num(form.seasonsPlayed),
    clubAuthorisationNeeded: form.clubAuthorisationNeeded === "yes",
    birthDate: form.birthDate || undefined,
    consent: form.consent === "yes" ? true : undefined,
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api["trial-requests"].$post({ json: parsed.data as never }));
    },
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <Screen>
        <Title>{t("trialRequest.thanksTitle")}</Title>
        <Body>{t("trialRequest.thanks")}</Body>
        <Button label={t("trialRequest.back")} onPress={() => router.replace("/")} />
      </Screen>
    );
  }
  const err = (key: string) => (submitted && !fieldOk(key) ? t("trialRequest.required") : null);
  function fieldOk(key: string) {
    if (parsed.success) return true;
    return !parsed.error.issues.some((i) => i.path[0] === key);
  }
  const options = (values: readonly string[], prefix: string) =>
    values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
  const yesNo = [
    { value: "yes", label: t("common.yes") },
    { value: "no", label: t("common.no") },
  ];
  return (
    <Screen>
      <BackBar onPress={() => router.replace("/")} />
      <Title>{t("trialRequest.title")}</Title>
      <Body muted>{t("trialRequest.intro")}</Body>

      <Section title={t("trialRequest.player")}>
        <TextField
          label={t("trialRequest.fullName")}
          value={form.fullName}
          onChangeText={set("fullName")}
          error={err("fullName")}
        />
        <DateTimeField
          label={t("trialRequest.birthDate")}
          value={form.birthDate}
          onChangeText={set("birthDate")}
          mode="date"
          error={err("birthDate")}
        />
        <Select
          label={t("scouting.targetEscalao")}
          value={form.targetEscalao || null}
          onChange={set("targetEscalao")}
          options={options(PROSPECT_ESCALOES, "escalao")}
        />
        <Select
          label={t("scouting.context")}
          value={form.context || null}
          onChange={set("context")}
          options={options(PROSPECT_CONTEXTS, "prospectContext")}
        />
        <TextField
          label={t("trialRequest.currentClub")}
          value={form.currentClub}
          onChangeText={set("currentClub")}
        />
        <MultiSelect
          label={t("scouting.positions")}
          values={form.positions}
          onChange={(positions) => setForm((f) => ({ ...f, positions }))}
          options={options(PROSPECT_POSITIONS, "prospectPosition")}
        />
        <TextField
          label={t("scouting.height")}
          value={form.heightCm}
          onChangeText={set("heightCm")}
          keyboardType="numeric"
        />
        <TextField
          label={t("scouting.seasons")}
          value={form.seasonsPlayed}
          onChangeText={set("seasonsPlayed")}
          keyboardType="numeric"
        />
      </Section>

      <Section title={t("trialRequest.contact")}>
        <Body muted>{t(minor ? "trialRequest.minorHint" : "trialRequest.adultHint")}</Body>
        {minor ? (
          <>
            <TextField
              label={t("scouting.guardianName")}
              value={form.guardianName}
              onChangeText={set("guardianName")}
            />
            <Select
              label={t("scouting.guardianRelation")}
              value={form.guardianRelation || null}
              onChange={set("guardianRelation")}
              options={options(GUARDIAN_RELATIONS, "guardianRelation")}
            />
            <TextField
              label={t("scouting.guardianPhone")}
              value={form.guardianPhone}
              onChangeText={set("guardianPhone")}
              keyboardType="phone-pad"
            />
            <TextField
              label={t("scouting.guardianEmail")}
              value={form.guardianEmail}
              onChangeText={set("guardianEmail")}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </>
        ) : null}
        <TextField
          label={t(minor ? "scouting.ownContact" : "trialRequest.ownContact")}
          value={form.ownContact}
          onChangeText={set("ownContact")}
          error={minor ? null : err("ownContact")}
        />
        {minor && submitted && !fieldOk("ownContact") ? (
          <Message tone="error">{t("trialRequest.needGuardian")}</Message>
        ) : null}
        <TextField
          label={t("scouting.socialUrl")}
          value={form.socialUrl}
          onChangeText={set("socialUrl")}
          autoCapitalize="none"
        />
      </Section>

      <Section title={t("scouting.identitySection")}>
        <Select
          label={t("scouting.idType")}
          value={form.idType || null}
          onChange={set("idType")}
          options={options(PROSPECT_ID_TYPES, "prospectIdType")}
        />
        <TextField
          label={t("scouting.nationality")}
          value={form.nationality}
          onChangeText={set("nationality")}
        />
        <TextField
          label={t("scouting.birthplace")}
          value={form.birthplace}
          onChangeText={set("birthplace")}
        />
        <TextField
          label={t("scouting.postalCode")}
          value={form.postalCode}
          onChangeText={set("postalCode")}
        />
        <TextField label={t("scouting.area")} value={form.area} onChangeText={set("area")} />
      </Section>

      <Section title={t("scouting.trialSection")}>
        <DateTimeField
          label={t("scouting.preferredDate")}
          value={form.preferredDate}
          onChangeText={set("preferredDate")}
          mode="date"
          clearable
        />
        <DateTimeField
          label={t("scouting.alternativeDate")}
          value={form.alternativeDate}
          onChangeText={set("alternativeDate")}
          mode="date"
          clearable
        />
        <Choice
          label={t("scouting.authNeeded")}
          value={form.clubAuthorisationNeeded || null}
          onChange={set("clubAuthorisationNeeded")}
          options={yesNo}
        />
      </Section>

      <Section title={t("scouting.whySection")}>
        <TextField
          label={t("scouting.motive")}
          value={form.motive}
          onChangeText={set("motive")}
          multiline
        />
        <TextField
          label={t("scouting.goal")}
          value={form.goal}
          onChangeText={set("goal")}
          multiline
        />
        <TextField
          label={t("trialRequest.notes")}
          value={form.notes}
          onChangeText={set("notes")}
          multiline
        />
      </Section>

      <Section title={t("trialRequest.privacyTitle")}>
        <Body muted>{t("trialRequest.privacy")}</Body>
        <Choice
          label={t(minor ? "trialRequest.consentMinor" : "trialRequest.consentAdult")}
          value={form.consent || null}
          onChange={set("consent")}
          options={yesNo}
        />
        {submitted && form.consent !== "yes" ? (
          <Message tone="error">{t("trialRequest.needConsent")}</Message>
        ) : null}
      </Section>

      {send.isError ? <Message tone="error">{t(errorKey(send.error))}</Message> : null}
      <Button
        label={t("trialRequest.send")}
        busy={send.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success) send.mutate();
        }}
      />
    </Screen>
  );
}
