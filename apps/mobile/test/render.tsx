import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Renders a screen with a fresh query client (no retries, so failures show at once). */
export async function renderScreen(screen: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return {
    queryClient,
    ...(await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={queryClient}>{screen}</QueryClientProvider>
      </SafeAreaProvider>,
    )),
  };
}

/** Opens a Select or MultiSelect by its label and picks an option (a radio or a checkbox). */
export async function choose(label: string, option: string) {
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${label}: `) }));
  const name = { name: option };
  await fireEvent.press(
    screen.queryByRole("radio", name) ?? (await screen.findByRole("checkbox", name)),
  );
}
