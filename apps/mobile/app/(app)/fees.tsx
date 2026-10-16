import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { formatEuros } from "../../src/features/fees/money";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

const FILTERS = ["all", "open", "overdue", "paid"] as const;

/** The fees ledger: charges with what is still owed, filtered by status. */
export default function Fees() {
  const { t } = useTranslation();
  const router = useRouter();
  const canWrite = !!useMe().data?.permissions.includes("fees.write");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const list = useQuery({
    queryKey: ["fees", filter],
    queryFn: async () =>
      jsonOrThrow(
        await api.fees.charges.$get({ query: filter === "all" ? {} : { status: filter } }),
      ),
  });

  return (
    <Screen
      overlay={
        canWrite ? <Fab label={t("fees.new")} onPress={() => router.push("/fee/new")} /> : null
      }
    >
      <Choice
        label={t("fees.filter")}
        value={filter}
        onChange={(v) => setFilter(v as (typeof FILTERS)[number])}
        options={FILTERS.map((f) => ({ value: f, label: t(`feeStatus.${f}`) }))}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && list.data.charges.length === 0 ? <Body>{t("fees.empty")}</Body> : null}
      {list.data?.charges.map((c) => (
        <ListItem
          key={c.id}
          title={`${c.personName} · ${c.description}`}
          subtitle={`${t(`feeStatus.${c.status}`)} · ${c.dueDate}`}
          trailing={formatEuros(c.status === "paid" ? c.netCents : c.balanceCents)}
          onPress={() => router.push({ pathname: "/fee/[chargeId]", params: { chargeId: c.id } })}
        />
      ))}
    </Screen>
  );
}
