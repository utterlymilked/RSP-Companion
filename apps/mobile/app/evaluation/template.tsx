import { createEvaluationTemplateSchema } from "@rsc/shared";
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

/** Creates an evaluation template: a name, a scale and criteria separated by semicolons. */
export default function NewEvaluationTemplate() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scale, setScale] = useState("5");
  const [criteria, setCriteria] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const parsed = createEvaluationTemplateSchema.safeParse({
    name,
    scaleMax: Number(scale),
    criteria: criteria
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean),
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.evaluations.templates.$post({ json: parsed.data }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["evaluation-templates"] });
      router.back();
    },
  });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("evaluations.newTemplate")}</Title>
      <TextField label={t("evaluations.templateName")} value={name} onChangeText={setName} />
      <TextField label={t("evaluations.scale")} value={scale} onChangeText={setScale} />
      <TextField label={t("evaluations.criteria")} value={criteria} onChangeText={setCriteria} />
      <Body muted>{t("evaluations.criteriaHint")}</Body>
      {submitted && !parsed.success ? (
        <Message tone="error">{t("evaluations.needTemplate")}</Message>
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
