import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Switch, View } from "react-native";
import { api } from "../../src/api";
import { signOut, useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { useColors } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { Button } from "../../src/ui/Button";
import { LanguageSwitch } from "../../src/ui/LanguageSwitch";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

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
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Body>{t("account.language")}</Body>
        <LanguageSwitch />
      </View>
      {current ? (
        <>
          <Body muted>{t("account.notifications")}</Body>
          {(["push", "email"] as const).map((channel) => (
            <View
              key={channel}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Body>{t(`account.channel.${channel}`)}</Body>
              <Switch
                accessibilityLabel={t(`account.channel.${channel}`)}
                value={current[channel]}
                onValueChange={(on) => savePrefs.mutate({ ...current, [channel]: on })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          ))}
        </>
      ) : null}
      <Body muted>{t("account.privacy")}</Body>
      {(subjects.data?.subjects ?? []).map((s) => (
        <ListItem
          key={s.id}
          title={s.fullName}
          subtitle={t(`account.subject.${s.relation}`)}
          onPress={() =>
            router.push({ pathname: "/privacy/[personId]", params: { personId: s.id } })
          }
        />
      ))}
      <ListItem title={t("privacyNotice.title")} onPress={() => router.push("/privacy")} />
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
        <Button label={t("account.delete")} variant="danger" onPress={() => setDeleting(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
  },
});
