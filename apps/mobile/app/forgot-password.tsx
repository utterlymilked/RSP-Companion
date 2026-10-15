import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient, isWeb } from "../src/auth/client";
import { appLink } from "../src/auth/session";
import { errorKey } from "../src/errors";
import { Button } from "../src/ui/Button";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";
import { useFieldText } from "../src/ui/useFieldText";
import { emailError, type FieldError } from "../src/validation";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const fieldText = useFieldText();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<FieldError>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const found = emailError(email);
    setError(found);
    if (found) return;
    setBusy(true);
    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: appLink("/reset-password", isWeb ? window.location.origin : undefined),
      });
      // Same answer whether or not the email has an account (no account enumeration).
      setNotice(
        apiError
          ? { tone: "error", key: errorKey(apiError) }
          : { tone: "success", key: "auth.resetLinkSent" },
      );
    } catch (e) {
      setNotice({ tone: "error", key: errorKey(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{t("auth.resetRequestTitle")}</Title>
      <Body muted>{t("auth.resetRequestHint")}</Body>
      <TextField
        label={t("auth.email")}
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
        onSubmitEditing={submit}
        error={fieldText(error)}
      />
      {notice ? <Message tone={notice.tone}>{t(notice.key)}</Message> : null}
      <Button label={t("auth.sendResetLink")} onPress={submit} busy={busy} />
      <Button
        label={t("auth.backToSignIn")}
        variant="secondary"
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
