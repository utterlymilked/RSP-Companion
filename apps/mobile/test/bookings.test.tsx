import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Bookings from "../app/(app)/bookings";
import NewBooking from "../app/booking/new";
import { api } from "../src/api";
import { addDays, mondayOf } from "../src/features/bookings/time";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
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
const DEPT = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const facilities = jest.mocked(api.facilities);
const bookings = jest.mocked(api.bookings);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const staff = {
  permissions: ["bookings.read", "bookings.write"],
  roles: [{ role: "staff", teamId: null, classId: null }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(staff);
  facilities.$get.mockResolvedValue(
    ok({
      spaces: [{ id: SPACE, name: "Campo 1", active: true }],
      departments: [{ id: DEPT, name: "Direção RSC" }],
      venues: [],
    }),
  );
  jest.mocked(api.teams).$get.mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
});

it("computes weeks from Monday", () => {
  expect(mondayOf("2026-10-21")).toBe("2026-10-19");
  expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  expect(addDays("2026-10-19", 7)).toBe("2026-10-26");
});

it("lists the week's bookings in Lisbon time and opens one", async () => {
  bookings.$get.mockResolvedValue(
    ok({
      bookings: [
        {
          id: "b1",
          activity: "training",
          title: null,
          status: "confirmed",
          startsAt: "2026-10-20T17:30:00.000Z",
          endsAt: "2026-10-20T19:00:00.000Z",
          spaceName: "Campo 1",
          departmentName: "Direção RSC",
        },
      ],
    }),
  );
  await renderScreen(<Bookings />);
  await fireEvent.press(await screen.findByText(/18:30–20:00 Treino/));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/booking/[bookingId]",
    params: { bookingId: "b1" },
  });
  await fireEvent.press(screen.getByRole("radio", { name: "Campo 1" }));
  await waitFor(() =>
    expect(bookings.$get).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ spaceId: SPACE }),
    }),
  );
});

it("shows an empty week and hides the new button from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["bookings.read"], roles: [] });
  bookings.$get.mockResolvedValue(ok({ bookings: [] }));
  await renderScreen(<Bookings />);
  expect(await screen.findByText("Sem reservas nesta semana.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Nova reserva" })).toBeNull();
});

it("checks the times before sending a new booking", async () => {
  await renderScreen(<NewBooking />);
  await fireEvent.press(await screen.findByRole("radio", { name: "Campo 1" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Direção RSC" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Verifique a data e as horas.")).toBeTruthy();
  expect(bookings.$post).not.toHaveBeenCalled();
});

it("sends a booking with Lisbon times converted to UTC", async () => {
  bookings.$post.mockResolvedValue(ok({ bookings: [{ id: "b9" }] }));
  await renderScreen(<NewBooking />);
  await fireEvent.press(await screen.findByRole("radio", { name: "Campo 1" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Direção RSC" }));
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
  await fireEvent.press(await screen.findByRole("radio", { name: "Campo 1" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Direção RSC" }));
  await fireEvent.changeText(screen.getByLabelText("Início (HH:MM)"), "18:00");
  await fireEvent.changeText(screen.getByLabelText("Fim (HH:MM)"), "19:00");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Escolha a equipa para a qual reserva.")).toBeTruthy();
  expect(bookings.$post).not.toHaveBeenCalled();
});
