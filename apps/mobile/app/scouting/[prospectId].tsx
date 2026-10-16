import { createProspectReportSchema, PROSPECT_STATUSES } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { todayLisbon } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** One prospect: pipeline status and the observation reports. */
export default function ProspectDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { prospectId } = useLocalSearchParams<{ prospectId: string }>();
  const canWrite = !!useMe().data?.permissions.includes("scouting.write");
  const [rating, setRating] = useState("3");
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const detail = useQuery({
    queryKey: ["prospect", prospectId],
    queryFn: async () =>
      jsonOrThrow(await api.scouting.prospects[":prospectId"].$get({ param: { prospectId } })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["scouting"] });
    await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
  };
  const move = useMutation({
    mutationFn: async (status: (typeof PROSPECT_STATUSES)[number]) =>
      jsonOrThrow(
        await api.scouting.prospects[":prospectId"].$patch({
          param: { prospectId },
          json: { status },
        }),
      ),
    onSuccess: refresh,
  });
  const report = createProspectReportSchema.safeParse({
    observedOn: todayLisbon(),
    rating: Number(rating),
    text,
  });
  const addReport = useMutation({
    mutationFn: async () => {
      if (!report.success) throw new Error("invalid");
      return jsonOrThrow(
        await api.scouting.prospects[":prospectId"].reports.$post({
          param: { prospectId },
          json: report.data,
        }),
      );
    },
    onSuccess: async () => {
      setText("");
      setSubmitted(false);
      await refresh();
    },
  });

  if (detail.isPending) return <Centered />;
  const p = detail.data?.prospect;
  const error = detail.error ?? move.error ?? addReport.error;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {p ? (
        <>
          <Title>{p.fullName}</Title>
          <ListItem
            title={[p.birthYear, p.position, p.currentClub].filter(Boolean).join(" · ") || "-"}
            subtitle={t("scouting.retainUntil", { date: p.retainUntil })}
            trailing={p.expired ? t("scouting.expired") : undefined}
          />
          {p.notes ? <Body>{p.notes}</Body> : null}
          {canWrite ? (
            <Choice
              label={t("scouting.status")}
              value={p.status}
              onChange={(v) => move.mutate(v as (typeof PROSPECT_STATUSES)[number])}
              options={PROSPECT_STATUSES.map((s) => ({
                value: s,
                label: t(`prospectStatus.${s}`),
              }))}
            />
          ) : (
            <Body muted>{t(`prospectStatus.${p.status}`)}</Body>
          )}
          {canWrite ? (
            <>
              <Title>{t("scouting.newReport")}</Title>
              <Choice
                label={t("scouting.rating")}
                value={rating}
                onChange={setRating}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              />
              <TextField label={t("scouting.reportText")} value={text} onChangeText={setText} />
              {submitted && !report.success ? (
                <Message tone="error">{t("scouting.needText")}</Message>
              ) : null}
              <Button
                label={t("scouting.addReport")}
                busy={addReport.isPending}
                onPress={() => {
                  setSubmitted(true);
                  if (report.success) addReport.mutate();
                }}
              />
            </>
          ) : null}
          <Title>{t("scouting.reports")}</Title>
          {detail.data?.reports.length === 0 ? <Body muted>{t("scouting.noReports")}</Body> : null}
          {detail.data?.reports.map((r) => (
            <ListItem
              key={r.id}
              title={r.text}
              subtitle={r.observedOn}
              trailing={`${r.rating}/5`}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
