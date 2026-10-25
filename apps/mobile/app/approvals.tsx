import type { ApprovalEntry, ApprovalStatus } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { TextField } from "../src/ui/TextField";

type Filter = "open" | "approved" | "rejected";
const FILTERS: Filter[] = ["open", "approved", "rejected"];
type Decision = "approve" | "reject" | "needs_info";

/** The approval queue for admin and HR: open requests oldest first, decided ones for reference. */
export default function Approvals() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const [asking, setAsking] = useState<{
    id: string;
    decision: Exclude<Decision, "approve">;
  } | null>(null);
  const [reason, setReason] = useState("");
  const list = useQuery({
    queryKey: ["approvals", filter],
    queryFn: async () => jsonOrThrow(await api.approvals.$get({ query: { status: filter } })),
  });
  const decide = useMutation({
    mutationFn: async (v: { id: string; decision: Decision; reason?: string }) => {
      const res = await api.approvals[":approvalId"].decision.$post({
        param: { approvalId: v.id },
        json: { decision: v.decision, reason: v.reason },
      });
      if (!res.ok) await jsonOrThrow(res);
    },
    onSuccess: () => {
      setAsking(null);
      setReason("");
      return queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  if (list.isPending) return <Centered />;
  const entries: ApprovalEntry[] = list.data?.entries ?? [];
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("approvals.title")}</Title>
      <Body muted>{t("approvals.hint")}</Body>
      <Choice
        label={t("approvals.show")}
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: t(`approvals.filter.${f}`) }))}
      />
      {list.isError ? <Message tone="error">{t(errorKey(list.error))}</Message> : null}
      {decide.isError ? <Message tone="error">{t(errorKey(decide.error))}</Message> : null}
      {list.isSuccess && entries.length === 0 ? <Body>{t("approvals.empty")}</Body> : null}
      {entries.map((e) => (
        <Card key={e.id}>
          <Body>{e.subjectName ?? t("approvals.unknownSubject")}</Body>
          <Body muted>
            {[
              t(`approvals.types.${e.type}`),
              t(`approvals.status.${e.status satisfies ApprovalStatus}`),
              `${dayOf(e.createdAt)} ${clockTime(e.createdAt)}`,
              e.reviewerName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Body>
          {e.reason ? <Body muted>{e.reason}</Body> : null}
          {e.status === "pending" || e.status === "needs_info" ? (
            asking?.id === e.id ? (
              <>
                <TextField label={t("approvals.reason")} value={reason} onChangeText={setReason} />
                <Button
                  compact
                  label={t(`approvals.confirm.${asking.decision}`)}
                  disabled={reason.trim().length === 0}
                  busy={decide.isPending}
                  onPress={() =>
                    decide.mutate({ id: e.id, decision: asking.decision, reason: reason.trim() })
                  }
                />
                <Button
                  compact
                  variant="tertiary"
                  label={t("common.cancel")}
                  onPress={() => setAsking(null)}
                />
              </>
            ) : (
              <>
                <Button
                  compact
                  label={t("approvals.approve")}
                  busy={decide.isPending && decide.variables?.id === e.id}
                  onPress={() => decide.mutate({ id: e.id, decision: "approve" })}
                />
                <Button
                  compact
                  variant="secondary"
                  label={t("approvals.reject")}
                  onPress={() => setAsking({ id: e.id, decision: "reject" })}
                />
                <Button
                  compact
                  variant="tertiary"
                  label={t("approvals.needsInfo")}
                  onPress={() => setAsking({ id: e.id, decision: "needs_info" })}
                />
              </>
            )
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
