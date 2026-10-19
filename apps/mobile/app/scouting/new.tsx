import { createProspectSchema, isValidNif } from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { ApiRequestError, errorKey, jsonOrThrow } from "../../src/errors";
import { ClubSelect } from "../../src/features/scouting/ClubSelect";
import { useColors } from "../../src/theme";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { DateTimeField } from "../../src/ui/DateTimeField";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * Adds a scouted athlete with only what identifies them: name, birth date (or year), NIF and
 * the club they play for. Everything else is filled in later, by section, on the athlete's
 * sheet (ADR 0022).
 */
export default function NewProspect() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [year, setYear] = useState("");
  const [nif, setNif] = useState("");
  const [club, setClub] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<{ fullName: string; identityCode: string } | null>(null);

  const parsed = createProspectSchema.safeParse({
    fullName: name,
    birthDate: birthDate || null,
    birthYear: year.trim() === "" ? null : Number(year),
    nif,
    currentClub: club,
    confirmLink: pending !== null,
  });
  const nifOk = nif.trim() === "" || isValidNif(nif.replace(/\s/g, ""));
  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.scouting.prospects.$post({ json: parsed.data as never }));
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["scouting"] });
      // Straight to the sheet, where the rest is filled in by section.
      router.replace({
        pathname: "/scouting/[prospectId]",
        params: { prospectId: data.prospect.id, tab: "sheet" },
      });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === "link_confirmation_required") {
        const found = (
          error.issues as { person?: { fullName: string; identityCode: string } } | undefined
        )?.person;
        if (found) setPending(found);
      }
    },
  });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("scouting.new")}</Title>
      <Body muted>{t("scoutingModel.ui.quickHint")}</Body>
      <TextField label={t("scouting.name")} value={name} onChangeText={setName} />
      <DateTimeField
        mode="date"
        clearable
        label={t("scouting.birthDate")}
        value={birthDate}
        onChangeText={setBirthDate}
      />
      {birthDate === "" ? (
        <TextField
          label={t("scouting.birthYear")}
          value={year}
          onChangeText={setYear}
          keyboardType="numeric"
        />
      ) : null}
      <TextField
        label={t("scoutingModel.ui.nif")}
        value={nif}
        onChangeText={setNif}
        keyboardType="number-pad"
      />
      <Body muted>{t("scoutingModel.ui.nifHint")}</Body>
      {!nifOk ? <Message tone="error">{t("scoutingModel.ui.nifInvalid")}</Message> : null}
      <ClubSelect label={t("scouting.clubNow")} value={club} onChange={setClub} />
      <Body muted>{t("scouting.retentionHint")}</Body>
      {submitted && !parsed.success ? (
        <Message tone="error">{t("scouting.needName")}</Message>
      ) : null}
      {pending ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 2 }}>
          <Title>{t("scoutingModel.ui.confirmTitle", { name: pending.fullName })}</Title>
          <Body>{t("scoutingModel.ui.confirmBody", { code: pending.identityCode })}</Body>
        </Card>
      ) : create.isError ? (
        <Message tone="error">{t(errorKey(create.error))}</Message>
      ) : null}
      <Button
        label={pending ? t("scoutingModel.ui.confirmAction") : t("scoutingModel.ui.createOpen")}
        busy={create.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success && nifOk) create.mutate();
        }}
      />
      {pending ? (
        <Button
          variant="secondary"
          label={t("scoutingModel.ui.cancel")}
          onPress={() => setPending(null)}
        />
      ) : null}
    </Screen>
  );
}
