import { type FeedbackEntry, type FeedbackStatus, feedbackToMarkdown } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Share } from "react-native";
import { api } from "../src/api";
import { errorKey, jsonOrThrow } from "../src/errors";
import { clockTime, dayOf } from "../src/features/bookings/time";
import { BackBar } from "../src/ui/BackBar";
import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Centered } from "../src/ui/Centered";
import { Choice } from "../src/ui/Choice";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";
import { showToast } from "../src/ui/Toast";

type Filter = FeedbackStatus | "open";
const FILTERS: Filter[] = ["open", "done"];

/** Tester feedback (admins): what was reported and where, with triage and a Markdown export. */
export default function Feedback() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const list = useQuery({
    queryKey: ["feedback", filter],
    queryFn: async () => jsonOrThrow(await api.feedback.$get({ query: { status: filter } })),
  });
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: FeedbackStatus }) =>
      jsonOrThrow(
        await api.feedback[":feedbackId"].$patch({
          param: { feedbackId: v.id },
          json: { status: v.status },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback"] }),
  });

  if (list.isPending) return <Centered />;
  const entries: FeedbackEntry[] = list.data?.entries ?? [];
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("feedback.admin.title")}</Title>
      <Body muted>{t("feedback.admin.hint")}</Body>
      <Choice
        label={t("feedback.admin.show")}
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: t(`feedback.admin.filter.${f}`) }))}
      />
      {list.isError ? <Message tone="error">{t(errorKey(list.error))}</Message> : null}
      {list.isSuccess && entries.length === 0 ? <Body>{t("feedback.admin.empty")}</Body> : null}
      {entries.map((e) => (
        <Card key={e.id}>
          <Body muted>
            {[
              t(`feedback.kinds.${e.kind}`),
              `${dayOf(e.createdAt)} ${clockTime(e.createdAt)}`,
              e.authorName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Body>
          <Body>{e.message}</Body>
          <Body muted>
            {[e.screenTitle, e.route, `${e.platform} ${e.viewport.width}×${e.viewport.height}`]
              .filter(Boolean)
              .join(" · ")}
          </Body>
          <Button
            compact
            variant="secondary"
            label={e.status === "done" ? t("feedback.admin.reopen") : t("feedback.admin.markDone")}
            busy={setStatus.isPending && setStatus.variables?.id === e.id}
            onPress={() =>
              setStatus.mutate({ id: e.id, status: e.status === "done" ? "new" : "done" })
            }
          />
        </Card>
      ))}
      {entries.length > 0 ? (
        <Button
          variant="secondary"
          icon="copy"
          label={t("feedback.admin.export")}
          onPress={() => exportMarkdown(entries, t("feedback.admin.copied"))}
        />
      ) : null}
    </Screen>
  );
}

/** Copies the Markdown (web) or opens the share sheet (phones), to paste into docs/feedback/. */
async function exportMarkdown(entries: FeedbackEntry[], copied: string) {
  const markdown = feedbackToMarkdown(entries, new Date());
  if (Platform.OS === "web") {
    await navigator.clipboard.writeText(markdown);
    showToast(copied);
  } else {
    await Share.share({ message: markdown });
  }
}
