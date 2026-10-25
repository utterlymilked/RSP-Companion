import { type ArchetypeKey, PROSPECT_STATUSES } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { ProspectLink } from "../../src/features/scouting/ProspectLink";
import { ProspectProfile } from "../../src/features/scouting/ProspectProfile";
import { ProspectSheet } from "../../src/features/scouting/ProspectSheet";
import { BackBar } from "../../src/ui/BackBar";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Body, Message, Title } from "../../src/ui/Text";

type Tab = "profile" | "reports" | "sheet" | "link";

/** One scouted athlete: profile (radar, archetype, heat map), reports, the form's data, link. */
export default function ProspectDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ prospectId: string; tab?: string }>();
  const { prospectId } = params;
  const permissions = useMe().data?.permissions ?? [];
  const canWrite = permissions.includes("scouting.write");
  const canEvaluate = permissions.includes("evaluations.read");
  const [tab, setTab] = useState<Tab>((params.tab as Tab | undefined) ?? "profile");

  const detail = useQuery({
    queryKey: ["prospect", prospectId],
    queryFn: async () =>
      jsonOrThrow(await api.scouting.prospects[":prospectId"].$get({ param: { prospectId } })),
  });
  // Training evaluations are one more kind of report about the same athlete.
  const evaluations = useQuery({
    queryKey: ["evaluations", prospectId],
    enabled: canEvaluate,
    queryFn: async () =>
      jsonOrThrow(await api.evaluations.$get({ query: { athleteId: prospectId } })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["scouting"] });
    await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
  };
  const patch = useMutation({
    mutationFn: async (json: {
      status?: (typeof PROSPECT_STATUSES)[number];
      archetype?: ArchetypeKey | null;
    }) =>
      jsonOrThrow(
        await api.scouting.prospects[":prospectId"].$patch({ param: { prospectId }, json }),
      ),
    onSuccess: refresh,
  });

  if (detail.isPending) return <Centered />;
  const p = detail.data?.prospect;
  const error = detail.error ?? patch.error;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {p ? (
        <>
          <Title>{p.fullName}</Title>
          <ListItem
            title={
              [
                p.birthYear,
                p.currentClub,
                p.profile.reportCount > 0
                  ? t("scoutingModel.ui.timesObserved", { n: p.profile.reportCount })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "-"
            }
            subtitle={p.club ? undefined : t("scouting.retainUntil", { date: p.retainUntil })}
            trailing={p.club ? t("scouting.clubBadge") : t(`prospectStatus.${p.status}`)}
            footer={
              p.expired || p.person ? (
                <Badge
                  tone={p.expired ? "danger" : "success"}
                  label={
                    p.expired
                      ? t("scouting.expired")
                      : t("scoutingModel.ui.linkedTo", { name: p.person?.fullName })
                  }
                />
              ) : undefined
            }
          />
          <Segmented
            label={t("scouting.title")}
            value={tab}
            onChange={setTab}
            options={[
              { value: "profile", label: t("scoutingModel.ui.tabProfile") },
              { value: "reports", label: t("scoutingModel.ui.tabReports") },
              { value: "sheet", label: t("scoutingModel.ui.tabSheet") },
              { value: "link", label: t("scoutingModel.ui.tabLink") },
            ]}
          />
          {tab === "profile" ? (
            <ProspectProfile
              profile={p.profile}
              manualArchetype={p.archetype}
              canWrite={canWrite}
              onArchetype={(archetype) => patch.mutate({ archetype })}
            />
          ) : null}
          {tab === "reports" ? (
            <>
              {canWrite ? (
                <Button
                  label={t("scoutingModel.ui.newReport")}
                  onPress={() =>
                    router.push({
                      pathname: "/scouting/report/[prospectId]",
                      params: { prospectId },
                    })
                  }
                />
              ) : null}
              {canEvaluate && permissions.includes("evaluations.write") ? (
                <Button
                  variant="secondary"
                  label={t("evaluations.new")}
                  onPress={() =>
                    router.push({
                      pathname: "/evaluation/new",
                      params: { athleteId: prospectId },
                    })
                  }
                />
              ) : null}
              {detail.data?.reports.length === 0 && !evaluations.data?.evaluations.length ? (
                <Body muted>{t("scouting.noReports")}</Body>
              ) : null}
              {evaluations.data?.evaluations.map((e) => (
                <ListItem
                  key={e.id}
                  title={e.comment ?? e.templateName}
                  subtitle={[
                    t("evaluations.reportKind"),
                    e.evaluatedOn,
                    e.scores.map((s) => `${s.label} ${s.score}/${e.scaleMax}`).join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
              {detail.data?.reports.map((r) => (
                <ListItem
                  key={r.id}
                  title={r.text}
                  subtitle={[
                    t(`scoutingModel.reportKind.${r.kind}`),
                    r.observedOn,
                    r.positionPlayed && t(`prospectPosition.${r.positionPlayed}`),
                    r.recommendation && t(`scoutingModel.recommendation.${r.recommendation}`),
                    Object.keys(r.scores).length > 0
                      ? t("scoutingModel.ui.rated", { n: Object.keys(r.scores).length })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={`${r.rating}/5`}
                />
              ))}
            </>
          ) : null}
          {tab === "sheet" ? (
            <>
              {canWrite && !p.club ? (
                <Choice
                  label={t("scouting.status")}
                  value={p.status}
                  onChange={(v) =>
                    patch.mutate({ status: v as (typeof PROSPECT_STATUSES)[number] })
                  }
                  options={PROSPECT_STATUSES.map((s) => ({
                    value: s,
                    label: t(`prospectStatus.${s}`),
                  }))}
                />
              ) : null}
              <ProspectSheet
                prospectId={prospectId}
                prospect={p as unknown as Record<string, unknown>}
                canWrite={canWrite}
              />
            </>
          ) : null}
          {tab === "link" ? (
            <ProspectLink
              prospectId={prospectId}
              nif={p.nif}
              person={p.person}
              canWrite={canWrite}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
