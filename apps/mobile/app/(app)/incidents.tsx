import { INCIDENT_STATUSES, INCIDENT_TYPES } from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayOf } from "../../src/features/bookings/time";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** The incident log, newest first, filtered by type and status. */
export default function Incidents() {
  const { t } = useTranslation();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const list = useQuery({
    queryKey: ["incidents", type, status],
    queryFn: async () =>
      jsonOrThrow(
        await api.incidents.$get({
          query: {
            ...(type === "all" ? {} : { type: type as (typeof INCIDENT_TYPES)[number] }),
            ...(status === "all" ? {} : { status: status as (typeof INCIDENT_STATUSES)[number] }),
          },
        }),
      ),
  });

  return (
    <Screen
      overlay={
        permissions.includes("incidents.write") ? (
          <Fab label={t("incidents.new")} onPress={() => router.push("/incident/new")} />
        ) : null
      }
    >
      <Choice
        label={t("incidents.filterType")}
        value={type}
        onChange={setType}
        options={[
          { value: "all", label: t("incidents.all") },
          ...INCIDENT_TYPES.map((v) => ({ value: v, label: t(`incidentType.${v}`) })),
        ]}
      />
      <Choice
        label={t("incidents.filterStatus")}
        value={status}
        onChange={setStatus}
        options={[
          { value: "all", label: t("incidents.all") },
          ...INCIDENT_STATUSES.map((v) => ({ value: v, label: t(`incidentStatus.${v}`) })),
        ]}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && list.data.incidents.length === 0 ? <Body>{t("incidents.empty")}</Body> : null}
      {list.data?.incidents.map((i) => (
        <ListItem
          key={i.id}
          title={`${dayOf(i.occurredAt)} ${clockTime(i.occurredAt)} · ${t(`incidentType.${i.type}`)}`}
          subtitle={`${i.place ?? ""}${i.place ? " · " : ""}${t(`incidentStatus.${i.status}`)}`}
          onPress={() =>
            router.push({ pathname: "/incident/[incidentId]", params: { incidentId: i.id } })
          }
        />
      ))}
    </Screen>
  );
}
