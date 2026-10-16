import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Events from "../app/(app)/events";
import NewEvent from "../app/event/new";
import { api } from "../src/api";
import { renderScreen } from "./render";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
    facilities: { $get: jest.fn() },
    teams: { $get: jest.fn() },
    events: { $get: jest.fn(), $post: jest.fn() },
  },
}));

const TEAM = "33333333-3333-4333-8333-333333333333";
const events = jest.mocked(api.events);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const staff = {
  permissions: ["events.read", "events.write"],
  roles: [{ role: "staff", teamId: null, classId: null }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(staff);
  jest
    .mocked(api.facilities)
    .$get.mockResolvedValue(ok({ spaces: [], departments: [], venues: [] }));
  jest.mocked(api.teams).$get.mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
});

it("lists the week's events in Lisbon time and opens one", async () => {
  events.$get.mockResolvedValue(
    ok({
      events: [
        {
          id: "e1",
          kind: "match",
          status: "scheduled",
          title: null,
          startsAt: "2026-11-14T10:00:00.000Z",
          endsAt: "2026-11-14T11:30:00.000Z",
          teamName: "Sub-13",
          opponent: "Clube X",
          spaceName: "Campo 1",
        },
        {
          id: "e2",
          kind: "training",
          status: "cancelled",
          title: null,
          startsAt: "2026-11-15T18:00:00.000Z",
          endsAt: "2026-11-15T19:00:00.000Z",
          teamName: "Sub-13",
          opponent: null,
        },
      ],
    }),
  );
  await renderScreen(<Events />);
  await fireEvent.press(await screen.findByText(/10:00–11:30 Jogo · Clube X/));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/event/[eventId]",
    params: { eventId: "e1" },
  });
  expect(screen.getByText("Sub-13 · Cancelado")).toBeTruthy();
});

it("filters by team and hides the new button from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["events.read"], roles: [] });
  events.$get.mockResolvedValue(ok({ events: [] }));
  await renderScreen(<Events />);
  expect(await screen.findByText("Sem eventos nesta semana.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo evento" })).toBeNull();
  await fireEvent.press(await screen.findByRole("radio", { name: "Sub-13" }));
  await waitFor(() =>
    expect(events.$get).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ teamId: TEAM }),
    }),
  );
});

it("asks for the opponent before sending a match", async () => {
  await renderScreen(<NewEvent />);
  await fireEvent.press(await screen.findByRole("radio", { name: "Jogo" }));
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "10:00");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "11:30");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Indique o adversário.")).toBeTruthy();
  expect(events.$post).not.toHaveBeenCalled();
});

it("sends a match with Lisbon times converted to UTC", async () => {
  events.$post.mockResolvedValue(ok({ events: [{ id: "e9" }] }));
  await renderScreen(<NewEvent />);
  await fireEvent.press(await screen.findByRole("radio", { name: "Jogo" }));
  await fireEvent.changeText(screen.getByLabelText("Data (AAAA-MM-DD)"), "2026-11-14");
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "10:00");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "11:30");
  await fireEvent.changeText(screen.getByLabelText("Adversário"), "Clube X");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(events.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        kind: "match",
        startsAt: new Date("2026-11-14T10:00:00Z"),
        match: expect.objectContaining({ opponent: "Clube X", homeAway: "home" }),
      }),
    }),
  );
});

it("asks a coach for a team and explains that spaces are requests", async () => {
  mockMe.mockReturnValue({
    permissions: ["events.read", "events.write"],
    roles: [{ role: "coach", teamId: TEAM, classId: null }],
  });
  await renderScreen(<NewEvent />);
  expect(await screen.findByText(/fica "a confirmar"/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "18:00");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "19:00");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Escolha a equipa do evento.")).toBeTruthy();
  expect(events.$post).not.toHaveBeenCalled();
});
