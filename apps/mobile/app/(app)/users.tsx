import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { PendingInvitations } from "../../src/features/users/PendingInvitations";
import { canOpenTab } from "../../src/navigation";
import { spacing } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { EmptyState } from "../../src/ui/EmptyState";
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Body, Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/** Ignores case and accents, so "joao" finds "João". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Logins of the club (users.manage): pending invitations, then users; a user opens to edit. */
export default function Users() {
  const { t } = useTranslation();
  const router = useRouter();
  const allowed = canOpenTab("users", useMe().data?.permissions ?? []);
  const [search, setSearch] = useState("");
  const users = useQuery({
    queryKey: ["users"],
    enabled: allowed,
    queryFn: async () => jsonOrThrow(await api.users.$get()),
  });

  if (!allowed) return <Redirect href="/" />;
  if (users.isPending) return <Centered />;
  const q = fold(search.trim());
  const shown = (users.data?.users ?? []).filter(
    (u) => !q || fold(`${u.name} ${u.email} ${u.personName ?? ""}`).includes(q),
  );
  return (
    <Screen
      overlay={<Fab label={t("users.invite.title")} onPress={() => router.push("/user/invite")} />}
    >
      <PendingInvitations />
      <Section title={t("users.title")}>
        <TextField
          label={t("users.search")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {users.isError ? (
          <>
            <Message tone="error">{t(errorKey(users.error))}</Message>
            <Button label={t("common.retry")} onPress={() => users.refetch()} />
          </>
        ) : null}
        {users.isSuccess && shown.length === 0 ? (
          <EmptyState icon="key-outline" text={t(q ? "common.none" : "users.empty")} />
        ) : null}
        {shown.map((user) => (
          <ListItem
            key={user.id}
            leading={<Avatar name={user.name} />}
            title={user.name}
            subtitle={user.email}
            onPress={() => router.push({ pathname: "/user/[userId]", params: { userId: user.id } })}
            footer={
              <View style={{ gap: spacing.xs }}>
                <Body muted>
                  {user.roles.length > 0
                    ? user.roles
                        .map((r) =>
                          r.scopeName
                            ? `${t(`roles.${r.role}`)} (${r.scopeName})`
                            : t(`roles.${r.role}`),
                        )
                        .join(", ")
                    : t("users.noRoles")}
                </Body>
                {user.deactivatedAt ? <Badge tone="danger" label={t("users.deactivated")} /> : null}
              </View>
            }
          />
        ))}
      </Section>
    </Screen>
  );
}
