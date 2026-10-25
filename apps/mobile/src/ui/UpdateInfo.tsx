import * as Updates from "expo-updates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { checkForUpdate, downloadAndReload, lastCheck } from "../features/updates/apply";
import { ListRow } from "./ListGroup";

type State = "idle" | "checking" | "none" | "failed";

/**
 * Which JavaScript this install runs (the one baked into the APK or an over-the-air update) and
 * a manual check for a newer one, so a stale install is visible instead of silent. Native only.
 */
export function UpdateInfo() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>("idle");
  if (!Updates.isEnabled) return null;

  const source = Updates.isEmbeddedLaunch ? t("updates.embedded") : t("updates.ota");
  const id = Updates.updateId ? Updates.updateId.slice(0, 8) : "-";
  const detail = state === "failed" && lastCheck.error ? ` (${lastCheck.error})` : "";
  const status = state === "idle" ? "" : ` · ${t(`updates.${state}`)}${detail}`;

  const check = async () => {
    setState("checking");
    const outcome = await checkForUpdate(15_000);
    if (outcome === "none") return setState("none");
    if (outcome !== "available") return setState("failed");
    await downloadAndReload(); // restarts the app on success
    setState("failed");
  };

  return (
    <ListRow
      icon="cloud-download-outline"
      title={t("updates.title")}
      subtitle={`${source} · ${id} · runtime ${Updates.runtimeVersion ?? "-"}${status}`}
      onPress={check}
    />
  );
}
