import { createPersonSchema } from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";
import { requiredError } from "../../src/validation";

/** Creates a person (people.write). Minors' own contact fields should stay empty. */
export default function NewPerson() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: "", birthDate: "", email: "", phone: "" });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const parsed = createPersonSchema.safeParse(form);
  const nameError = submitted ? requiredError(form.fullName) : null;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.people.$post({ json: parsed.data }));
    },
    onSuccess: async ({ person }) => {
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      router.replace({ pathname: "/person/[personId]", params: { personId: person.id } });
    },
  });

  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("people.new")}</Title>
      <TextField
        label={t("people.fullName")}
        value={form.fullName}
        onChangeText={set("fullName")}
        autoCapitalize="words"
        error={nameError ? t(nameError.key) : null}
      />
      <TextField
        label={t("people.birthDate")}
        value={form.birthDate}
        onChangeText={set("birthDate")}
      />
      <TextField
        label={t("people.email")}
        value={form.email}
        onChangeText={set("email")}
        keyboardType="email-address"
      />
      <TextField
        label={t("people.phone")}
        value={form.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
      />
      {submitted && !parsed.success && !nameError ? (
        <Message tone="error">{t("errors.invalid_request")}</Message>
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
