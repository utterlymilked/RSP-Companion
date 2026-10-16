import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import EventTransport from "../app/event/transport/[eventId]";
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
const mockSeatPut = jest.fn();
const mockRidePost = jest.fn();
jest.mock("../src/api", () => ({
  api: {
    callups: { mine: { $get: jest.fn() }, events: { ":eventId": { $get: jest.fn() } } },
    transport: {
      events: {
        ":eventId": { $get: jest.fn(), rides: { $post: (...a: unknown[]) => mockRidePost(...a) } },
      },
      rides: {
        ":rideId": {
          $delete: jest.fn(),
          passengers: {
            ":personId": { $put: (...a: unknown[]) => mockSeatPut(...a), $delete: jest.fn() },
          },
        },
      },
    },
  },
}));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const ride = {
  id: "r1",
  kind: "carpool",
  label: null,
  seats: 3,
  taken: 0,
  pickupPoint: "Café",
  pickupAt: null,
  notes: null,
  driverName: "Carla",
  driverPhone: null,
  isDriver: false,
  canManage: false,
  passengers: [],
  mine: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue({
    user: { name: "Pai" },
    personId: "parent",
    permissions: [],
    roles: [],
  });
  jest.mocked(api.transport.events[":eventId"].$get).mockResolvedValue(ok({ rides: [ride] }));
  jest
    .mocked(api.callups.mine.$get)
    .mockResolvedValue(ok({ callUps: [{ eventId: "e1", personId: "p1", personName: "Ana" }] }));
});

it("seats a ward in a carpool", async () => {
  mockSeatPut.mockResolvedValue(ok({}));
  await renderScreen(<EventTransport />);
  expect(await screen.findByText(/Condutor: Carla/)).toBeTruthy();
  await fireEvent.press(await screen.findByText("Boleia 1"));
  await waitFor(() => expect(mockSeatPut).toHaveBeenCalled());
  expect(mockSeatPut.mock.calls[0][0]).toMatchObject({ param: { rideId: "r1", personId: "p1" } });
});

it("offers a carpool driven by the user", async () => {
  mockRidePost.mockResolvedValue(ok({ id: "r2" }));
  await renderScreen(<EventTransport />);
  const buttons = await screen.findAllByText("Oferecer boleia");
  await fireEvent.press(buttons[buttons.length - 1] as never);
  await waitFor(() => expect(mockRidePost).toHaveBeenCalled());
  expect(mockRidePost.mock.calls[0][0].json).toMatchObject({
    kind: "carpool",
    driverPersonId: "parent",
  });
});
