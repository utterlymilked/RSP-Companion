import { z } from "zod";

/**
 * Forced updates (ADR 0028). Native clients say what they run in request headers; the server
 * publishes the minimum it accepts at GET /api/app/requirements and refuses older clients with
 * 426 `app_update_required`. Both sides use `judgeClient`, so they always agree.
 */
export const APP_HEADERS = {
  /** `android`, `ios` or `web`. */
  platform: "x-app-platform",
  /** The native runtime version (`expo-updates`), a whole number as text. */
  runtime: "x-app-runtime",
  /** When the JavaScript bundle that is running was built (ISO 8601). */
  builtAt: "x-app-built-at",
  /** Id of the over-the-air update that is running, or `embedded` for the APK's own bundle. */
  update: "x-app-update",
} as const;

export const appRequirementsSchema = z.object({
  /** False: nothing is enforced and clients never block (local development). */
  enforced: z.boolean(),
  /** Oldest native runtime accepted; older installs need a new APK. */
  minRuntime: z.string().nullable(),
  /** Oldest JavaScript bundle accepted (ISO 8601); older installs must apply the update. */
  minBuiltAt: z.string().nullable(),
  /** Where to download the APK when a new one is needed. */
  downloadUrl: z.string().nullable(),
  /** The bundle this server offers over the air, if it offers one. */
  served: z.object({ runtime: z.string(), builtAt: z.string() }).nullable(),
});
export type AppRequirements = z.infer<typeof appRequirementsSchema>;

export interface ClientVersion {
  platform: string | null;
  runtime: string | null;
  builtAt: string | null;
}

/** What the client must do: nothing, install a new APK, or apply the latest over-the-air update. */
export type UpdateVerdict = "ok" | "apk" | "bundle";

const wholeNumber = (value: string) => (/^\d+$/.test(value) ? Number(value) : Number.NaN);

/** Compares a client with the requirements. The web app is never blocked: it reloads itself. */
export function judgeClient(req: AppRequirements, client: ClientVersion): UpdateVerdict {
  if (!req.enforced || client.platform === "web") return "ok";
  if (client.platform !== "android" && client.platform !== "ios") return "apk"; // unknown or pre-update app
  if (!client.runtime) return "apk";
  if (req.minRuntime && !(wholeNumber(client.runtime) >= wholeNumber(req.minRuntime))) return "apk";
  if (req.minBuiltAt) {
    const builtAt = client.builtAt ? Date.parse(client.builtAt) : Number.NaN;
    if (!(builtAt >= Date.parse(req.minBuiltAt))) return "bundle";
  }
  return "ok";
}
