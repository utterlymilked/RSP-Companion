import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** The economato: items with their stock, low ones flagged. */
export default function Equipment() {
  const { t } = useTranslation();
  const router = useRouter();
  const canWrite = !!useMe().data?.permissions.includes("equipment.write");
  const [filter, setFilter] = useState("all");
  const list = useQuery({
    queryKey: ["equipment", filter],
    queryFn: async () =>
      jsonOrThrow(
        await api.equipment.items.$get({ query: filter === "low" ? { low: "true" } : {} }),
      ),
  });

  return (
    <Screen
      overlay={
        canWrite ? (
          <Fab label={t("equipment.new")} onPress={() => router.push("/equipment/new")} />
        ) : null
      }
    >
      <Choice
        label={t("equipment.filter")}
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("equipment.all") },
          { value: "low", label: t("equipment.lowOnly") },
        ]}
      />
      {list.isError ? (
        <>
          <Message tone="error">{t(errorKey(list.error))}</Message>
          <Button label={t("common.retry")} onPress={() => list.refetch()} />
        </>
      ) : null}
      {list.data && list.data.items.length === 0 ? <Body>{t("equipment.empty")}</Body> : null}
      {list.data?.items.map((i) => (
        <ListItem
          key={i.id}
          title={`${i.name}${i.size ? ` · ${i.size}` : ""}`}
          subtitle={`${t(`equipmentCategory.${i.category}`)}${i.low ? ` · ${t("equipment.low")}` : ""}`}
          trailing={t("equipment.stock", { count: i.stock })}
          onPress={() => router.push({ pathname: "/equipment/[itemId]", params: { itemId: i.id } })}
        />
      ))}
    </Screen>
  );
}
