import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";

/** What the sign-up screen needs to know before anyone is signed in (ADR 0026). */
export function useRegistrationConfig() {
  return useQuery({
    queryKey: ["registration-config"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () =>
      jsonOrThrow(await api.registration.config.$get()) as Promise<{
        open: boolean;
        keyRequired: boolean;
        paused: boolean;
      }>,
  });
}
