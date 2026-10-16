import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";
import { ListItem } from "../../ui/ListItem";
import { Body } from "../../ui/Text";
import { addDays, todayLisbon } from "../bookings/time";

/** Attendance of a team over the last 90 days, one line per person. Hidden when empty. */
export function AttendanceStats({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const today = todayLisbon();
  const stats = useQuery({
    queryKey: ["callups", "stats", teamId],
    queryFn: async () =>
      jsonOrThrow(
        await api.callups.stats.$get({
          query: { teamId, from: addDays(today, -90), to: today },
        }),
      ),
    retry: false,
  });
  const rows = stats.data?.stats ?? [];
  if (rows.length === 0) return null;
  return (
    <>
      <Body muted>{t("callups.stats")}</Body>
      {rows.map((r) => (
        <ListItem
          key={r.personId}
          title={r.name}
          subtitle={t("callups.statsLine", {
            present: r.present,
            absent: r.absent,
            excused: r.excused,
            called: r.called,
          })}
          trailing={r.rate === null ? undefined : `${Math.round(r.rate * 100)}%`}
        />
      ))}
    </>
  );
}
