import {
  createProspectSchema,
  GUARDIAN_RELATIONS,
  PROSPECT_CONTEXTS,
  PROSPECT_ESCALOES,
  PROSPECT_ID_TYPES,
  PROSPECT_POSITIONS,
} from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { DateTimeField } from "../../src/ui/DateTimeField";
import { Screen } from "../../src/ui/Screen";
import { MultiSelect, Select } from "../../src/ui/Select";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const EMPTY = {
  name: "",
  year: "",
  birthDate: "",
  club: "",
  notes: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  ownContact: "",
  socialUrl: "",
  height: "",
  seasons: "",
  motive: "",
  goal: "",
  nationality: "",
  birthplace: "",
  postalCode: "",
  area: "",
  preferredDate: "",
  alternativeDate: "",
  trialDate: "",
  trialVenue: "",
};

/** Whole years between a `YYYY-MM-DD` birth date and today, or null when not a full date. */
function ageOf(birthDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const born = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age -= 1;
  return age;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * Adds an external prospect or an observation request, with what the club's request form asks
 * for (ADR 0007). Everything but the name is optional.
 */
export default function NewProspect() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [positions, setPositions] = useState<(typeof PROSPECT_POSITIONS)[number][]>([]);
  const [relation, setRelation] = useState<(typeof GUARDIAN_RELATIONS)[number] | null>(null);
  const [escalao, setEscalao] = useState<(typeof PROSPECT_ESCALOES)[number] | null>(null);
  const [context, setContext] = useState<(typeof PROSPECT_CONTEXTS)[number] | null>(null);
  const [idType, setIdType] = useState<(typeof PROSPECT_ID_TYPES)[number] | null>(null);
  const [needsAuth, setNeedsAuth] = useState("no");
  const [authorised, setAuthorised] = useState("no");
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const field = (key: keyof typeof form, label: string, extra = {}) => (
    <TextField label={t(label)} value={form[key]} onChangeText={set(key)} {...extra} />
  );
  const date = (key: keyof typeof form, label: string) => (
    <DateTimeField
      mode="date"
      clearable
      label={t(label)}
      value={form[key]}
      onChangeText={set(key)}
    />
  );
  const age = ageOf(form.birthDate);
  const minor = age !== null && age < 18;
  const adult = age !== null && age >= 18;

  const parsed = createProspectSchema.safeParse({
    fullName: form.name,
    birthYear: num(form.year),
    birthDate: form.birthDate || null,
    currentClub: form.club,
    notes: form.notes,
    guardianName: form.guardianName,
    guardianPhone: form.guardianPhone,
    guardianEmail: form.guardianEmail,
    guardianRelation: relation,
    ownContact: form.ownContact,
    socialUrl: form.socialUrl,
    targetEscalao: escalao,
    context,
    positions,
    heightCm: num(form.height),
    seasonsPlayed: num(form.seasons),
    motive: form.motive,
    goal: form.goal,
    idType,
    nationality: form.nationality,
    birthplace: form.birthplace,
    postalCode: form.postalCode,
    area: form.area,
    preferredDate: form.preferredDate || null,
    alternativeDate: form.alternativeDate || null,
    trialDate: form.trialDate || null,
    trialVenue: form.trialVenue,
    clubAuthorisationNeeded: needsAuth === "yes",
    clubAuthorised: needsAuth === "yes" && authorised === "yes",
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.scouting.prospects.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scouting"] });
      router.back();
    },
  });
  const yesNo = [
    { value: "no", label: t("common.no") },
    { value: "yes", label: t("common.yes") },
  ];
  const label =
    (group: string) =>
    <T extends string>(v: T) => ({ value: v, label: t(`${group}.${v}`) });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("scouting.new")}</Title>
      {field("name", "scouting.name")}
      {date("birthDate", "scouting.birthDate")}
      {form.birthDate === "" ? field("year", "scouting.birthYear") : null}
      <Select
        label={t("scouting.targetEscalao")}
        value={escalao}
        onChange={setEscalao}
        options={PROSPECT_ESCALOES.map(label("escalao"))}
      />
      <Select
        label={t("scouting.context")}
        value={context}
        onChange={setContext}
        options={PROSPECT_CONTEXTS.map(label("prospectContext"))}
      />
      {field("club", "scouting.club")}
      <MultiSelect
        label={t("scouting.positions")}
        values={positions}
        onChange={setPositions}
        options={PROSPECT_POSITIONS.map(label("prospectPosition"))}
      />
      {field("height", "scouting.height", { keyboardType: "numeric" })}
      {field("seasons", "scouting.seasons", { keyboardType: "numeric" })}

      <Title>{t("scouting.contactSection")}</Title>
      {!adult ? (
        <>
          {field("guardianName", "scouting.guardianName")}
          <Select
            label={t("scouting.guardianRelation")}
            value={relation}
            onChange={setRelation}
            options={GUARDIAN_RELATIONS.map(label("guardianRelation"))}
          />
          {field("guardianPhone", "scouting.guardianPhone", { keyboardType: "phone-pad" })}
          {field("guardianEmail", "scouting.guardianEmail", { keyboardType: "email-address" })}
        </>
      ) : null}
      {!minor ? field("ownContact", "scouting.ownContact") : null}
      {field("socialUrl", "scouting.socialUrl")}

      <Title>{t("scouting.identitySection")}</Title>
      <Select
        label={t("scouting.idType")}
        value={idType}
        onChange={setIdType}
        options={PROSPECT_ID_TYPES.map(label("prospectIdType"))}
      />
      {field("nationality", "scouting.nationality")}
      {field("birthplace", "scouting.birthplace")}
      {field("postalCode", "scouting.postalCode")}
      {field("area", "scouting.area")}

      <Title>{t("scouting.trialSection")}</Title>
      {date("preferredDate", "scouting.preferredDate")}
      {date("alternativeDate", "scouting.alternativeDate")}
      {date("trialDate", "scouting.trialDate")}
      {field("trialVenue", "scouting.trialVenue")}
      <Choice
        label={t("scouting.authNeeded")}
        value={needsAuth}
        onChange={setNeedsAuth}
        options={yesNo}
      />
      {needsAuth === "yes" ? (
        <Choice
          label={t("scouting.authGiven")}
          value={authorised}
          onChange={setAuthorised}
          options={yesNo}
        />
      ) : null}

      <Title>{t("scouting.whySection")}</Title>
      {field("motive", "scouting.motive", { multiline: true })}
      {field("goal", "scouting.goal", { multiline: true })}
      {field("notes", "scouting.notes", { multiline: true })}
      <Body muted>{t("scouting.retentionHint")}</Body>
      {submitted && !parsed.success ? (
        <Message tone="error">{t("scouting.needName")}</Message>
      ) : null}
      {create.isError ? <Message tone="error">{t(errorKey(create.error))}</Message> : null}
      <Button
        label={t("common.save")}
        busy={create.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success) create.mutate();
        }}
      />
    </Screen>
  );
}
