import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Incidents from "../app/(app)/incidents";
import IncidentDetail from "../app/incident/[incidentId]";
import NewIncident from "../app/incident/new";
import { api } from "../src/api";
import { newClientKey } from "../src/features/incidents/draft";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ incidentId: "i1" }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
const mockMe = jest.fn();
jest.mock("../src/auth/session", () => ({ useMe: () => ({ data: mockMe() }) }));
jest.mock("../src/api", () => ({
  api: {
    teams: { $get: jest.fn() },
    incidents: {
      $get: jest.fn(),
      $post: jest.fn(),
      ":incidentId": { $get: jest.fn(), $patch: jest.fn() },
    },
  },
}));

const TEAM = "33333333-3333-4333-8333-333333333333";
const incidents = jest.mocked(api.incidents);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const staff = {
  permissions: ["incidents.read", "incidents.write", "incidents.manage"],
  roles: [{ role: "staff", teamId: null, classId: null }],
};
const row = (extra: Record<string, unknown> = {}) => ({
  id: "i1",
  type: "injury",
  status: "open",
  occurredAt: "2026-10-20T17:30:00.000Z",
  place: "Campo 1",
  teamId: null,
  view: "full",
  description: "Caiu no treino.",
  followUp: null,
  people: [],
  peopleCount: 0,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(staff);
  jest.mocked(api.teams).$get.mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
});

it("makes a v4 uuid", () => {
  expect(newClientKey()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

it("lists incidents in Lisbon time, filters and opens one", async () => {
  incidents.$get.mockResolvedValue(ok({ incidents: [row()] }));
  await renderScreen(<Incidents />);
  await fireEvent.press(await screen.findByText(/18:30 · Lesão/));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/incident/[incidentId]",
    params: { incidentId: "i1" },
  });
  await fireEvent.press(screen.getByRole("radio", { name: "Fechada" }));
  await waitFor(() =>
    expect(incidents.$get).toHaveBeenLastCalledWith({ query: { status: "closed" } }),
  );
});

it("hides the new button from readers and shows an empty log", async () => {
  mockMe.mockReturnValue({ permissions: ["incidents.read"], roles: [] });
  incidents.$get.mockResolvedValue(ok({ incidents: [] }));
  await renderScreen(<Incidents />);
  expect(await screen.findByText("Sem ocorrências.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Nova ocorrência" })).toBeNull();
});

it("checks the form, then sends the report with one idempotency key", async () => {
  incidents.$post.mockResolvedValue(ok({ incident: row() }));
  await renderScreen(<NewIncident />);
  await fireEvent.press(await screen.findByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Verifique a data e a hora.")).toBeTruthy();
  expect(incidents.$post).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText("Data"), "2026-10-20");
  await fireEvent.changeText(screen.getByLabelText("Hora"), "18:30");
  await fireEvent.changeText(screen.getByLabelText("Descrição"), "Discussão.");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(incidents.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        occurredAt: new Date("2026-10-20T17:30:00Z"),
        description: "Discussão.",
        clientKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    }),
  );
});

it("asks a coach for a team", async () => {
  mockMe.mockReturnValue({
    permissions: ["incidents.read", "incidents.write"],
    roles: [{ role: "coach", teamId: TEAM, classId: null }],
  });
  await renderScreen(<NewIncident />);
  await fireEvent.changeText(await screen.findByLabelText("Hora"), "18:30");
  await fireEvent.changeText(screen.getByLabelText("Descrição"), "Discussão.");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Escolha a equipa.")).toBeTruthy();
  expect(incidents.$post).not.toHaveBeenCalled();
});

it("shows a restricted summary for an injury without text", async () => {
  incidents[":incidentId"].$get.mockResolvedValue(
    ok({ incident: row({ view: "summary", description: null }) }),
  );
  await renderScreen(<IncidentDetail />);
  expect(await screen.findByText(/só são visíveis para a equipa clínica/)).toBeTruthy();
  expect(screen.queryByText("Caiu no treino.")).toBeNull();
});

it("lets the office change the status of an incident", async () => {
  incidents[":incidentId"].$get.mockResolvedValue(
    ok({
      incident: row({
        type: "discipline",
        people: [{ personId: "p1", fullName: "Pessoa Teste", role: "involved" }],
      }),
    }),
  );
  incidents[":incidentId"].$patch.mockResolvedValue(ok({ incident: row() }));
  await renderScreen(<IncidentDetail />);
  expect(await screen.findByText("Pessoa Teste")).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Fechada" }));
  await waitFor(() =>
    expect(incidents[":incidentId"].$patch).toHaveBeenCalledWith({
      param: { incidentId: "i1" },
      json: { status: "closed" },
    }),
  );
});
