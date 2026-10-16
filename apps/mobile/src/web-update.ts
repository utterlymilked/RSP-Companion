import { useEffect } from "react";
import { API_ORIGIN, isWeb } from "./auth/client";

/** The release this bundle was built from (sha-xxxxxxx), inlined by the image build. */
const BUILT_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? "dev";
const CHECK_EVERY_MS = 60_000;
const RELOADED_FOR = "rsc:reloaded-for";

/** True when the server runs a different release than this bundle; local builds never reload. */
export function isNewRelease(built: string, served: string | undefined): boolean {
  return !!served && built !== "dev" && served !== "dev" && served !== built;
}

/**
 * Web: a tab left open keeps running the old bundle after a deploy. When the tab comes back
 * into view, ask /api/health which release is live and reload if it changed, so a fix reaches
 * everyone without a hard refresh. Native apps update through the stores.
 */
export function useReloadOnNewRelease(built = BUILT_VERSION) {
  useEffect(() => {
    if (!isWeb || built === "dev" || typeof document === "undefined") return;
    let lastCheck = Date.now();

    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      try {
        const res = await fetch(`${API_ORIGIN}/api/health`, { cache: "no-store" });
        const { version } = (await res.json()) as { version?: string };
        if (!isNewRelease(built, version)) return;
        // Reload once per release, so a stale page cache cannot cause a reload loop.
        if (sessionStorage.getItem(RELOADED_FOR) === version) return;
        sessionStorage.setItem(RELOADED_FOR, version ?? "");
        window.location.reload();
      } catch {
        // Offline or mid-deploy: try again next time the tab is shown.
      }
    };

    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [built]);
}
