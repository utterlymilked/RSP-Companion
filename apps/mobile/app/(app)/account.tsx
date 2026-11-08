import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "react-native";
import { api } from "../../src/api";
import { signOut, useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { DemoSwitch } from "../../src/features/demo/DemoSwitch";
import { useColors } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { Button } from "../../src/ui/Button";
import { ListGroup, ListRow } from "../../src/ui/ListGroup";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Message } from "../../src/ui/Text";
import { TESTER_TOOLS } from "../../src/variant";

export default function Account() {
  const { t } = useTranslation();
  const colors = useColors();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const [busy, setBusy] = useState(false);
  const prefs = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: async () => jsonOrThrow(await api.notifications.preferences.$get()),
  });
  const savePrefs = useMutation({
    mutationFn: async (next: { push: boolean; email: boolean }) =>
      jsonOrThrow(await api.notifications.preferences.$put({ json: next })),
    onSuccess: (data) => queryClient.setQueryData(["notifications", "preferences"], data),
  });
  const current = prefs.data?.preferences;
  const router = useRouter();
  const subjects = useQuery({
    queryKey: ["privacy", "subjects"],
    queryFn: async () => jsonOrThrow(await api.privacy.subjects.$get()),
  });
  const [deleting, setDeleting] = useState(false);
  const [eraseData, setEraseData] = useState(false);
  const deleteAccount = useMutation({
    mutationFn: async () =>
      jsonOrThrow(await api.privacy.account.delete.$post({ json: { eraseData } })),
    // The login is gone: clear the local session (the server already ended it).
    onSuccess: () => signOut(queryClient).catch(() => undefined),
  });

  return (
    <Screen>
      {me ? (
        <ListItem
          leading={<Avatar name={me.user.name} size={48} />}
          title={me.user.name}
          subtitle={t("account.signedInAs", { email: me.user.email })}
        />
      ) : null}
      {TESTER_TOOLS ? <DemoSwitch current={me?.user.email} /> : null}
      {current ? (
        <Section title={t("account.notifications")}>
          <ListGroup>
            {(["push", "email"] as const).map((channel) => (
              <ListRow
                key={channel}
                icon={channel === "push" ? "phone-portrait-outline" : "mail-outline"}
                title={t(`account.channel.${channel}`)}
                trailing={
                  <Switch
                    accessibilityLabel={t(`account.channel.${channel}`)}
                    value={current[channel]}
                    onValueChange={(on) => savePrefs.mutate({ ...current, [channel]: on })}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                }
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
      <Section title={t("account.privacy")}>
        <ListGroup>
          {(subjects.data?.subjects ?? []).map((s) => (
            <ListRow
              key={s.id}
              icon="person-outline"
              title={s.fullName}
              subtitle={t(`account.subject.${s.relation}`)}
              onPress={() =>
                router.push({ pathname: "/privacy/[personId]", params: { personId: s.id } })
              }
            />
          ))}
          <ListRow
            icon="shield-checkmark-outline"
            title={t("privacyNotice.title")}
            onPress={() => router.push("/privacy")}
          />
        </ListGroup>
      </Section>
      <Button
        label={t("auth.signOut")}
        variant="secondary"
        busy={busy}
        onPress={() => {
          setBusy(true);
          signOut(queryClient).finally(() => setBusy(false));
        }}
      />
      {deleting ? (
        <>
          <Message tone="error">{t("account.deleteWarning")}</Message>
          <ListItem
            title={t("account.deleteAlsoErase")}
            trailing={eraseData ? "✓" : undefined}
            selected={eraseData}
            onPress={() => setEraseData(!eraseData)}
          />
          {deleteAccount.isError ? (
            <Message tone="error">{t(errorKey(deleteAccount.error))}</Message>
          ) : null}
          <Button
            label={t("account.deleteConfirm")}
            busy={deleteAccount.isPending}
            onPress={() => deleteAccount.mutate()}
          />
          <Button
            label={t("common.cancel")}
            variant="secondary"
            onPress={() => setDeleting(false)}
          />
        </>
      ) : (
        <Button
          label={t("account.delete")}
          variant="destructive"
          onPress={() => setDeleting(true)}
        />
      )}
    </Screen>
  );
}
