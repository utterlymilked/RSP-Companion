import { ATTRIBUTE_KEYS, attributesFor, overallScore } from "@rsc/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import {
  axisLabel,
  SERIES_COLORS,
  useProspectPool,
  useRadarSize,
} from "../../src/features/scouting/model";
import { RadarChart } from "../../src/features/scouting/RadarChart";
import { fontSize, spacing, useColors } from "../../src/theme";
import { BackBar } from "../../src/ui/BackBar";
import { Card } from "../../src/ui/Card";
import { Centered } from "../../src/ui/Centered";
import { Screen } from "../../src/ui/Screen";
import { MultiSelect } from "../../src/ui/Select";
import { Body, Title } from "../../src/ui/Text";

const MAX = 4;

/** Overlays the profiles of 2 to 4 scouted athletes on one radar, with a table below. */
export default function CompareProspects() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const radar = useRadarSize();
  const pool = useProspectPool();
  const [ids, setIds] = useState<string[]>([]);
  if (pool.isPending) return <Centered />;
  const rated = (pool.data?.prospects ?? []).filter((p) => p.profile.overall !== null);
  const chosen = ids
    .map((id) => rated.find((p) => p.id === id))
    .filter((p): p is (typeof rated)[number] => !!p);
  const keys = ATTRIBUTE_KEYS.filter((k) =>
    chosen.every((p) => attributesFor(p.profile.group).includes(k)),
  );
  const ready = chosen.length >= 2 && keys.length >= 3;

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("scoutingModel.ui.compareTitle")}</Title>
      <MultiSelect
        label={t("scoutingModel.ui.comparePick")}
        values={ids}
        onChange={(v) => setIds(v.slice(0, MAX))}
        options={rated.map((p) => ({
          value: p.id,
          label: p.fullName,
          hint: `${t(`scoutingModel.group.${p.profile.group}`)} · ${p.profile.overall}`,
          disabled: !ids.includes(p.id) && ids.length >= MAX,
        }))}
      />
      {!ready ? <Body muted>{t("scoutingModel.ui.compareHint")}</Body> : null}
      {ready ? (
        <>
          <Card>
            <RadarChart
              axes={keys.map((k) => axisLabel(t, k))}
              series={chosen.map((p, i) => ({
                label: p.fullName,
                values: keys.map((k) => p.profile.scores[k]),
                color: SERIES_COLORS[i] ?? SERIES_COLORS[0],
              }))}
              size={radar}
            />
            <View style={styles.legend}>
              {chosen.map((p, i) => (
                <View key={p.id} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: SERIES_COLORS[i] }]} />
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "600" }}>
                    {p.fullName}
                  </Text>
                </View>
              ))}
            </View>
            <Body muted>{t("scoutingModel.ui.compareGroupNote")}</Body>
          </Card>
          <Card>
            <View style={styles.row}>
              <Text style={[styles.attr, { color: colors.textMuted }]}>
                {t("scoutingModel.ui.overall")}
              </Text>
              {chosen.map((p, i) => (
                <Text key={p.id} style={[styles.cell, { color: SERIES_COLORS[i] }]}>
                  {overallScore(p.profile.scores, p.profile.group) ?? "-"}
                </Text>
              ))}
            </View>
            {keys.map((k) => {
              const best = Math.max(...chosen.map((p) => p.profile.scores[k] ?? 0));
              return (
                <View key={k} style={styles.row}>
                  <Text style={[styles.attr, { color: colors.text }]} numberOfLines={1}>
                    {t(`scoutingModel.attribute.${k}`)}
                  </Text>
                  {chosen.map((p) => {
                    const v = p.profile.scores[k];
                    return (
                      <Text
                        key={p.id}
                        style={[
                          styles.cell,
                          { color: v === best && best > 0 ? colors.success : colors.textMuted },
                        ]}
                      >
                        {v ?? "-"}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 12, height: 12, borderRadius: 6 },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: 2 },
  attr: { flex: 1, fontSize: fontSize.sm },
  cell: { width: 44, textAlign: "center", fontSize: fontSize.sm, fontWeight: "800" },
});
