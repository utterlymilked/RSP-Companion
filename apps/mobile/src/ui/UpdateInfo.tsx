import * as Updates from "expo-updates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const status = state === "idle" ? "" : ` · ${t(`updates.${state}`)}`;

  const check = async () => {
    setState("checking");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return setState("none");
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setState("failed");
    }
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
