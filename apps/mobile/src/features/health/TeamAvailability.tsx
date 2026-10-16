import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { ListItem } from "../../ui/ListItem";
import { Body, Message } from "../../ui/Text";

/**
 * Who is available, limited or out: a status per athlete and nothing about the cause.
 * With a team, lists its squad; without, lists only the people who are not fully available.
 */
export function Availability({ teamId }: { teamId?: string }) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["availability", teamId ?? "all"],
    queryFn: async () =>
      jsonOrThrow(await api.health.availability.$get({ query: teamId ? { teamId } : {} })),
  });
  return (
    <>
      <Body muted>{t("health.availabilityTitle")}</Body>
      {list.isError ? <Message tone="error">{t(errorKey(list.error))}</Message> : null}
      {list.data?.people.length === 0 ? <Body>{t("health.allAvailable")}</Body> : null}
      {list.data?.people.map((p) => (
        <ListItem
          key={p.personId}
          title={p.fullName}
          trailing={t(`availabilityStatus.${p.status}`)}
        />
      ))}
    </>
  );
}
