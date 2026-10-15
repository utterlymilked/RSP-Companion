import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** Competition teams the user may see. */
export default function Teams() {
  const { t } = useTranslation();
  const router = useRouter();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  return (
    <Screen>
      {teams.isError ? (
        <>
          <Message tone="error">{t(errorKey(teams.error))}</Message>
          <Button label={t("common.retry")} onPress={() => teams.refetch()} />
        </>
      ) : null}
      {teams.data?.teams.length === 0 ? <Body>{t("teams.empty")}</Body> : null}
      {teams.data?.teams.map((team) => (
        <ListItem
          key={team.id}
          title={team.name}
          onPress={() => router.push({ pathname: "/team/[teamId]", params: { teamId: team.id } })}
        />
      ))}
    </Screen>
  );
}
