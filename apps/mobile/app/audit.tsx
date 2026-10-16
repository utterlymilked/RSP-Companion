import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../src/api";
import { errorKey, jsonOrThrow } from "../src/errors";
import { clockTime, dayOf } from "../src/features/bookings/time";
import { Button } from "../src/ui/Button";
import { Centered } from "../src/ui/Centered";
import { ListItem } from "../src/ui/ListItem";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";

const PAGE = 50;

/** Audit log viewer (admins): who read or changed sensitive data, about whom, and when. */
export default function AuditLog() {
  const { t } = useTranslation();
  const router = useRouter();
  const log = useInfiniteQuery({
    queryKey: ["audit-log"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      jsonOrThrow(
        await api["audit-log"].$get({
          query: { limit: String(PAGE), ...(pageParam ? { before: pageParam } : {}) },
        }),
      ),
    getNextPageParam: (last) =>
      last.entries.length < PAGE ? undefined : last.entries[last.entries.length - 1]?.occurredAt,
  });

  if (log.isPending) return <Centered />;
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("audit.title")}</Title>
      <Body muted>{t("audit.hint")}</Body>
      {log.isError ? <Message tone="error">{t(errorKey(log.error))}</Message> : null}
      {log.isSuccess && entries.length === 0 ? <Body>{t("audit.empty")}</Body> : null}
      {entries.map((e) => (
        <ListItem
          key={e.id}
          title={t(`audit.action.${e.action}`)}
          subtitle={[
            `${dayOf(e.occurredAt)} ${clockTime(e.occurredAt)}`,
            e.actorName ?? t("audit.system"),
            e.subjectPersonName ?? e.subjectUserName,
          ]
            .filter(Boolean)
            .join(" · ")}
          trailing={e.tier ? t(`audit.tier.${e.tier}`) : undefined}
        />
      ))}
      {log.hasNextPage ? (
        <Button
          label={t("audit.more")}
          variant="secondary"
          busy={log.isFetchingNextPage}
          onPress={() => log.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}
