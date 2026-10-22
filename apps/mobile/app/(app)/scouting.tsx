import {
  ARCHETYPE_KEYS,
  ATTRIBUTE_CORNERS,
  cornerScores,
  POSITION_GROUPS,
  PROSPECT_ESCALOES,
  PROSPECT_STATUSES,
} from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { SERIES_COLORS } from "../../src/features/scouting/model";
import { RadarChart } from "../../src/features/scouting/RadarChart";
import { spacing, useColors } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Fab } from "../../src/ui/Fab";
import { Screen } from "../../src/ui/Screen";
import { Select } from "../../src/ui/Select";
import { Body, Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const ANY = "any";

/** Scouting: scouted athletes as profile cards, filterable, with comparison. */
export default function Scouting() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const canWrite = !!useMe().data?.permissions.includes("scouting.write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ANY);
  const [group, setGroup] = useState(ANY);
  const [archetype, setArchetype] = useState(ANY);
  const [escalao, setEscalao] = useState(ANY);
  const [link, setLink] = useState(ANY);
  const [origin, setOrigin] = useState(ANY);
  const list = useQuery({
    queryKey: ["scouting", q.trim(), status, group, archetype, escalao, link, origin],
    queryFn: async () =>
      jsonOrThrow(
        await api.scouting.prospects.$get({
          query: {
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(status !== ANY ? { status: status as (typeof PROSPECT_STATUSES)[number] } : {}),
            ...(group !== ANY ? { group: group as (typeof POSITION_GROUPS)[number] } : {}),
            ...(archetype !== ANY
              ? { archetype: archetype as (typeof ARCHETYPE_KEYS)[number] }
              : {}),
            ...(escalao !== ANY ? { escalao: escalao as (typeof PROSPECT_ESCALOES)[number] } : {}),
            ...(link !== ANY ? { link: link as "linked" | "unlinked" } : {}),
            ...(origin !== ANY ? { source: origin as "scout" | "request" } : {}),
          },
        }),
      ),
  });
  const any = { value: ANY, label: t("scoutingModel.ui.anyOption") };

  return (
    <Screen
      overlay={
        canWrite ? (
          <Fab label={t("scouting.new")} onPress={() => router.push("/scouting/new")} />
        ) : null
      }
    >
      <Body muted>{t("scouting.areaHint")}</Body>
      <TextField label={t("scoutingModel.ui.search")} value={q} onChangeText={setQ} />
      <View style={styles.filters}>
        <View style={styles.filter}>
          <Select
            label={t("scouting.status")}
            value={status}
            onChange={setStatus}
            options={[
              any,
              ...PROSPECT_STATUSES.map((s) => ({
                value: s as string,
                label: t(`prospectStatus.${s}`),
              })),
            ]}
          />
        </View>
        <View style={styles.filter}>
          <Select
            label={t("scoutingModel.ui.group")}
            value={group}
            onChange={setGroup}
            options={[
              any,
              ...POSITION_GROUPS.map((g) => ({
                value: g as string,
                label: t(`scoutingModel.group.${g}`),
              })),
            ]}
          />
        </View>
        <View style={styles.filter}>
          <Select
            label={t("scoutingModel.ui.archetype")}
            value={archetype}
            onChange={setArchetype}
            options={[
              any,
              ...ARCHETYPE_KEYS.map((a) => ({
                value: a as string,
                label: t(`scoutingModel.archetype.${a}`),
              })),
            ]}
          />
        </View>
        <View style={styles.filter}>
          <Select
            label={t("scoutingModel.ui.escalao")}
            value={escalao}
            onChange={setEscalao}
            options={[
              any,
              ...PROSPECT_ESCALOES.map((e) => ({ value: e as string, label: t(`escalao.${e}`) })),
            ]}
          />
        </View>
        <View style={styles.filter}>
          <Select
            label={t("scoutingModel.ui.link")}
            value={link}
            onChange={setLink}
            options={[
              { value: ANY, label: t("scoutingModel.ui.linkAny") },
              { value: "linked", label: t("scoutingModel.ui.linkLinked") },
              { value: "unlinked", label: t("scoutingModel.ui.linkUnlinked") },
            ]}
          />
        </View>
        <View style={styles.filter}>
          <Select
            label={t("scouting.origin")}
            value={origin}
            onChange={setOrigin}
            options={[
              { value: ANY, label: t("scouting.originAny") },
              { value: "request", label: t("scouting.originRequest") },
              { value: "scout", label: t("scouting.originScout") },
            ]}
          />
        </View>
      </View>
      <Button
        variant="secondary"
        label={t("scoutingModel.ui.compare")}
        onPress={() => router.push("/scouting/compare")}
      />
      <Button
        variant="ghost"
        label={t("trialRequest.open")}
        onPress={() => router.push("/trial-request")}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && list.data.prospects.length === 0 ? <Body>{t("scouting.empty")}</Body> : null}
      {list.data?.prospects.map((p) => {
        const corners = cornerScores(p.profile.scores, p.profile.group);
        return (
          <Card
            key={p.id}
            accessibilityLabel={p.fullName}
            onPress={() =>
              router.push({ pathname: "/scouting/[prospectId]", params: { prospectId: p.id } })
            }
          >
            <View style={styles.card}>
              <Avatar name={p.fullName} size={44} />
              <View style={styles.texts}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
                  {p.fullName}
                </Text>
                <Body muted>
                  {[
                    t(`scoutingModel.group.${p.profile.group}`),
                    p.targetEscalao && t(`escalao.${p.targetEscalao}`),
                    p.currentClub,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Body>
                <View style={styles.badges}>
                  <Badge tone="neutral" label={t(`prospectStatus.${p.status}`)} />
                  {p.profile.archetype ? (
                    <Badge
                      tone="primary"
                      label={t(`scoutingModel.archetype.${p.profile.archetype}`)}
                    />
                  ) : null}
                  {p.person ? (
                    <Badge tone="success" label={t("scoutingModel.ui.linkLinked")} />
                  ) : null}
                  {p.source === "request" ? (
                    <Badge tone="warning" label={t("scouting.requestBadge")} />
                  ) : null}
                  {p.expired ? <Badge tone="danger" label={t("scouting.expired")} /> : null}
                </View>
              </View>
              {p.profile.overall !== null ? (
                <View style={styles.mini}>
                  <RadarChart
                    compact
                    size={72}
                    axes={ATTRIBUTE_CORNERS.map((c) => c)}
                    series={[
                      {
                        label: "",
                        values: ATTRIBUTE_CORNERS.map((c) => corners[c]),
                        color: SERIES_COLORS[0],
                      },
                    ]}
                  />
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>
                    {p.profile.overall.toFixed(1)}
                  </Text>
                </View>
              ) : p.lastRating ? (
                <Text style={{ color: colors.textMuted, fontWeight: "700" }}>{p.lastRating}/5</Text>
              ) : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  filter: { flexGrow: 1, flexBasis: 150, minWidth: 140 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  texts: { flex: 1, gap: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  mini: { alignItems: "center", gap: 2 },
});
