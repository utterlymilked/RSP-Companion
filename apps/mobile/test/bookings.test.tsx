import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Bookings from "../app/(app)/bookings";
import NewBooking from "../app/booking/new";
import { api } from "../src/api";
import { addDays, mondayOf } from "../src/features/bookings/time";
import { choose, renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => mockParams(),
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
    bookings: { $get: jest.fn(), $post: jest.fn() },
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const CAMPO2 = "11111111-1111-4111-8111-111111111112";
const CAMPO3 = "11111111-1111-4111-8111-111111111113";
const CAMPO23 = "11111111-1111-4111-8111-111111111123";
const OTHER = "11111111-1111-4111-8111-111111111199";
const DEPT = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const facilities = jest.mocked(api.facilities);
const bookings = jest.mocked(api.bookings);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const staff = {
  permissions: ["bookings.read", "bookings.write"],
  roles: [{ role: "staff", teamId: null, classId: null }],
};
const space = (id: string, name: string, componentIds: string[] = []) => ({
  id,
  name,
  kind: "field",
  capacity: null,
  active: true,
  componentIds,
});
const booking = (id: string, spaceId: string, spaceName: string, more: object) => ({
  id,
  spaceId,
  spaceName,
  departmentName: "Direção RSC",
  activity: "training",
  title: null,
  status: "confirmed",
  ...more,
});
/** Tuesday 20 October 2026: Campo 2+3 trains 18:00–19:30, Campo 1 has a request 18:30–19:30. */
const tuesday = [
  booking("b1", CAMPO23, "Campo 2+3", {
    title: "Treino Sub-13",
    startsAt: "2026-10-20T17:00:00.000Z",
    endsAt: "2026-10-20T18:30:00.000Z",
  }),
  booking("b2", SPACE, "Campo 1", {
    status: "to_confirm",
    startsAt: "2026-10-20T17:30:00.000Z",
    endsAt: "2026-10-20T18:30:00.000Z",
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  // Only the clock is fake: "now" is 18:45 in Lisbon on Tuesday 20 October.
  jest.useFakeTimers({
    now: new Date("2026-10-20T17:45:00Z"),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  mockMe.mockReturnValue(staff);
  mockParams.mockReturnValue({});
  facilities.$get.mockResolvedValue(
    ok({
      spaces: [
        space(SPACE, "Campo 1"),
        space(CAMPO2, "Campo 2"),
        space(CAMPO3, "Campo 3"),
        space(CAMPO23, "Campo 2+3", [CAMPO2, CAMPO3]),
        { ...space(OTHER, "Sala nova"), kind: "other" },
      ],
      departments: [{ id: DEPT, name: "Direção RSC" }],
      venues: [],
    }),
  );
  jest.mocked(api.teams).$get.mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
  bookings.$get.mockResolvedValue(ok({ bookings: tuesday }));
});

afterEach(() => jest.useRealTimers());

it("computes weeks from Monday", () => {
  expect(mondayOf("2026-10-21")).toBe("2026-10-19");
  expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  expect(addDays("2026-10-19", 7)).toBe("2026-10-26");
});

it("shows on the floor plan what is taken now and books a space from it", async () => {
  await renderScreen(<Bookings />);
  expect(bookings.$get).toHaveBeenCalledWith({ query: { from: "2026-10-20", to: "2026-10-20" } });
  // The combined booking takes both halves; Campo 1 only has a request.
  expect(await screen.findByRole("button", { name: /^Campo 2, Ocupado até 19:30/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Campo 3, Ocupado até 19:30/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Campo 1, A confirmar até 19:30/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sala nova, Livre" })).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: /Meia hora depois/ }));
  await fireEvent.press(screen.getByRole("button", { name: /Meia hora depois/ }));
  expect(screen.getByText("19:30")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Campo 2, Livre/ })).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: /^Campo 1, Livre/ }));
  expect(screen.getByText("Livre o resto do dia")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reservar" }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/new",
    params: { spaceId: SPACE, date: "2026-10-20", start: "19:30", end: "21:00" },
  });
});

it("lists the week's bookings in Lisbon time, filters by space and opens one", async () => {
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Lista" }));
  await waitFor(() =>
    expect(bookings.$get).toHaveBeenLastCalledWith({
      query: { from: "2026-10-19", to: "2026-10-25" },
    }),
  );
  await fireEvent.press(
    await screen.findByRole("button", { name: /^18:30–19:30 Treino, Campo 1/ }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/[bookingId]",
    params: { bookingId: "b2" },
  });
  expect(screen.getByText("A confirmar")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Espaço: Todos os espaços" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Campo 1" }));
  expect(screen.queryByRole("button", { name: /Treino Sub-13/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^18:30–19:30 Treino, Campo 1/ })).toBeTruthy();
});

it("draws the day by space, the week and the month", async () => {
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Dia" }));
  // The combined booking shows in its own column and as "taken" in each half.
  const own = await screen.findByRole("button", {
    name: "18:00–19:30, Treino Sub-13, Campo 2+3, Confirmado",
  });
  expect(
    screen.getAllByRole("button", {
      name: "18:00–19:30, Treino Sub-13, Ocupado por Campo 2+3, Confirmado",
    }),
  ).toHaveLength(2);
  await fireEvent.press(own);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/[bookingId]",
    params: { bookingId: "b1" },
  });

  await fireEvent.press(screen.getByRole("tab", { name: "Mês" }));
  await waitFor(() =>
    expect(bookings.$get).toHaveBeenLastCalledWith({
      query: { from: "2026-09-28", to: "2026-11-08" },
    }),
  );
  expect(screen.getByText("Outubro de 2026")).toBeTruthy();
  await fireEvent.press(await screen.findByRole("button", { name: "20, 2 reservas" }));
  expect(screen.getByRole("tab", { name: "Dia", selected: true })).toBeTruthy();
});

it("shows an empty week and hides booking actions from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["bookings.read"], roles: [] });
  bookings.$get.mockResolvedValue(ok({ bookings: [] }));
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("button", { name: /^Campo 1, Livre/ }));
  expect(screen.queryByRole("button", { name: "Reservar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Nova reserva" })).toBeNull();
  await fireEvent.press(screen.getByRole("tab", { name: "Lista" }));
  expect(await screen.findByText("Sem reservas nesta semana.")).toBeTruthy();
});

it("checks the times before sending a new booking", async () => {
  await renderScreen(<NewBooking />);
  await choose("Espaço", "Campo 1");
  await choose("Gabinete", "Direção RSC");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Verifique a data e as horas.")).toBeTruthy();
  expect(bookings.$post).not.toHaveBeenCalled();
});

it("sends a booking with Lisbon times converted to UTC", async () => {
  bookings.$post.mockResolvedValue(ok({ bookings: [{ id: "b9" }] }));
  await renderScreen(<NewBooking />);
  await choose("Espaço", "Campo 1");
  await choose("Gabinete", "Direção RSC");
  await fireEvent.changeText(screen.getByLabelText("Data (AAAA-MM-DD)"), "2026-10-20");
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "18:30");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "20:00");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(bookings.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        spaceId: SPACE,
        startsAt: new Date("2026-10-20T17:30:00Z"),
        endsAt: new Date("2026-10-20T19:00:00Z"),
      }),
    }),
  );
});

it("asks a coach for a team and makes the booking a request", async () => {
  mockMe.mockReturnValue({
    permissions: ["bookings.read", "bookings.write"],
    roles: [{ role: "coach", teamId: TEAM, classId: null }],
  });
  await renderScreen(<NewBooking />);
  expect(await screen.findByText(/fica "a confirmar"/)).toBeTruthy();
  expect(screen.queryByText("Estado")).toBeNull();
  await choose("Espaço", "Campo 1");
  await choose("Gabinete", "Direção RSC");
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "18:00");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "19:00");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Escolha a equipa para a qual reserva.")).toBeTruthy();
  expect(bookings.$post).not.toHaveBeenCalled();
});

it("starts from the space and times picked on the plan", async () => {
  mockParams.mockReturnValue({ spaceId: SPACE, date: "2026-10-20", start: "18:30", end: "20:00" });
  bookings.$post.mockResolvedValue(ok({ bookings: [{ id: "b9" }] }));
  await renderScreen(<NewBooking />);
  expect(await screen.findByRole("button", { name: "Espaço: Campo 1" })).toBeTruthy();
  await choose("Gabinete", "Direção RSC");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(bookings.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        spaceId: SPACE,
        startsAt: new Date("2026-10-20T17:30:00Z"),
        endsAt: new Date("2026-10-20T19:00:00Z"),
      }),
    }),
  );
});
