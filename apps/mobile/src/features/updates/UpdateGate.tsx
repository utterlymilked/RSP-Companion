import type { AppRequirements } from "@rsc/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRequiredUpdate } from "../../app-client";
import { radius, spacing, useColors } from "../../theme";
import { Button } from "../../ui/Button";
import { Centered } from "../../ui/Centered";
import { Body, Message, Title } from "../../ui/Text";
import { canUpdate, checkForUpdate, downloadAndReload, refreshRequirements } from "./apply";

const RECHECK_AFTER_MS = 60_000;

/**
 * Keeps the installed app current (ADR 0028). At launch it applies a newer over-the-air bundle
 * straight away instead of waiting for the next start; when the app returns to the foreground it
 * offers one; and when the server's minimum is above this install it replaces the app with a
 * blocking screen (the update, or a new APK) until the install is current.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const required = useRequiredUpdate();
  const [launching, setLaunching] = useState(canUpdate());
  const [updating, setUpdating] = useState(false);
  const [newer, setNewer] = useState(false);
  const [requirements, setRequirements] = useState<AppRequirements | null>(null);

  useEffect(() => {
    if (!canUpdate()) return;
    let live = true;
    (async () => {
      if ((await checkForUpdate()) === "available") {
        setUpdating(true);
        await downloadAndReload(); // restarts the app on success
        if (live) setUpdating(false);
      }
      const found = await refreshRequirements();
      if (live) {
        setRequirements(found);
        setLaunching(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const lastCheck = useRef(Date.now());
  useEffect(() => {
    if (!canUpdate()) return;
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || Date.now() - lastCheck.current < RECHECK_AFTER_MS) return;
      lastCheck.current = Date.now();
      setRequirements((await refreshRequirements()) ?? requirements);
      if ((await checkForUpdate()) === "available") setNewer(true);
    });
    return () => sub.remove();
  }, [requirements]);

  if (launching) {
    return <Centered>{updating ? <Body>{t("updates.applying")}</Body> : null}</Centered>;
  }
  if (required === "apk") {
    return (
      <NewApk
        url={requirements?.downloadUrl ?? null}
        onRecheck={async () => setRequirements(await refreshRequirements())}
      />
    );
  }
  if (required === "bundle") return <ApplyBundle />;
  return (
    <>
      {children}
      {newer ? <NewerBanner /> : null}
    </>
  );
}

/** Blocking: this install is below the server's minimum JavaScript; fetch and restart into it. */
function ApplyBundle() {
  const { t } = useTranslation();
  const [state, setState] = useState<"busy" | "none" | "failed">("busy");
  const run = useCallback(async () => {
    setState("busy");
    const found = await checkForUpdate(10_000);
    if (found !== "available") return setState(found === "none" ? "none" : "failed");
    setState(await downloadAndReload());
  }, []);
  useEffect(() => {
    void run();
  }, [run]);
  return (
    <Centered>
      <Title>{t("updates.requiredTitle")}</Title>
      {state === "busy" ? (
        <Body muted>{t("updates.applying")}</Body>
      ) : (
        <>
          <Message tone="error">
            {t(state === "none" ? "updates.notYet" : "updates.failedApply")}
          </Message>
          <Button label={t("common.retry")} onPress={run} />
        </>
      )}
    </Centered>
  );
}

/** Blocking: the native part is too old, so only a new APK helps. */
function NewApk({ url, onRecheck }: { url: string | null; onRecheck: () => void }) {
  const { t } = useTranslation();
  return (
    <Centered>
      <Title>{t("updates.requiredTitle")}</Title>
      <Body>{t("updates.apkBody")}</Body>
      {url ? (
        <Button
          label={t("updates.download")}
          icon="download-outline"
          onPress={() => Linking.openURL(url)}
        />
      ) : null}
      <Button label={t("updates.recheck")} variant="tertiary" onPress={onRecheck} />
    </Centered>
  );
}

/** Not blocking: a newer bundle was found while the app was open. */
function NewerBanner() {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          top: insets.top + spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.bannerText}>
        <Body>{t("updates.newer")}</Body>
      </View>
      <Button
        compact
        busy={busy}
        label={t("updates.update")}
        onPress={async () => {
          setBusy(true);
          await downloadAndReload();
          setBusy(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1000,
    elevation: 8,
  },
  bannerText: { flex: 1 },
});
