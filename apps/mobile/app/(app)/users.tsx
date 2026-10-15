import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { canOpenTab } from "../../src/navigation";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** Users and their roles (users.manage). Inviting and editing roles come with M5. */
export default function Users() {
  const { t } = useTranslation();
  const allowed = canOpenTab("users", useMe().data?.permissions ?? []);
  const users = useQuery({
    queryKey: ["users"],
    enabled: allowed,
    queryFn: async () => jsonOrThrow(await api.users.$get()),
  });

  if (!allowed) return <Redirect href="/" />;
  if (users.isPending) return <Centered />;
  return (
    <Screen>
      {users.isError ? (
        <>
          <Message tone="error">{t(errorKey(users.error))}</Message>
          <Button label={t("common.retry")} onPress={() => users.refetch()} />
        </>
      ) : null}
      {users.data?.users.length === 0 ? <Body>{t("users.empty")}</Body> : null}
      {users.data?.users.map((user) => (
        <ListItem
          key={user.id}
          title={user.name}
          subtitle={user.email}
          trailing={user.roles.map((r) => t(`roles.${r.role}`)).join(", ")}
        />
      ))}
    </Screen>
  );
}
