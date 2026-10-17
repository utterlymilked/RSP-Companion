import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View } from "react-native";
import { authClient } from "../src/auth/client";
import { refreshSession } from "../src/auth/session";
import { errorKey } from "../src/errors";
import { DemoSwitch } from "../src/features/demo/DemoSwitch";
import { ServerSwitch } from "../src/features/server/ServerSwitch";
import { Button } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { LanguageSwitch } from "../src/ui/LanguageSwitch";
import { Screen } from "../src/ui/Screen";
import { Body, Message, Title } from "../src/ui/Text";
import { TextField } from "../src/ui/TextField";
import { useFieldText } from "../src/ui/useFieldText";
import { emailError, type FieldError, requiredError } from "../src/validation";

type Notice = { tone: "error" | "success"; key: string } | null;

export default function SignIn() {
  const { t } = useTranslation();
  const fieldText = useFieldText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: FieldError; password?: FieldError }>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"password" | "magic" | null>(null);

  async function run(kind: "password" | "magic", action: () => Promise<Notice>) {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice({ tone: "error", key: errorKey(error) });
    } finally {
      setBusy(null);
    }
  }

  function signInWithPassword() {
    const found = { email: emailError(email), password: requiredError(password) };
    setErrors(found);
    if (found.email || found.password) return;
    run("password", async () => {
      const { error } = await authClient.signIn.email({ email: email.trim(), password });
      if (error) return { tone: "error", key: errorKey(error) };
      await refreshSession(queryClient);
      return null;
    });
  }

  function sendMagicLink() {
    const found = { email: emailError(email) };
    setErrors(found);
    if (found.email) return;
    run("magic", async () => {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: "/",
      });
      if (error) return { tone: "error", key: errorKey(error) };
      return { tone: "success", key: "auth.magicLinkSent" };
    });
  }

  return (
    <Screen>
      <LanguageSwitch />
      <View style={styles.brand}>
        <Image source={crest} style={styles.crest} resizeMode="contain" />
        <Title>{t("common.appName")}</Title>
        <Body muted>{t("common.club")}</Body>
      </View>
      <Card style={styles.card}>
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
          autoComplete="current-password"
          onSubmitEditing={signInWithPassword}
          error={fieldText(errors.password)}
        />
        {notice ? <Message tone={notice.tone}>{t(notice.key)}</Message> : null}
        <Button
          label={t("auth.signIn")}
          onPress={signInWithPassword}
          busy={busy === "password"}
          disabled={busy !== null}
        />
        <Button
          label={t("auth.magicLink")}
          variant="secondary"
          icon="mail-outline"
          onPress={sendMagicLink}
          busy={busy === "magic"}
          disabled={busy !== null}
        />
      </Card>
      <DemoSwitch />
      <View style={styles.links}>
        <Button
          compact
          label={t("auth.forgotPassword")}
          variant="ghost"
          onPress={() => router.push("/forgot-password")}
        />
        <Button
          compact
          label={t("privacyNotice.title")}
          variant="ghost"
          onPress={() => router.push("/privacy")}
        />
      </View>
      <ServerSwitch />
    </Screen>
  );
}

const crest = require("../assets/crest.png");

const styles = StyleSheet.create({
  brand: { alignItems: "center", gap: 4, marginTop: 8, marginBottom: 8 },
  crest: { width: 110, height: 120, marginBottom: 8 },
  card: { gap: 16 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
});
