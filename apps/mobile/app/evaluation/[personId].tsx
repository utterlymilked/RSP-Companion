import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";

/** An athlete's evaluations over time, newest first, with the score of each criterion. */
export default function EvaluationHistory() {
  const { t } = useTranslation();
  const router = useRouter();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const permissions = useMe().data?.permissions ?? [];
  const history = useQuery({
    queryKey: ["evaluations", personId],
    queryFn: async () => jsonOrThrow(await api.evaluations.$get({ query: { personId } })),
  });

  if (history.isPending) return <Centered />;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("evaluations.title")}</Title>
      {history.isError ? <Message tone="error">{t(errorKey(history.error))}</Message> : null}
      {permissions.includes("evaluations.write") ? (
        <Button
          label={t("evaluations.new")}
          onPress={() => router.push({ pathname: "/evaluation/new", params: { personId } })}
        />
      ) : null}
      {permissions.includes("evaluations.manage") ? (
        <Button
          label={t("evaluations.newTemplate")}
          variant="secondary"
          onPress={() => router.push("/evaluation/template")}
        />
      ) : null}
      {history.data?.evaluations.length === 0 ? <Body>{t("evaluations.empty")}</Body> : null}
      {history.data?.evaluations.map((e) => (
        <ListItem
          key={e.id}
          title={`${e.evaluatedOn} · ${e.templateName}`}
          subtitle={[
            e.scores.map((s) => `${s.label} ${s.score}/${e.scaleMax}`).join(", "),
            e.comment,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ))}
    </Screen>
  );
}
