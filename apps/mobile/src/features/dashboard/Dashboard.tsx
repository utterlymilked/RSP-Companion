import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { Button } from "../../ui/Button";
import { ListItem } from "../../ui/ListItem";
import { Body, Message } from "../../ui/Text";
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
  return (
    <>
      <Body muted>{t("dashboard.title")}</Body>
      {w.upcomingEvents ? (
        <ListItem
          title={t("dashboard.upcomingEvents", { count: w.upcomingEvents.days })}
          trailing={String(w.upcomingEvents.count)}
          onPress={go("/events")}
        />
      ) : null}
      {w.overdueFees ? (
        <ListItem
          title={t("dashboard.overdueFees")}
          subtitle={t("dashboard.overduePeople", { count: w.overdueFees.people })}
          trailing={formatEuros(w.overdueFees.balanceCents)}
          onPress={go("/fees")}
        />
      ) : null}
      {w.lowStock ? (
        <ListItem
          title={t("dashboard.lowStock")}
          trailing={String(w.lowStock.count)}
          onPress={go("/equipment")}
        />
      ) : null}
      {w.openLoans ? (
        <ListItem
          title={t("dashboard.openLoans")}
          trailing={String(w.openLoans.count)}
          onPress={go("/equipment")}
        />
      ) : null}
      {w.openIncidents ? (
        <ListItem
          title={t("dashboard.openIncidents")}
          trailing={String(w.openIncidents.count)}
          onPress={go("/incidents")}
        />
      ) : null}
      {w.expiringDocuments ? (
        <ListItem
          title={t("dashboard.expiringDocuments", { count: w.expiringDocuments.days })}
          trailing={String(w.expiringDocuments.count)}
          onPress={go("/documents")}
        />
      ) : null}
      {w.openPrivacyRequests ? (
        <ListItem
          title={t("dashboard.openPrivacyRequests")}
          trailing={String(w.openPrivacyRequests.count)}
          onPress={go("/privacy/requests")}
        />
      ) : null}
      {exportable.length > 0 ? <Body muted>{t("dashboard.exports")}</Body> : null}
      {exportable.map((e) => (
        <Button
          key={e.file}
          variant="secondary"
          label={t(`dashboard.export.${e.key}`)}
          busy={download.isPending && download.variables === e.file}
          onPress={() => download.mutate(e.file)}
        />
      ))}
      {download.error ? <Message tone="error">{t(errorKey(download.error))}</Message> : null}
    </>
  );
}
