import { createEvaluationSchema } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { todayLisbon } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** Evaluates an athlete with a template: one score per criterion. */
export default function NewEvaluation() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const [templateId, setTemplateId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const templates = useQuery({
    queryKey: ["evaluation-templates"],
    queryFn: async () => jsonOrThrow(await api.evaluations.templates.$get({ query: {} })),
  });
  const template = templates.data?.templates.find((x) => x.id === templateId);

  const parsed = createEvaluationSchema.safeParse({
    athleteId,
    templateId,
    evaluatedOn: todayLisbon(),
    comment,
    scores: (template?.criteria ?? []).flatMap((c) =>
      scores[c.id] ? [{ criterionId: c.id, score: Number(scores[c.id]) }] : [],
    ),
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.evaluations.$post({ json: parsed.data as never }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["evaluations", athleteId] });
      router.back();
    },
  });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("evaluations.new")}</Title>
      {templates.isError ? <Message tone="error">{t(errorKey(templates.error))}</Message> : null}
      <Choice
        label={t("evaluations.template")}
        value={templateId}
        onChange={(v) => {
          setTemplateId(v);
          setScores({});
        }}
        options={(templates.data?.templates ?? []).map((x) => ({ value: x.id, label: x.name }))}
      />
      {template?.criteria.map((c) => (
        <Choice
          key={c.id}
          label={c.label}
          value={scores[c.id] ?? null}
          onChange={(v) => setScores((s) => ({ ...s, [c.id]: v }))}
          options={Array.from({ length: template.scaleMax }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
        />
      ))}
      <TextField label={t("evaluations.comment")} value={comment} onChangeText={setComment} />
      {submitted && !parsed.success ? (
        <Message tone="error">{t("evaluations.needScores")}</Message>
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
