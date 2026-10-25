import { isScopedRole, ROLES, type Role, type UserDetail } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { api } from "../../src/api";
import { meQueryKey, useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { CoachingTeams } from "../../src/features/users/CoachingTeams";
import { shortDate } from "../../src/features/users/format";
import { PersonPicker } from "../../src/features/users/PersonPicker";
import { RoleAdder } from "../../src/features/users/RoleAdder";
import { GrantRow } from "../../src/features/users/RoleList";
import { canOpenTab } from "../../src/navigation";
import { spacing } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { BackBar } from "../../src/ui/BackBar";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Body, Message, Title } from "../../src/ui/Text";

/**
 * One login (users.manage): its roles (club-wide, or per team for coach and delegado), the
 * person record it is linked to, and deactivation. The API enforces every rule shown here.
 */
export default function UserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe().data;
  const allowed = canOpenTab("users", me?.permissions ?? []);
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const user = useQuery({
    queryKey: ["user", userId],
    enabled: allowed,
    queryFn: async () =>
      jsonOrThrow(await api.users[":userId"].$get({ param: { userId } })) as Promise<{
        user: UserDetail;
      }>,
  });

  if (!allowed) return <Redirect href="/" />;
  if (user.isPending) return <Centered />;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      {user.isError ? (
        <>
          <Message tone="error">{t(errorKey(user.error))}</Message>
          <Button label={t("common.retry")} onPress={() => user.refetch()} />
        </>
      ) : null}
      {user.data ? <UserEditor user={user.data.user} isSelf={me?.user.id === userId} /> : null}
    </Screen>
  );
}

function UserEditor({ user, isSelf }: { user: UserDetail; isSelf: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user", user.id] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      // Own roles changed: menus and permissions follow at once.
      isSelf ? queryClient.invalidateQueries({ queryKey: meQueryKey }) : null,
    ]);
  };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Avatar name={user.name} size={56} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Title>{user.name}</Title>
          <Body muted>{user.email}</Body>
          {user.deactivatedAt ? <Badge tone="danger" label={t("users.deactivated")} /> : null}
        </View>
      </View>
      <Body muted>
        {[
          t("users.createdOn", { date: shortDate(user.createdAt) }),
          user.lastSeenAt
            ? t("users.lastSeen", { date: shortDate(user.lastSeenAt) })
            : t("users.neverSeen"),
        ].join(" · ")}
      </Body>
      <Roles user={user} onChange={refresh} />
      <LinkedPerson user={user} onChange={refresh} />
      {user.roles.some((r) => isScopedRole(r.role)) ? (
        <CoachingTeams user={user} onChange={refresh} />
      ) : null}
      <Access user={user} isSelf={isSelf} onChange={refresh} />
    </>
  );
}

function Roles({ user, onChange }: { user: UserDetail; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const grant = useMutation({
    mutationFn: async (role: Role) =>
      jsonOrThrow(
        await api.users[":userId"].roles.$post({ param: { userId: user.id }, json: { role } }),
      ),
    onSuccess: onChange,
  });
  const revoke = useMutation({
    mutationFn: async (assignmentId: string) =>
      jsonOrThrow(
        await api.users[":userId"].roles[":assignmentId"].$delete({
          param: { userId: user.id, assignmentId },
        }),
      ),
    onSuccess: onChange,
  });
  const error = grant.error ?? revoke.error;
  return (
    <Section title={t("users.roles")}>
      <Body muted>{t("users.rolesHint")}</Body>
      {user.roles.length === 0 ? <Body>{t("users.noRoles")}</Body> : null}
      {user.roles.map((r) => (
        <GrantRow
          key={r.id}
          grant={r}
          scopeNames={r.scopeNames}
          busy={revoke.isPending && revoke.variables === r.id}
          onRemove={() => {
            grant.reset();
            revoke.mutate(r.id);
          }}
        />
      ))}
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
      <RoleAdder
        roles={ROLES}
        taken={user.roles.map((r) => r.role)}
        label={t("users.newRole")}
        busy={grant.isPending}
        onAdd={(role) => {
          revoke.reset();
          grant.mutate(role);
        }}
      />
    </Section>
  );
}

function LinkedPerson({ user, onChange }: { user: UserDetail; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const link = useMutation({
    mutationFn: async (personId: string | null) =>
      jsonOrThrow(
        await api.users[":userId"].person.$put({
          param: { userId: user.id },
          json: { personId },
        }),
      ),
    onSuccess: onChange,
  });
  return (
    <Section title={t("users.person.title")}>
      <Body muted>{t("users.person.hint")}</Body>
      {user.personId && user.personName ? (
        <>
          <ListItem
            leading={<Avatar name={user.personName} />}
            title={user.personName}
            subtitle={t("users.person.open")}
            onPress={() =>
              router.push({
                pathname: "/person/[personId]",
                params: { personId: user.personId ?? "" },
              })
            }
          />
          <Button
            label={t("users.person.unlink")}
            variant="tertiary"
            compact
            busy={link.isPending}
            onPress={() => link.mutate(null)}
          />
        </>
      ) : (
        <PersonPicker
          label={t("users.person.link")}
          value={null}
          onChange={(p) => link.mutate(p.id)}
        />
      )}
      {link.isError ? <Message tone="error">{t(errorKey(link.error))}</Message> : null}
    </Section>
  );
}

function Access({
  user,
  isSelf,
  onChange,
}: {
  user: UserDetail;
  isSelf: boolean;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const setActive = useMutation({
    mutationFn: async (active: boolean) =>
      jsonOrThrow(
        await api.users[":userId"].active.$put({ param: { userId: user.id }, json: { active } }),
      ),
    onSuccess: async () => {
      setConfirming(false);
      await onChange();
    },
  });
  const active = user.deactivatedAt === null;
  return (
    <Section title={t("users.access.title")}>
      {active ? (
        <Body muted>{t(isSelf ? "users.access.self" : "users.access.activeHint")}</Body>
      ) : (
        <Message tone="error">
          {t("users.access.deactivatedOn", { date: shortDate(user.deactivatedAt ?? "") })}
        </Message>
      )}
      {setActive.isError ? <Message tone="error">{t(errorKey(setActive.error))}</Message> : null}
      {!active ? (
        <Button
          label={t("users.access.reactivate")}
          icon="lock-open-outline"
          busy={setActive.isPending}
          onPress={() => setActive.mutate(true)}
        />
      ) : isSelf ? null : confirming ? (
        <>
          <Message tone="error">{t("users.access.confirmText", { name: user.name })}</Message>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button
              label={t("users.access.confirm")}
              variant="destructive"
              compact
              busy={setActive.isPending}
              onPress={() => setActive.mutate(false)}
            />
            <Button
              label={t("common.cancel")}
              variant="tertiary"
              compact
              onPress={() => setConfirming(false)}
            />
          </View>
        </>
      ) : (
        <Button
          label={t("users.access.deactivate")}
          icon="lock-closed-outline"
          variant="destructive"
          onPress={() => setConfirming(true)}
        />
      )}
    </Section>
  );
}
