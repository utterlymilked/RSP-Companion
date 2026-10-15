import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

/** Renders a screen with a fresh query client (no retries, so failures show at once). */
export async function renderScreen(screen: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return {
    queryClient,
    ...(await render(<QueryClientProvider client={queryClient}>{screen}</QueryClientProvider>)),
  };
}
