import { PROSPECT_STATUSES } from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** Scouting pipeline: external prospects by status, expired ones flagged. */
export default function Scouting() {
  const { t } = useTranslation();
  const router = useRouter();
  const canWrite = !!useMe().data?.permissions.includes("scouting.write");
  const [status, setStatus] = useState("all");
  const list = useQuery({
    queryKey: ["scouting", status],
    queryFn: async () =>
      jsonOrThrow(
        await api.scouting.prospects.$get({
          query: status === "all" ? {} : { status: status as (typeof PROSPECT_STATUSES)[number] },
        }),
      ),
  });

  return (
    <Screen>
      {canWrite ? (
        <Button label={t("scouting.new")} onPress={() => router.push("/scouting/new")} />
      ) : null}
      <Choice
        label={t("scouting.filter")}
        value={status}
        onChange={setStatus}
        options={[
          { value: "all", label: t("scouting.all") },
          ...PROSPECT_STATUSES.map((s) => ({ value: s, label: t(`prospectStatus.${s}`) })),
        ]}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && list.data.prospects.length === 0 ? <Body>{t("scouting.empty")}</Body> : null}
      {list.data?.prospects.map((p) => (
        <ListItem
          key={p.id}
          title={p.fullName}
          subtitle={[
            t(`prospectStatus.${p.status}`),
            p.birthYear,
            p.currentClub,
            p.expired ? t("scouting.expired") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          trailing={p.lastRating ? `${p.lastRating}/5` : undefined}
          onPress={() =>
            router.push({ pathname: "/scouting/[prospectId]", params: { prospectId: p.id } })
          }
        />
      ))}
    </Screen>
  );
}
