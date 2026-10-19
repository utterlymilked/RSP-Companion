import {
  ATTRIBUTE_CORNERS,
  type AttributeKey,
  attributesOfCorner,
  HEAT_MAX,
  HEAT_ZONES,
  PROSPECT_POSITIONS,
  type ProspectPosition,
  type Scores,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../src/api";
import { errorKey, jsonOrThrow } from "../../../src/errors";
import { todayLisbon } from "../../../src/features/bookings/time";
import { PitchHeat } from "../../../src/features/scouting/PitchHeat";
import { RatingBar } from "../../../src/features/scouting/RatingBar";
import { BackBar } from "../../../src/ui/BackBar";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Centered } from "../../../src/ui/Centered";
import { DateTimeField } from "../../../src/ui/DateTimeField";
import { Screen } from "../../../src/ui/Screen";
import { Select } from "../../../src/ui/Select";
import { Body, Message, Title } from "../../../src/ui/Text";
import { TextField } from "../../../src/ui/TextField";
import { showToast } from "../../../src/ui/Toast";

/** A scouting report: attribute ratings by area, where the player was active, and notes. */
export default function NewReport() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { prospectId } = useLocalSearchParams<{ prospectId: string }>();
  const detail = useQuery({
    queryKey: ["prospect", prospectId],
    queryFn: async () =>
      jsonOrThrow(await api.scouting.prospects[":prospectId"].$get({ param: { prospectId } })),
  });
  const [date, setDate] = useState(todayLisbon());
  const [played, setPlayed] = useState<ProspectPosition | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [heat, setHeat] = useState<number[]>(() => new Array<number>(HEAT_ZONES).fill(0));
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.scouting.prospects[":prospectId"].reports.$post({
          param: { prospectId },
          json: {
            observedOn: date,
            text: text.trim() || t("scoutingModel.ui.reportNote"),
            scores: scores as Record<string, number>,
            positionPlayed: (played ??
              detail.data?.prospect.positions[0] ??
              null) as ProspectPosition | null,
            heat: heat.some((h) => h > 0) ? heat : null,
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scouting"] });
      await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      showToast(t("scoutingModel.ui.reportSaved"));
      router.back();
    },
  });

  if (detail.isPending) return <Centered />;
  const group = detail.data?.prospect.profile.group ?? "mid";
  const ratedCount = Object.keys(scores).length;
  const setScore = (key: AttributeKey, value: number | undefined) =>
    setScores((s) => {
      const next = { ...s };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("scoutingModel.ui.newReport")}</Title>
      <Body muted>{detail.data?.prospect.fullName}</Body>
      <DateTimeField
        mode="date"
        label={t("scoutingModel.ui.reportDate")}
        value={date}
        onChangeText={setDate}
      />
      <Select
        label={t("scoutingModel.ui.positionPlayed")}
        value={played ?? detail.data?.prospect.positions[0] ?? null}
        onChange={(v) => setPlayed(v as ProspectPosition)}
        options={PROSPECT_POSITIONS.map((p) => ({ value: p, label: t(`prospectPosition.${p}`) }))}
      />

      <Title>{t("scoutingModel.ui.scoresSection")}</Title>
      <Body muted>{t("scoutingModel.ui.scoresHint")}</Body>
      {ATTRIBUTE_CORNERS.map((corner) => {
        const keys = attributesOfCorner(group, corner);
        return keys.length === 0 ? null : (
          <Card key={corner}>
            <Body>{t(`scoutingModel.corner.${corner}`)}</Body>
            {keys.map((k) => (
              <RatingBar
                key={k}
                label={t(`scoutingModel.attribute.${k}`)}
                value={scores[k]}
                onChange={(v) => setScore(k, v)}
              />
            ))}
          </Card>
        );
      })}

      <Title>{t("scoutingModel.ui.heatSection")}</Title>
      <Body muted>{t("scoutingModel.ui.heatHint")}</Body>
      <PitchHeat
        heat={heat}
        width={320}
        onZone={(z) => setHeat((h) => h.map((v, i) => (i === z ? (v + 1) % (HEAT_MAX + 1) : v)))}
        zoneLabel={(z, level) => t("scoutingModel.ui.heatZone", { zone: z + 1, level })}
      />
      <Button
        variant="ghost"
        label={t("scoutingModel.ui.clearHeat")}
        onPress={() => setHeat(new Array<number>(HEAT_ZONES).fill(0))}
      />

      <TextField
        label={t("scoutingModel.ui.reportNote")}
        value={text}
        onChangeText={setText}
        multiline
      />
      {submitted && ratedCount === 0 ? (
        <Message tone="error">{t("scoutingModel.ui.needScores")}</Message>
      ) : null}
      {save.isError ? <Message tone="error">{t(errorKey(save.error))}</Message> : null}
      <Button
        label={t("scoutingModel.ui.saveReport")}
        busy={save.isPending}
        onPress={() => {
          setSubmitted(true);
          if (ratedCount > 0) save.mutate();
        }}
      />
    </Screen>
  );
}
