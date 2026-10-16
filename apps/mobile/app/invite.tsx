import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../src/api";
import { authClient } from "../src/auth/client";
import { refreshSession, useMe } from "../src/auth/session";
import { errorKey, jsonOrThrow } from "../src/errors";
import { Button } from "../src/ui/Button";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";
import { useFieldText } from "../src/ui/useFieldText";
import { confirmError, type FieldError, newPasswordError, requiredError } from "../src/validation";

type Errors = { name?: FieldError; password?: FieldError; confirm?: FieldError };

/**
 * Opened from the invitation email: /invite?token=…. Creates the account and signs in. The
 * request is sent once per press (a second press while it runs is ignored); if the account was
 * created but signing in failed, pressing again is safe because the server answers a retry
 * with the same password by returning that account.
 */
export default function Invite() {
  const { t } = useTranslation();
  const fieldText = useFieldText();
  const queryClient = useQueryClient();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const me = useMe();

  async function submit() {
    if (!token || sending.current) return;
    const found: Errors = {
      name: requiredError(name),
      password: newPasswordError(password),
      confirm: confirmError(password, confirm),
    };
    setErrors(found);
    if (found.name || found.password || found.confirm) return;
    sending.current = true;
    setBusy(true);
    setNotice(null);
    let created = false;
    try {
      const res = await api.invitations.accept.$post({
        json: { token, name: name.trim(), password },
      });
      const { email } = (await jsonOrThrow(res)) as { email: string };
      created = true;
      const { error } = await authClient.signIn.email({ email, password });
      if (error) throw error;
      // The signed-in app screens appear once /api/me answers; the redirect below follows.
      await refreshSession(queryClient);
    } catch (e) {
      setNotice(created ? "auth.inviteCreatedSignInFailed" : errorKey(e));
      sending.current = false;
      setBusy(false);
    }
  }

  if (me.data) return <Redirect href="/" />;

  return (
    <Screen>
      <Title>{t("auth.inviteTitle")}</Title>
      {token ? (
        <>
          <Body muted>{t("auth.inviteHint")}</Body>
          <TextField
            label={t("auth.name")}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            error={fieldText(errors.name)}
          />
          <TextField
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            error={fieldText(errors.password)}
          />
          <TextField
            label={t("auth.confirmPassword")}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={submit}
            error={fieldText(errors.confirm)}
          />
          {notice ? <Message tone="error">{t(notice)}</Message> : null}
          <Button label={t("auth.createAccount")} onPress={submit} busy={busy} />
        </>
      ) : (
        <Message tone="error">{t("auth.missingToken")}</Message>
      )}
    </Screen>
  );
}
