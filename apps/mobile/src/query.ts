import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import { ApiRequestError } from "./errors";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Client errors (403, 404, …) will not fix themselves; network and 5xx might.
        retry: (count, error) =>
          !(error instanceof ApiRequestError && error.status < 500) && count < 2,
      },
    },
  });
}

/**
 * Native only (the browser already reports these): pause queries while offline and refetch
 * stale data when the connection or the app comes back.
 */
export function connectQueriesToDevice(): void {
  if (Platform.OS === "web") return;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (status) =>
      setFocused(status === "active"),
    );
    return () => subscription.remove();
  });
}
