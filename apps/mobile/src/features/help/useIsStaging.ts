import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { authClient } from "../../auth/client";
import { IS_PRODUCTION_APP } from "../../variant";

/**
 * True on the staging stack (tester app, or the web app served by staging). The native apps are
 * built for one stack; the web build is shared, so there the server decides: its demo status
 * answers 404 on production (ADR 0018).
 */
export function useIsStaging(): boolean {
  const web = Platform.OS === "web";
  const status = useQuery({
    queryKey: ["demo", "status"],
    enabled: web,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const { data, error } = await authClient.$fetch<{ enabled: boolean }>("/demo/status");
      if (error || !data) throw new Error("demo mode off");
      return data.enabled;
    },
  });
  if (web) return status.data === true;
  return !IS_PRODUCTION_APP;
}
