import * as Updates from "expo-updates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { API_ORIGIN, isWeb } from "../../auth/client";
import { parseServerUrl } from "../../config";
import { saveServer } from "../../server";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Body, Message } from "../../ui/Text";
import { TextField } from "../../ui/TextField";

/**
 * Lets testers point a native build at another stack (staging or prod) before signing in.
 * Closed by default; the web app is served by its own stack, so it never shows this.
 */
export function ServerSwitch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(API_ORIGIN);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  if (isWeb) return null;

  async function apply(origin: string | null) {
    await saveServer(origin);
    setSaved(true);
    try {
      await Updates.reloadAsync(); // the address is read once at startup
    } catch {
      // Not available in development builds: the message below asks to reopen the app.
    }
  }

  function save() {
    const origin = parseServerUrl(value);
    setError(origin === null);
    if (origin) apply(origin);
  }

  if (!open) {
    return (
      <View style={styles.link}>
        <Button
          compact
          variant="ghost"
          label={t("server.change", { host: new URL(API_ORIGIN).host })}
          onPress={() => setOpen(true)}
        />
      </View>
    );
  }
  return (
    <Card style={styles.card}>
      <Body muted>{t("server.hint")}</Body>
      <TextField
        label={t("server.address")}
        value={value}
        onChangeText={setValue}
        keyboardType="url"
        error={error ? t("server.invalid") : null}
      />
      {saved ? <Message tone="success">{t("server.saved")}</Message> : null}
      <Button label={t("server.save")} onPress={save} disabled={saved} />
      <Button
        label={t("server.reset")}
        variant="secondary"
        onPress={() => apply(null)}
        disabled={saved}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { alignItems: "center" },
  card: { gap: 16 },
});
