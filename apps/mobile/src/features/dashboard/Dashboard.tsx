import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { Button } from "../../ui/Button";
import { Section } from "../../ui/Section";
import { Message } from "../../ui/Text";
import { Tile, TileGrid } from "../../ui/Tile";
import { formatEuros } from "../fees/money";
import { saveCsv } from "./download";

const EXPORTS = [
  { key: "overdueFees", file: "overdue-fees.csv" },
  { key: "lowStock", file: "stock.csv" },
  { key: "expiringDocuments", file: "expiring-documents.csv" },
] as const;
type ExportFile = (typeof EXPORTS)[number]["file"];

/** Club-wide numbers for the roles that manage the club, with CSV exports of the lists behind them. */
export function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => jsonOrThrow(await api.dashboard.$get()),
  });
  const download = useMutation({
    mutationFn: async (file: ExportFile) => {
      const res = await api.dashboard.export[file].$get();
      if (!res.ok) await jsonOrThrow(res);
      await saveCsv(file, await res.text());
    },
  });
  const w = query.data?.widgets;
  if (!w) return null;
  const go = (href: string) => () => router.push(href as Href);
  const exportable = EXPORTS.filter((e) => w[e.key] !== undefined);
  const tiles = [
    w.upcomingEvents && {
      icon: "calendar" as const,
      label: t("dashboard.upcomingEvents", { count: w.upcomingEvents.days }),
      value: String(w.upcomingEvents.count),
      href: "/events",
    },
    w.overdueFees && {
      icon: "wallet" as const,
      label: t("dashboard.overdueFees"),
      value: formatEuros(w.overdueFees.balanceCents),
      detail: t("dashboard.overduePeople", { count: w.overdueFees.people }),
      href: "/fees",
      tone: "danger" as const,
    },
    w.lowStock && {
      icon: "cube" as const,
      label: t("dashboard.lowStock"),
      value: String(w.lowStock.count),
      href: "/equipment",
      tone: "warning" as const,
    },
    w.openLoans && {
      icon: "swap-horizontal" as const,
      label: t("dashboard.openLoans"),
      value: String(w.openLoans.count),
      href: "/equipment",
    },
    w.openIncidents && {
      icon: "alert-circle" as const,
      label: t("dashboard.openIncidents"),
      value: String(w.openIncidents.count),
      href: "/incidents",
      tone: "warning" as const,
    },
    w.expiringDocuments && {
      icon: "document-text" as const,
      label: t("dashboard.expiringDocuments", { count: w.expiringDocuments.days }),
      value: String(w.expiringDocuments.count),
      href: "/documents",
    },
    w.openPrivacyRequests && {
      icon: "shield-checkmark" as const,
      label: t("dashboard.openPrivacyRequests"),
      value: String(w.openPrivacyRequests.count),
      href: "/privacy/requests",
    },
  ].filter((tile) => !!tile);
  if (tiles.length === 0) return null;
  return (
    <Section title={t("dashboard.title")}>
      <TileGrid>
        {tiles.map((tile) => (
          <Tile
            key={tile.href + tile.icon}
            icon={tile.icon}
            label={tile.label}
            value={tile.value}
            detail={"detail" in tile ? tile.detail : undefined}
            tone={"tone" in tile ? tile.tone : "primary"}
            onPress={go(tile.href)}
          />
        ))}
      </TileGrid>
      {exportable.length > 0 ? (
        <View style={styles.exports}>
          {exportable.map((e) => (
            <Button
              key={e.file}
              compact
              variant="secondary"
              icon="download-outline"
              label={t(`dashboard.export.${e.key}`)}
              busy={download.isPending && download.variables === e.file}
              onPress={() => download.mutate(e.file)}
            />
          ))}
        </View>
      ) : null}
      {download.error ? <Message tone="error">{t(errorKey(download.error))}</Message> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  exports: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
