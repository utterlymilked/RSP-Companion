import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * What needs attention first: documents that are expired or about to expire in the user's
 * teams (the API limits the list). Search finds anyone else's documents.
 */
export default function Documents() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const q = search.trim();
  const open = (personId: string) =>
    router.push({ pathname: "/documents/[personId]", params: { personId } });
  const expiring = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: async () => jsonOrThrow(await api.documents.expiring.$get({ query: {} })),
  });
  const missing = useQuery({
    queryKey: ["documents", "missing"],
    queryFn: async () => jsonOrThrow(await api.documents.missing.$get()),
  });
  const people = useQuery({
    queryKey: ["people", q],
    enabled: q.length >= 2,
    queryFn: async () => jsonOrThrow(await api.people.$get({ query: { q } })),
  });

  return (
    <Screen>
      <Body muted>{t("documents.expiringTitle")}</Body>
      {expiring.isError ? (
        <>
          <Message tone="error">{t(errorKey(expiring.error))}</Message>
          <Button label={t("common.retry")} onPress={() => expiring.refetch()} />
        </>
      ) : null}
      {expiring.data?.documents.length === 0 ? <Body>{t("documents.noneExpiring")}</Body> : null}
      {expiring.data?.documents.map((d) => (
        <ListItem
          key={`${d.personId}-${d.kind}`}
          title={d.fullName}
          subtitle={`${t(`documents.kinds.${d.kind}`)} · ${t(`documents.status.${d.status}`, { date: d.expiresOn })}`}
          onPress={() => open(d.personId)}
        />
      ))}
      <Body muted>{t("documents.missingTitle")}</Body>
      {missing.isError ? <Message tone="error">{t(errorKey(missing.error))}</Message> : null}
      {missing.data?.people.length === 0 ? <Body>{t("documents.noneMissing")}</Body> : null}
      {missing.data?.people.map((m) => (
        <ListItem
          key={m.personId}
          title={m.fullName}
          subtitle={`${t(`documents.roles.${m.role}`)} · ${t("documents.missingLine", {
            kinds: m.missing.map((k) => t(`documents.kinds.${k}`)).join(", "),
          })}`}
          onPress={() => open(m.personId)}
        />
      ))}
      <TextField
        label={t("documents.searchLabel")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="words"
      />
      {people.isError ? <Message tone="error">{t(errorKey(people.error))}</Message> : null}
      {people.data?.people.map((p) => (
        <ListItem key={p.id} title={p.fullName} onPress={() => open(p.id)} />
      ))}
    </Screen>
  );
}
