import { HEALTH_DISCIPLINES } from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Availability } from "../../src/features/health/TeamAvailability";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * Clinical staff find an athlete and open the records of their own discipline; roles with
 * `availability.read` (coaches, direção) see the derived availability, never the cause.
 */
export default function Health() {
  const { t } = useTranslation();
  const router = useRouter();
  const permissions = useMe().data?.permissions ?? [];
  const isClinical = HEALTH_DISCIPLINES.some((d) => permissions.includes(`health.${d}.read`));
  const [search, setSearch] = useState("");
  const q = search.trim();
  const people = useQuery({
    queryKey: ["people", q],
    enabled: isClinical && q.length >= 2,
    queryFn: async () => jsonOrThrow(await api.people.$get({ query: { q } })),
  });

  return (
    <Screen>
      {isClinical ? (
        <>
          <TextField
            label={t("health.searchLabel")}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="words"
          />
          {people.isError ? <Message tone="error">{t(errorKey(people.error))}</Message> : null}
          {people.data?.people.map((p) => (
            <ListItem
              key={p.id}
              title={p.fullName}
              onPress={() =>
                router.push({ pathname: "/health/[personId]", params: { personId: p.id } })
              }
            />
          ))}
        </>
      ) : null}
      {permissions.includes("availability.read") ? <Availability /> : null}
    </Screen>
  );
}
