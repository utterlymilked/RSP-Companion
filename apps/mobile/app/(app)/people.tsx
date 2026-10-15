import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** People the user may see (general tier), searchable by name. */
export default function People() {
  const { t } = useTranslation();
  const router = useRouter();
  const canWrite = useMe().data?.permissions.includes("people.write");
  const [search, setSearch] = useState("");
  const q = search.trim();
  const people = useQuery({
    queryKey: ["people", q],
    queryFn: async () => jsonOrThrow(await api.people.$get({ query: q ? { q } : {} })),
  });

  return (
    <Screen>
      <TextField
        label={t("people.searchLabel")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="words"
      />
      {canWrite ? (
        <Button label={t("people.new")} onPress={() => router.push("/person/new")} />
      ) : null}
      {people.isError ? (
        <>
          <Message tone="error">{t(errorKey(people.error))}</Message>
          <Button label={t("common.retry")} onPress={() => people.refetch()} />
        </>
      ) : null}
      {people.data?.people.length === 0 ? <Body>{t("people.empty")}</Body> : null}
      {people.data?.people.map((person) => (
        <ListItem
          key={person.id}
          title={person.fullName}
          subtitle={person.displayName ?? undefined}
          onPress={() =>
            router.push({ pathname: "/person/[personId]", params: { personId: person.id } })
          }
        />
      ))}
    </Screen>
  );
}
