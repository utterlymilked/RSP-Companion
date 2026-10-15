import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../src/auth/client";
import { errorKey } from "../src/errors";
import { Button } from "../src/ui/Button";
import { Screen } from "../src/ui/Screen";
import { Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";
import { useFieldText } from "../src/ui/useFieldText";
import { confirmError, type FieldError, newPasswordError } from "../src/validation";

/** Opened from the reset email: /reset-password?token=… (or ?error=INVALID_TOKEN). */
export default function ResetPassword() {
  const { t } = useTranslation();
  const fieldText = useFieldText();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: FieldError; confirm?: FieldError }>({});
  const [notice, setNotice] = useState<{ tone: "error" | "success"; key: string } | null>(
    params.error ? { tone: "error", key: "errors.invalid_token" } : null,
  );
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!params.token) return;
    const found = {
      password: newPasswordError(password),
      confirm: confirmError(password, confirm),
    };
    setErrors(found);
    if (found.password || found.confirm) return;
    setBusy(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: params.token,
      });
      if (error) {
        setNotice({ tone: "error", key: errorKey(error) });
      } else {
        setDone(true);
        setNotice({ tone: "success", key: "auth.passwordChanged" });
      }
    } catch (e) {
      setNotice({ tone: "error", key: errorKey(e) });
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!params.token && !params.error && !done;
  return (
    <Screen>
      <Title>{t("auth.resetTitle")}</Title>
      {!params.token && !params.error ? (
        <Message tone="error">{t("auth.missingToken")}</Message>
      ) : null}
      {canSubmit ? (
        <>
          <TextField
            label={t("auth.newPassword")}
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
        </>
      ) : null}
      {notice ? <Message tone={notice.tone}>{t(notice.key)}</Message> : null}
      {canSubmit ? <Button label={t("auth.setPassword")} onPress={submit} busy={busy} /> : null}
      <Button
        label={t("auth.backToSignIn")}
        variant={canSubmit ? "secondary" : "primary"}
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
