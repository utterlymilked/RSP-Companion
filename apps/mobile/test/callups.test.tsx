import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Home from "../app/(app)/index";
import EventCallUps from "../app/event/callups/[eventId]";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ eventId: "e1" }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
const mockMe = jest.fn();
jest.mock("../src/auth/session", () => ({ useMe: () => ({ data: mockMe() }) }));
jest.mock("@react-native-async-storage/async-storage", () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
    },
  };
});
const mockAttendancePut = jest.fn();
const mockRsvpPut = jest.fn();
jest.mock("../src/api", () => ({
  api: {
    callups: {
      mine: { $get: jest.fn() },
      events: {
        ":eventId": {
          $get: jest.fn(),
          $post: jest.fn(),
          attendance: { $put: (...a: unknown[]) => mockAttendancePut(...a) },
          people: { ":personId": { rsvp: { $put: (...a: unknown[]) => mockRsvpPut(...a) } } },
        },
      },
    },
  },
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const coach = {
  user: { name: "Treinador" },
  permissions: ["events.read", "callups.read", "callups.write"],
  roles: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.callups.mine.$get).mockResolvedValue(ok({ callUps: [] }));
});

it("takes attendance and sends the mark", async () => {
  mockMe.mockReturnValue(coach);
  jest.mocked(api.callups.events[":eventId"].$get).mockResolvedValue(
    ok({
      participants: [
        {
          personId: "p1",
          name: "Ana",
          shirtNumber: 7,
          rsvp: "going",
          rsvpNote: null,
          attendance: null,
        },
      ],
    }),
  );
  mockAttendancePut.mockResolvedValue(ok({ participants: [] }));
  await renderScreen(<EventCallUps />);
  await fireEvent.press(await screen.findByText("Presente"));
  await waitFor(() => expect(mockAttendancePut).toHaveBeenCalledTimes(1));
  expect(mockAttendancePut.mock.calls[0][0].json.marks[0]).toMatchObject({
    personId: "p1",
    status: "present",
  });
});

it("keeps the mark and shows a notice when offline", async () => {
  mockMe.mockReturnValue(coach);
  jest.mocked(api.callups.events[":eventId"].$get).mockResolvedValue(
    ok({
      participants: [
        {
          personId: "p1",
          name: "Ana",
          shirtNumber: null,
          rsvp: "pending",
          rsvpNote: null,
          attendance: null,
        },
      ],
    }),
  );
  mockAttendancePut.mockRejectedValue(new Error("network"));
  await renderScreen(<EventCallUps />);
  await fireEvent.press(await screen.findByText("Faltou"));
  expect(await screen.findByText(/1 presenças por sincronizar/)).toBeTruthy();
});

it("lets a guardian answer a call-up from the home screen", async () => {
  mockMe.mockReturnValue({ user: { name: "Mãe" }, permissions: [], roles: [] });
  jest.mocked(api.callups.mine.$get).mockResolvedValue(
    ok({
      callUps: [
        {
          eventId: "e1",
          personId: "p1",
          personName: "Ana",
          kind: "match",
          startsAt: "2026-11-14T10:00:00.000Z",
          rsvp: "pending",
        },
      ],
    }),
  );
  mockRsvpPut.mockResolvedValue(ok({ rsvp: "going" }));
  await renderScreen(<Home />);
  await fireEvent.press(await screen.findByText("Vou"));
  await waitFor(() => expect(mockRsvpPut).toHaveBeenCalled());
  expect(mockRsvpPut.mock.calls[0][0]).toMatchObject({
    param: { eventId: "e1", personId: "p1" },
    json: { rsvp: "going" },
  });
});
