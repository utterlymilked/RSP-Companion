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
  user: { name: "Ana Reis" },
  permissions: ["bookings.read", "bookings.write"],
  roles: [{ role: "staff", teamId: null, classId: null }],
  bookingApprover: true,
};
const space = (id: string, name: string, componentIds: string[] = []) => ({
  id,
  name,
  kind: "field",
  capacity: null,
  active: true,
  componentIds,
  divisions: [] as number[],
  parentId: null,
  partCount: null,
  partIndex: null,
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

it("shows the week of each pitch in the timetable, with free times that book on a tap", async () => {
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Horário" }));
  // One grid per pitch; the combination Campo 2+3 has none of its own.
  expect(await screen.findByLabelText("Campo 1")).toBeTruthy();
  expect(screen.getByLabelText("Campo 2")).toBeTruthy();
  expect(screen.queryByLabelText("Campo 2+3")).toBeNull();
  // Tuesday's combined booking appears on Campo 2 as "through another space"; the request on Campo 1.
  expect(
    screen.getAllByRole("button", { name: /Treino Sub-13, Ocupado por Campo 2\+3/ }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getByRole("button", { name: /Direção RSC, Treino, Campo 1, A confirmar/ }),
  ).toBeTruthy();
  // 17:00 on Wednesday is free and in the future.
  await fireEvent.press(
    screen.getByRole("button", { name: /^Reservar Campo 1, quarta-feira, 21 de outubro, 17:00/ }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/new",
    params: { spaceId: SPACE, date: "2026-10-21", start: "17:00", end: "18:30" },
  });
  // Nothing is offered where something is booked: Campo 1 on Tuesday at 18:30.
  expect(
    screen.queryByRole("button", { name: /^Reservar Campo 1, terça-feira, 20 de outubro, 18:30/ }),
  ).toBeNull();
});

it("computes weeks from Monday", () => {
  expect(mondayOf("2026-10-21")).toBe("2026-10-19");
  expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  expect(addDays("2026-10-19", 7)).toBe("2026-10-26");
});

it("shows on the floor plan what is taken now and books a free time in two taps", async () => {
  await renderScreen(<Bookings />);
  expect(bookings.$get).toHaveBeenCalledWith({ query: { from: "2026-10-19", to: "2026-10-25" } });
  // The combined booking takes both halves; Campo 1 only has a request.
  expect(await screen.findByRole("button", { name: /^Campo 2, Ocupado até 19:30/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Campo 3, Ocupado até 19:30/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Campo 1, A confirmar até 19:30/ })).toBeTruthy();
  // Rooms are a separate category.
  expect(screen.queryByRole("button", { name: /^Sala nova/ })).toBeNull();

  await fireEvent.press(screen.getByRole("button", { name: /^Campo 1,/ }));
  // Now is 18:45 and the request ends at 19:30: the first free 1h30 starts then.
  const first = await screen.findByRole("button", { name: "Reservar das 19:30–21:00" });
  expect(screen.queryByRole("button", { name: /^Reservar das 18:00/ })).toBeNull();
  await fireEvent.press(first);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/new",
    params: { spaceId: SPACE, date: "2026-10-20", start: "19:30", end: "21:00" },
  });
});

it("shows rooms apart and another day's bookings as a count", async () => {
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Salas" }));
  expect(await screen.findByRole("button", { name: "Sala nova, Livre" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("tab", { name: "Campos" }));
  await fireEvent.press(screen.getByRole("button", { name: /^quarta-feira, 21/ }));
  expect(await screen.findByRole("button", { name: /^Campo 1, Livre todo o dia/ })).toBeTruthy();
});

it("draws the day by space, the week and the month", async () => {
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Dia" }));
  // The combined booking shows in its own column and as "taken" in each half.
  const own = await screen.findByRole("button", {
    name: "18:00–19:30, Treino Sub-13, Direção RSC, Campo 2+3, Confirmado",
  });
  expect(
    screen.getAllByRole("button", {
      name: "18:00–19:30, Treino Sub-13, Direção RSC, Ocupado por Campo 2+3, Confirmado",
    }),
  ).toHaveLength(2);
  // Tapping a taken block says who has it; the sheet leads on to the booking.
  await fireEvent.press(own);
  await fireEvent.press(await screen.findByRole("button", { name: "Ver reserva" }));
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

it("hides booking actions from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["bookings.read"], roles: [] });
  bookings.$get.mockResolvedValue(ok({ bookings: [] }));
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByRole("button", { name: /^Campo 1, Livre/ }));
  expect(screen.getByText("Sem reservas neste dia.")).toBeTruthy();
  expect(screen.queryByText("Horários livres")).toBeNull();
  expect(screen.queryByRole("button", { name: "Nova reserva" })).toBeNull();
});

it("books from scratch: space on the plan, day, free time, confirm", async () => {
  bookings.$post.mockResolvedValue(ok({ bookings: [{ id: "b9", status: "confirmed" }] }));
  await renderScreen(<NewBooking />);
  await fireEvent.press(await screen.findByRole("button", { name: /^Campo 2,/ }));
  // Past days cannot be picked.
  expect(screen.getByRole("button", { name: /^segunda-feira, 19/ })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: /^terça-feira, 20/ }));
  // Campo 2+3 trains until 19:30, so Campo 2 is free from then.
  expect(screen.queryByRole("button", { name: /^Reservar das 19:00/ })).toBeNull();
  // The taken stretch is listed once with its owner, and a greyed start says why.
  expect(screen.getAllByText("18:00–19:30")).toHaveLength(1);
  await fireEvent.press(
    screen.getByRole("button", { name: /^19:00–20:30\. Esta hora está ocupada/ }),
  );
  expect(await screen.findByText(/Esta hora está ocupada: 18:00–19:30/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Fechar" }));
  // A start too close to closing time stays free, shortened to what fits.
  expect(screen.getByRole("button", { name: "Reservar das 22:30–23:00" })).toBeTruthy();
  await fireEvent.press(await screen.findByRole("tab", { name: "1h" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reservar das 19:30–20:30" }));
  expect(screen.getByRole("button", { name: /^Hora: 19:30–20:30/ })).toBeTruthy();
  // The only department is filled in.
  await fireEvent.press(screen.getByRole("button", { name: "Confirmar reserva" }));
  await waitFor(() =>
    expect(bookings.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        spaceId: CAMPO2,
        departmentId: DEPT,
        status: "confirmed",
        startsAt: new Date("2026-10-20T18:30:00Z"),
        endsAt: new Date("2026-10-20T19:30:00Z"),
      }),
    }),
  );
  // Feedback: a summary with who booked, and a way on.
  expect(await screen.findByText("Reserva confirmada")).toBeTruthy();
  expect(screen.getByText("Reservado por Ana Reis")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ver em Minhas reservas" })).toBeTruthy();
});

it("starts from the space and times picked on the plan and repeats weekly", async () => {
  mockParams.mockReturnValue({ spaceId: SPACE, date: "2026-10-20", start: "19:30", end: "21:00" });
  bookings.$post.mockResolvedValue(ok({ bookings: [{ id: "b9", status: "confirmed" }] }));
  await renderScreen(<NewBooking />);
  expect(await screen.findByRole("button", { name: /^Espaço: Campo 1/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Hora: 19:30–21:00/ })).toBeTruthy();
  await choose("Repetir", "Todas as semanas, 4 semanas");
  await fireEvent.press(screen.getByRole("button", { name: "Confirmar reserva" }));
  await waitFor(() =>
    expect(bookings.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        spaceId: SPACE,
        startsAt: new Date("2026-10-20T18:30:00Z"),
        endsAt: new Date("2026-10-20T20:00:00Z"),
        repeat: { everyWeeks: 1, until: "2026-11-10" },
      }),
    }),
  );
});

it("asks a coach for a team and makes the booking a request", async () => {
  mockMe.mockReturnValue({
    permissions: ["bookings.read", "bookings.write"],
    roles: [{ role: "coach", teamId: TEAM, classId: null }],
  });
  mockParams.mockReturnValue({ spaceId: SPACE, date: "2026-10-20", start: "19:30", end: "21:00" });
  await renderScreen(<NewBooking />);
  expect(await screen.findByText(/fica "a confirmar"/)).toBeTruthy();
  expect(screen.queryByText("Estado")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Enviar pedido" }));
  expect(await screen.findByText("Escolha a equipa para a qual reserva.")).toBeTruthy();
  expect(bookings.$post).not.toHaveBeenCalled();
});
