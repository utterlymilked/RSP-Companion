import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Home from "../app/(app)/index";
import { api } from "../src/api";
import { saveCsv } from "../src/features/dashboard/download";
import { renderScreen } from "./render";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
jest.mock("../src/auth/session", () => ({
  useMe: () => ({
    data: { user: { name: "Ana" }, roles: [{ role: "admin" }], permissions: ["fees.read"] },
  }),
}));
jest.mock("../src/features/callups/MyCallUps", () => ({ MyCallUps: () => null }));
jest.mock("../src/features/dashboard/download", () => ({ saveCsv: jest.fn(async () => {}) }));
jest.mock("../src/api", () => ({
  api: {
    dashboard: {
      $get: jest.fn(),
      export: { "overdue-fees.csv": { $get: jest.fn() } },
    },
  },
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("home dashboard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the widgets the API returns and exports a CSV", async () => {
    (api.dashboard.$get as jest.Mock).mockResolvedValue(
      ok({
        widgets: {
          overdueFees: { people: 2, balanceCents: 4500 },
          openIncidents: { count: 3 },
        },
      }),
    );
    (api.dashboard.export["overdue-fees.csv"].$get as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => "person,balance\r\n",
    });
    await renderScreen(<Home />);
    expect(await screen.findByText("45,00 €")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("Artigos com stock baixo")).toBeNull();
    fireEvent.press(screen.getByText("Quotas em atraso"));
    expect(mockPush).toHaveBeenCalledWith("/fees");
    fireEvent.press(screen.getByText("Exportar quotas em atraso"));
    await waitFor(() =>
      expect(saveCsv).toHaveBeenCalledWith("overdue-fees.csv", "person,balance\r\n"),
    );
  });
});
