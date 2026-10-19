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
  const canWrite = !!useMe().data?.permissions.includes("scouting.write");
  const [tab, setTab] = useState<Tab>((params.tab as Tab | undefined) ?? "profile");

  const detail = useQuery({
    queryKey: ["prospect", prospectId],
    queryFn: async () =>
      jsonOrThrow(await api.scouting.prospects[":prospectId"].$get({ param: { prospectId } })),
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
  const yn = (v: boolean) => t(v ? "common.yes" : "common.no");
  const details: [string, string][] = p
    ? (
        [
          ["birthDate", p.birthDate],
          ["targetEscalao", p.targetEscalao && t(`escalao.${p.targetEscalao}`)],
          ["context", p.context && t(`prospectContext.${p.context}`)],
          ["positions", p.positions.map((x) => t(`prospectPosition.${x}`)).join(", ") || null],
          ["height", p.heightCm && `${p.heightCm} cm`],
          ["seasons", p.seasonsPlayed?.toString()],
          [
            "guardianName",
            [p.guardianName, p.guardianRelation && t(`guardianRelation.${p.guardianRelation}`)]
              .filter(Boolean)
              .join(" · "),
          ],
          ["guardianPhone", p.guardianPhone],
          ["guardianEmail", p.guardianEmail],
          ["ownContact", p.ownContact],
          ["socialUrl", p.socialUrl],
          ["idType", p.idType && t(`prospectIdType.${p.idType}`)],
          ["nationality", p.nationality],
          ["birthplace", p.birthplace],
          ["area", [p.postalCode, p.area].filter(Boolean).join(" ")],
          ["preferredDate", p.preferredDate],
          ["alternativeDate", p.alternativeDate],
          ["trialDate", p.trialDate],
          ["trialVenue", p.trialVenue],
          ["authNeeded", p.clubAuthorisationNeeded ? yn(p.clubAuthorised) : null],
          ["motive", p.motive],
          ["goal", p.goal],
        ] as [string, string | null | undefined][]
      ).filter((row): row is [string, string] => !!row[1])
    : [];
  const error = detail.error ?? patch.error;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      {p ? (
        <>
          <Title>{p.fullName}</Title>
          <ListItem
            title={[p.birthYear, p.currentClub].filter(Boolean).join(" · ") || "-"}
            subtitle={t("scouting.retainUntil", { date: p.retainUntil })}
            trailing={t(`prospectStatus.${p.status}`)}
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
              {detail.data?.reports.length === 0 ? (
                <Body muted>{t("scouting.noReports")}</Body>
              ) : null}
              {detail.data?.reports.map((r) => (
                <ListItem
                  key={r.id}
                  title={r.text}
                  subtitle={[
                    r.observedOn,
                    r.positionPlayed && t(`prospectPosition.${r.positionPlayed}`),
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
              {canWrite ? (
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
              {details.map(([key, value]) => (
                <ListItem key={key} title={value} subtitle={t(`scouting.${key}`)} />
              ))}
              {p.notes ? <Body>{p.notes}</Body> : null}
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
