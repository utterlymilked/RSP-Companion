import type { MeResponse } from "@rsp/shared";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { api } from "../api";
import { jsonOrThrow } from "../errors";
import { authClient } from "./client";

export const meQueryKey = ["me"] as const;

/** The signed-in user with roles and permissions, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<MeResponse | null> => {
      const res = await api.me.$get();
      if (res.status === 401) return null;
      return (await jsonOrThrow(res)) as MeResponse;
    },
    staleTime: 5 * 60_000,
  });
}

/** Re-reads /api/me after signing in, which switches the app to the signed-in screens. */
export const refreshSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: meQueryKey });

/** Signs out and drops every cached response, so nothing of this user stays on the device. */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] });
    queryClient.setQueryData(meQueryKey, null);
  }
}

/**
 * Where an emailed link should land in this app: a path on the web origin, or the app's
 * scheme on native (`rsp:///reset-password`, `exp://…/--/reset-password` in Expo Go).
 */
export function appLink(path: string, webOrigin: string | undefined): string {
  return webOrigin ? new URL(path, webOrigin).toString() : Linking.createURL(path);
}
