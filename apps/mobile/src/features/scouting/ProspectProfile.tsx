import {
  ARCHETYPES,
  type ArchetypeKey,
  ATTRIBUTE_CORNERS,
  type AttributeKey,
  attributesFor,
  cornerScores,
  type PositionGroup,
  type Scores,
} from "@rsc/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Card } from "../../ui/Card";
import { Segmented } from "../../ui/Segmented";
import { Select } from "../../ui/Select";
import { Body } from "../../ui/Text";
import {
  attributePercentiles,
  axisLabel,
  SERIES_COLORS,
  useProspectPool,
  useRadarSize,
} from "./model";
import { PitchHeat } from "./PitchHeat";
import { RadarChart } from "./RadarChart";

export interface Profile {
  group: PositionGroup;
  scores: Scores;
  overall: number | null;
  archetype: ArchetypeKey | null;
  archetypes: { archetype: ArchetypeKey; fit: number }[];
  heat: number[] | null;
  reportCount: number;
}

interface Props {
  profile: Profile;
  /** The archetype chosen by hand, if any. */
  manualArchetype: ArchetypeKey | null;
  canWrite: boolean;
  onArchetype: (value: ArchetypeKey | null) => void;
}

/** Overall score, archetype, radar (attributes or areas, values or percentile), strengths, heat map. */
export function ProspectProfile({ profile, manualArchetype, canWrite, onArchetype }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const [view, setView] = useState<"attributes" | "corners">("attributes");
  const [mode, setMode] = useState<"values" | "percentile">("values");
  const radar = useRadarSize();
  const pool = useProspectPool();
  const pct = attributePercentiles(pool.data?.prospects ?? [], profile.group, profile.scores);
  const keys = attributesFor(profile.group);
  const rated = keys.filter((k) => profile.scores[k] !== undefined);
  const source = mode === "percentile" && pct ? pct.percentiles : profile.scores;

  if (profile.reportCount === 0 || rated.length === 0) {
    return (
      <Card>
        <Body muted>{t("scoutingModel.ui.noProfile")}</Body>
      </Card>
    );
  }

  const axes =
    view === "attributes"
      ? keys.map((k) => axisLabel(t, k))
      : ATTRIBUTE_CORNERS.map((c) => t(`scoutingModel.corner.${c}`));
  const values =
    view === "attributes"
      ? keys.map((k) => source[k])
      : ATTRIBUTE_CORNERS.map((c) => cornerScores(source, profile.group)[c]);
  const sorted = [...rated].sort((a, b) => (profile.scores[b] ?? 0) - (profile.scores[a] ?? 0));
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3).reverse();
  const archetypeOptions = (Object.keys(ARCHETYPES) as ArchetypeKey[])
    .filter((a) => (ARCHETYPES[a].groups as readonly PositionGroup[]).includes(profile.group))
    .map((a) => ({ value: a as string, label: t(`scoutingModel.archetype.${a}`) }));
  const top = profile.archetypes[0];

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.hero}>
          <View style={[styles.score, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.scoreValue, { color: colors.primary }]}>
              {profile.overall?.toFixed(1) ?? "-"}
            </Text>
            <Text style={[styles.scoreLabel, { color: colors.primary }]}>
              {t("scoutingModel.ui.overall")}
            </Text>
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.archetype, { color: colors.text }]}>
              {profile.archetype
                ? t(`scoutingModel.archetype.${profile.archetype}`)
                : t("scoutingModel.ui.archetypeNone")}
            </Text>
            <Body muted>
              {t(`scoutingModel.group.${profile.group}`)} ·{" "}
              {t("scoutingModel.ui.reportsCount", { count: profile.reportCount })}
            </Body>
            {profile.archetype ? (
              <Badge
                tone={manualArchetype ? "accent" : "primary"}
                label={
                  manualArchetype
                    ? t("scoutingModel.ui.archetypeChosen")
                    : t("scoutingModel.ui.archetypeComputed", { fit: top?.fit ?? "-" })
                }
              />
            ) : null}
          </View>
        </View>
        {canWrite ? (
          <Select
            label={t("scoutingModel.ui.archetype")}
            value={manualArchetype}
            onChange={(v) => onArchetype(v as ArchetypeKey)}
            options={archetypeOptions}
            placeholder={
              top
                ? t("scoutingModel.ui.archetypeAuto", {
                    name: t(`scoutingModel.archetype.${top.archetype}`),
                  })
                : t("scoutingModel.ui.archetypeNone")
            }
          />
        ) : null}
        {manualArchetype && canWrite ? (
          <Text
            accessibilityRole="button"
            onPress={() => onArchetype(null)}
            style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: "600" }}
          >
            {t("scoutingModel.ui.archetypeAuto", {
              name: top ? t(`scoutingModel.archetype.${top.archetype}`) : "-",
            })}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Segmented
          label={t("scoutingModel.ui.radarMode")}
          value={view}
          onChange={setView}
          options={[
            { value: "attributes", label: t("scoutingModel.ui.radarAttributes") },
            { value: "corners", label: t("scoutingModel.ui.radarCorners") },
          ]}
        />
        <Segmented
          label={t("scoutingModel.ui.radarMode")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "values", label: t("scoutingModel.ui.valuesMode") },
            { value: "percentile", label: t("scoutingModel.ui.percentileMode") },
          ]}
        />
        <RadarChart
          axes={axes}
          series={[{ label: "", values, color: SERIES_COLORS[0] }]}
          size={view === "attributes" ? radar : Math.min(radar, 300)}
        />
        {mode === "percentile" ? (
          <Body muted>
            {pct
              ? t("scoutingModel.ui.percentileNote", { count: pct.size })
              : t("scoutingModel.ui.percentileNeed")}
          </Body>
        ) : null}
      </Card>

      <Card>
        <View style={styles.cols}>
          <AttributeList
            title={t("scoutingModel.ui.strengths")}
            keys={strengths}
            scores={profile.scores}
            tone="success"
          />
          <AttributeList
            title={t("scoutingModel.ui.weaknesses")}
            keys={weaknesses}
            scores={profile.scores}
            tone="warning"
          />
        </View>
      </Card>

      <Card>
        <Text style={[styles.heading, { color: colors.text }]}>
          {t("scoutingModel.ui.heatMap")}
        </Text>
        {profile.heat ? (
          <>
            <PitchHeat heat={profile.heat} width={320} />
            <Body muted>{t("scoutingModel.ui.heatDirection")}</Body>
          </>
        ) : (
          <Body muted>{t("scoutingModel.ui.heatNone")}</Body>
        )}
      </Card>

      {profile.archetypes.length > 1 ? (
        <Card>
          <Text style={[styles.heading, { color: colors.text }]}>
            {t("scoutingModel.ui.archetypeFits")}
          </Text>
          {profile.archetypes.map((a) => (
            <View key={a.archetype} style={styles.fitRow}>
              <Text style={[styles.fitLabel, { color: colors.text }]}>
                {t(`scoutingModel.archetype.${a.archetype}`)}
              </Text>
              <View style={[styles.fitTrack, { backgroundColor: colors.surfaceAlt }]}>
                <View
                  style={[
                    styles.fitBar,
                    { width: `${a.fit * 10}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
              <Text style={[styles.fitValue, { color: colors.textMuted }]}>{a.fit}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function AttributeList({
  title,
  keys,
  scores,
  tone,
}: {
  title: string;
  keys: AttributeKey[];
  scores: Scores;
  tone: "success" | "warning";
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View style={styles.col}>
      <Text style={[styles.heading, { color: colors[tone] }]}>{title}</Text>
      {keys.map((k) => (
        <View key={k} style={styles.attrRow}>
          <Text style={[styles.attrName, { color: colors.text }]} numberOfLines={1}>
            {t(`scoutingModel.attribute.${k}`)}
          </Text>
          <Text style={[styles.attrValue, { color: colors[tone] }]}>{scores[k]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  hero: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  heroText: { flex: 1, gap: spacing.xs },
  score: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: fontSize.xl, fontWeight: "800" },
  scoreLabel: { fontSize: fontSize.xs, fontWeight: "700" },
  archetype: { fontSize: fontSize.lg, fontWeight: "800" },
  heading: { fontSize: fontSize.md, fontWeight: "700" },
  cols: { flexDirection: "row", gap: spacing.md },
  col: { flex: 1, gap: spacing.xs },
  attrRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  attrName: { flex: 1, fontSize: fontSize.sm },
  attrValue: { fontSize: fontSize.sm, fontWeight: "800" },
  fitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fitLabel: { width: 120, fontSize: fontSize.sm },
  fitTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fitBar: { height: 8, borderRadius: 4 },
  fitValue: { width: 28, textAlign: "right", fontSize: fontSize.sm, fontWeight: "700" },
});
