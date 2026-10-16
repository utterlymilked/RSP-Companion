import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Health from "../app/(app)/health";
import HealthRecords from "../app/health/[personId]";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ personId: "p1" }),
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
    people: { $get: jest.fn(), ":personId": { guardians: { $get: jest.fn() } } },
    health: {
      availability: { $get: jest.fn() },
      injuries: { ":injuryId": { $patch: jest.fn() } },
      people: {
        ":personId": {
          records: { $get: jest.fn() },
          notes: { $post: jest.fn() },
          injuries: { $post: jest.fn() },
          consent: { $post: jest.fn(), revoke: { $post: jest.fn() } },
        },
      },
    },
  },
}));

const health = jest.mocked(api.health);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const physio = { permissions: ["health.physio.read", "health.physio.write"], roles: [] };
const consentOk = { required: false, grantedOn: null, grantedByPersonId: null };
const injury = (extra: Record<string, unknown> = {}) => ({
  id: "i1",
  discipline: "physio",
  bodyPart: "Joelho",
  status: "active",
  availability: "unavailable",
  startedOn: "2026-10-01",
  clearedOn: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(physio);
});

it("shows coaches availability only, with no way into the records", async () => {
  mockMe.mockReturnValue({ permissions: ["availability.read"], roles: [] });
  health.availability.$get.mockResolvedValue(
    ok({ people: [{ personId: "p1", fullName: "Pessoa Teste", status: "limited" }] }),
  );
  await renderScreen(<Health />);
  expect(await screen.findByText("Pessoa Teste")).toBeTruthy();
  expect(screen.getByText("Limitado")).toBeTruthy();
  expect(screen.queryByLabelText("Procurar atleta")).toBeNull();
});

it("records an injury in the user's discipline and moves it to return to play", async () => {
  health.people[":personId"].records.$get.mockResolvedValue(
    ok({ disciplines: ["physio"], notes: [], injuries: [injury()], consent: consentOk }),
  );
  health.people[":personId"].injuries.$post.mockResolvedValue(ok({}));
  health.injuries[":injuryId"].$patch.mockResolvedValue(ok({}));
  await renderScreen(<HealthRecords />);
  expect(await screen.findByText("Joelho · Em tratamento")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Regresso gradual · Joelho" }));
  await waitFor(() =>
    expect(health.injuries[":injuryId"].$patch).toHaveBeenCalledWith({
      param: { injuryId: "i1" },
      json: { status: "return_to_play" },
    }),
  );

  await fireEvent.press(screen.getByRole("button", { name: "Nova lesão" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar lesão" }));
  expect(await screen.findByText("Preencha os campos obrigatórios.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Zona do corpo"), "Tornozelo");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar lesão" }));
  await waitFor(() =>
    expect(health.people[":personId"].injuries.$post).toHaveBeenCalledWith({
      param: { personId: "p1" },
      json: expect.objectContaining({ discipline: "physio", bodyPart: "Tornozelo" }),
    }),
  );
});

it("blocks new records for a minor until a guardian's consent is registered", async () => {
  mockMe.mockReturnValue({ ...physio, permissions: [...physio.permissions, "health.consent"] });
  health.people[":personId"].records.$get.mockResolvedValue(
    ok({
      disciplines: ["physio"],
      notes: [],
      injuries: [],
      consent: { required: true, grantedOn: null, grantedByPersonId: null },
    }),
  );
  jest
    .mocked(api.people[":personId"].guardians.$get)
    .mockResolvedValue(
      ok({ guardians: [{ guardianId: "g1", guardian: { fullName: "Encarregada Teste" } }] }),
    );
  health.people[":personId"].consent.$post.mockResolvedValue(ok({}));
  await renderScreen(<HealthRecords />);
  expect(
    await screen.findByText("Menor sem consentimento: não é possível registar dados de saúde."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Nova lesão" })).toBeNull();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Registar consentimento de Encarregada Teste" }),
  );
  await waitFor(() =>
    expect(health.people[":personId"].consent.$post).toHaveBeenCalledWith({
      param: { personId: "p1" },
      json: { grantedByPersonId: "g1", grantedOn: expect.stringMatching(/^\d{4}-\d\d-\d\d$/) },
    }),
  );
});
