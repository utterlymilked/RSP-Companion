import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Switch, View } from "react-native";
import { api } from "../src/api";
import { type Challenge, solveChallenge } from "../src/auth/altcha";
import { authClient } from "../src/auth/client";
import { errorKey, jsonOrThrow } from "../src/errors";
import { useRegistrationConfig } from "../src/features/registration/useRegistrationConfig";
import { spacing } from "../src/theme";
import { Button } from "../src/ui/Button";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";
import { useFieldText } from "../src/ui/useFieldText";
import {
  confirmError,
  emailError,
  type FieldError,
  newPasswordError,
  requiredError,
} from "../src/validation";

type Errors = {
  name?: FieldError;
  email?: FieldError;
  password?: FieldError;
  confirm?: FieldError;
  key?: FieldError;
};

/**
 * Self-registration (prod flag, ADR 0026): name, email, password, the privacy notice, a
 * proof of work solved on the device and, on staging, the tester key. The answer is the same
 * for new and existing addresses; the account only works after the emailed link is opened.
 */
export default function SignUp() {
  const { t } = useTranslation();
  const router = useRouter();
  const fieldText = useFieldText();
  const config = useRegistrationConfig();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [key, setKey] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function submit() {
    if (sending.current) return;
    const found: Errors = {
      name: requiredError(name),
      email: emailError(email),
      password: newPasswordError(password),
      confirm: confirmError(password, confirm),
      key: config.data?.keyRequired ? requiredError(key) : null,
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (!accepted) {
      setNotice("auth.signUp.noticeRequired");
      return;
    }
    sending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const challenge = (await jsonOrThrow(await api.registration.challenge.$get())) as Challenge;
      const { error } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        callbackURL: "/",
        fetchOptions: {
          headers: {
            "x-altcha": solveChallenge(challenge),
            ...(config.data?.keyRequired ? { "x-registration-key": key.trim() } : {}),
          },
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setNotice(errorKey(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (config.isLoading) return <Screen>{null}</Screen>;

  if (!config.data?.open) {
    return (
      <Screen>
        <Title>{t("auth.signUp.title")}</Title>
        <Message tone="error">{t("errors.registration_closed")}</Message>
        <Button
          label={t("auth.signIn")}
          variant="secondary"
          onPress={() => router.replace("/sign-in")}
        />
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen>
        <Title>{t("auth.signUp.sentTitle")}</Title>
        <Message tone="success">{t("auth.signUp.sent")}</Message>
        <Button
          label={t("auth.signIn")}
          variant="secondary"
          onPress={() => router.replace("/sign-in")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t("auth.signUp.title")}</Title>
      <Body muted>{t("auth.signUp.hint")}</Body>
      {config.data.paused ? (
        <Message tone="error">{t("errors.registration_paused")}</Message>
      ) : null}
      <TextField
        label={t("auth.name")}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        error={fieldText(errors.name)}
      />
      <TextField
        label={t("auth.email")}
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
        error={fieldText(errors.email)}
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
        error={fieldText(errors.confirm)}
      />
      {config.data.keyRequired ? (
        <TextField
          label={t("auth.signUp.key")}
          value={key}
          onChangeText={setKey}
          autoCapitalize="none"
          error={fieldText(errors.key)}
        />
      ) : null}
      <View style={styles.notice}>
        <Switch
          value={accepted}
          onValueChange={setAccepted}
          accessibilityLabel={t("auth.signUp.acceptNotice")}
        />
        <View style={styles.noticeText}>
          <Body>{t("auth.signUp.acceptNotice")}</Body>
          <Button
            compact
            label={t("privacyNotice.title")}
            variant="ghost"
            onPress={() => router.push("/privacy")}
          />
        </View>
      </View>
      {notice ? <Message tone="error">{t(notice)}</Message> : null}
      <Button
        label={t("auth.signUp.submit")}
        onPress={submit}
        busy={busy}
        disabled={config.data.paused}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  noticeText: { flex: 1 },
});
