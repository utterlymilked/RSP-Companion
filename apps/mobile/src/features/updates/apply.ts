import { APP_HEADERS, type AppRequirements, appRequirementsSchema, judgeClient } from "@rsc/shared";
import * as Updates from "expo-updates";
import { clientHeaders, setRequiredUpdate } from "../../app-client";
import { API_ORIGIN } from "../../auth/client";

/** Native only: web has no over-the-air updates and reloads itself (web-update.ts). */
export const canUpdate = () => Updates.isEnabled;

export type UpdateOutcome = "available" | "none" | "failed" | "timeout";

/** The last check and its outcome, so Definições can say why a phone is not current. */
export const lastCheck: { at: Date | null; outcome: UpdateOutcome | null; error: string } = {
  at: null,
  outcome: null,
  error: "",
};

const record = (outcome: UpdateOutcome, error = "") => {
  lastCheck.at = new Date();
  lastCheck.outcome = outcome;
  lastCheck.error = error;
  return outcome;
};

/** The promise's result, or "timeout" after `ms`; the timer never outlives the promise. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the server whether a newer bundle exists; gives up after `ms` so launch is never held up. */
export async function checkForUpdate(ms = 4000): Promise<UpdateOutcome> {
  try {
    const result = await within(Updates.checkForUpdateAsync(), ms);
    if (result === "timeout") return record("timeout");
    return record(result.isAvailable ? "available" : "none");
  } catch (error) {
    return record("failed", error instanceof Error ? error.message : String(error));
  }
}

/** Downloads the newest bundle and restarts into it. Resolves only if that did not happen. */
export async function downloadAndReload(): Promise<"failed" | "none"> {
  try {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) return "none";
    await Updates.reloadAsync();
    return "failed"; // reloadAsync does not return on success
  } catch (error) {
    record("failed", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}

/** The server's minimum, or null when it cannot be reached. */
export async function fetchRequirements(ms = 5000): Promise<AppRequirements | null> {
  try {
    const res = await within(
      fetch(`${API_ORIGIN}/api/app/requirements`, { headers: clientHeaders(), cache: "no-store" }),
      ms,
    );
    if (res === "timeout" || !res.ok) return null;
    return appRequirementsSchema.parse(await res.json());
  } catch {
    return null;
  }
}

/** Compares this install with the server's minimum and raises or clears the blocking screen. */
export async function refreshRequirements(): Promise<AppRequirements | null> {
  const requirements = await fetchRequirements();
  if (!requirements) return null;
  const headers = clientHeaders();
  const verdict = judgeClient(requirements, {
    platform: headers[APP_HEADERS.platform] ?? null,
    runtime: headers[APP_HEADERS.runtime] ?? null,
    builtAt: headers[APP_HEADERS.builtAt] ?? null,
  });
  setRequiredUpdate(verdict === "ok" ? null : verdict);
  return requirements;
}
