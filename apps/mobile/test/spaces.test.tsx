import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Spaces from "../app/(app)/spaces";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Redirect: () => null,
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
    facilities: {
      $get: jest.fn(),
      spaces: { $post: jest.fn(), ":spaceId": { $patch: jest.fn() } },
    },
  },
}));

const facilities = jest.mocked(api.facilities);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const space = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  venueId: "v",
  name,
  kind: "field",
  capacity: null,
  active: true,
  componentIds: [],
  divisions: [],
  parentId: null,
  partCount: null,
  partIndex: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue({ permissions: ["facilities.write"], roles: [] });
  facilities.$get.mockResolvedValue(
    ok({
      venues: [{ id: "v", name: "Complexo", kind: "home" }],
      spaces: [
        space("c1", "Campo 1"),
        space("c2", "Campo 2", { divisions: [2] }),
        space("c2a", "Campo 2 · Metade A", { parentId: "c2", partCount: 2, partIndex: 1 }),
        space("c2b", "Campo 2 · Metade B", { parentId: "c2", partCount: 2, partIndex: 2 }),
      ],
      departments: [],
    }),
  );
});

it("lists the fields with their parts and saves a new division", async () => {
  facilities.spaces[":spaceId"].$patch.mockResolvedValue(ok({ space: {} }));
  await renderScreen(<Spaces />);
  expect(await screen.findByText("Campo 2")).toBeTruthy();
  expect(screen.getByText("2 partes")).toBeTruthy();
  expect(screen.getAllByText("Só inteiro").length).toBeGreaterThan(0);
  await fireEvent.press(screen.getAllByRole("button", { name: /^Dividir em: / })[1] as never);
  await fireEvent.press(await screen.findByRole("checkbox", { name: "Terços" }));
  await waitFor(() =>
    expect(facilities.spaces[":spaceId"].$patch).toHaveBeenCalledWith({
      param: { spaceId: "c2" },
      json: { divisions: [2, 3] },
    }),
  );
});

it("creates a field with the chosen divisions", async () => {
  facilities.spaces.$post.mockResolvedValue(ok({ space: {} }));
  await renderScreen(<Spaces />);
  await fireEvent.changeText(await screen.findByLabelText("Nome"), "Campo 4");
  await fireEvent.press(screen.getByRole("button", { name: "Adicionar campo" }));
  await waitFor(() =>
    expect(facilities.spaces.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ venueId: "v", name: "Campo 4", divisions: [] }),
    }),
  );
});

it("refuses a name that is already taken", async () => {
  await renderScreen(<Spaces />);
  await fireEvent.changeText(await screen.findByLabelText("Nome"), "campo 1");
  expect(screen.getByText("Já existe um espaço com este nome.")).toBeTruthy();
});
