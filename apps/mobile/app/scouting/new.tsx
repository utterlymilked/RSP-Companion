import { createProspectSchema } from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** Adds an external prospect (no contacts: only what scouting needs). */
export default function NewProspect() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", year: "", club: "", position: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const parsed = createProspectSchema.safeParse({
    fullName: form.name,
    birthYear: form.year.trim() === "" ? null : Number(form.year),
    currentClub: form.club,
    position: form.position,
    notes: form.notes,
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

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("scouting.new")}</Title>
      <TextField label={t("scouting.name")} value={form.name} onChangeText={set("name")} />
      <TextField label={t("scouting.birthYear")} value={form.year} onChangeText={set("year")} />
      <TextField label={t("scouting.club")} value={form.club} onChangeText={set("club")} />
      <TextField
        label={t("scouting.position")}
        value={form.position}
        onChangeText={set("position")}
      />
      <TextField label={t("scouting.notes")} value={form.notes} onChangeText={set("notes")} />
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
