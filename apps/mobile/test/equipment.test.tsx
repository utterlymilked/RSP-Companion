import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Equipment from "../app/(app)/equipment";
import EquipmentDetail from "../app/equipment/[itemId]";
import NewEquipmentItem from "../app/equipment/new";
import { api } from "../src/api";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ itemId: "e1" }),
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
    equipment: {
      items: {
        $get: jest.fn(),
        $post: jest.fn(),
        ":itemId": { $get: jest.fn(), movements: { $post: jest.fn() } },
      },
      loans: { $get: jest.fn(), $post: jest.fn(), ":loanId": { return: { $post: jest.fn() } } },
    },
  },
}));

const TEAM = "33333333-3333-4333-8333-333333333333";
const equipment = jest.mocked(api.equipment);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const stores = { permissions: ["equipment.read", "equipment.write"], roles: [] };
const item = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  name: "Camisola oficial",
  category: "kit",
  size: "M",
  priceCents: 2500,
  minStock: 3,
  active: true,
  stock: 2,
  low: true,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(stores);
  jest.mocked(api.teams).$get.mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
  equipment.loans.$get.mockResolvedValue(ok({ loans: [] }));
});

it("lists items with stock, flags low ones and filters", async () => {
  equipment.items.$get.mockResolvedValue(ok({ items: [item()] }));
  await renderScreen(<Equipment />);
  expect(await screen.findByText("Camisola oficial · M")).toBeTruthy();
  expect(screen.getByText("Equipamentos · Stock baixo")).toBeTruthy();
  expect(screen.getByText("Stock: 2")).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Só stock baixo" }));
  await waitFor(() =>
    expect(equipment.items.$get).toHaveBeenLastCalledWith({ query: { low: "true" } }),
  );
});

it("hides the new button from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["equipment.read"], roles: [] });
  equipment.items.$get.mockResolvedValue(ok({ items: [] }));
  await renderScreen(<Equipment />);
  expect(await screen.findByText("Sem artigos.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo artigo" })).toBeNull();
});

it("needs a name, then creates the item with the price in cents", async () => {
  equipment.items.$post.mockResolvedValue(ok({ item: item() }));
  await renderScreen(<NewEquipmentItem />);
  await fireEvent.press(await screen.findByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Indique um nome.")).toBeTruthy();
  expect(equipment.items.$post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Bola");
  await fireEvent.changeText(screen.getByLabelText("Preço em euros (opcional)"), "12,50");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(equipment.items.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ name: "Bola", priceCents: 1250 }),
    }),
  );
});

it("records a movement and returns a loan on the item screen", async () => {
  equipment.items[":itemId"].$get.mockResolvedValue(ok({ item: item(), movements: [] }));
  equipment.items[":itemId"].movements.$post.mockResolvedValue(ok({}));
  equipment.loans.$get.mockResolvedValue(
    ok({
      loans: [
        { id: "l1", itemId: "e1", quantity: 4, teamId: TEAM, loanedAt: "2026-10-20T17:30:00.000Z" },
      ],
    }),
  );
  equipment.loans[":loanId"].return.$post.mockResolvedValue(ok({}));
  await renderScreen(<EquipmentDetail />);
  await fireEvent.press(await screen.findByRole("button", { name: "Registar" }));
  expect(await screen.findByText("Indique um número inteiro.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Quantidade"), "5");
  await fireEvent.press(screen.getByRole("button", { name: "Registar" }));
  await waitFor(() =>
    expect(equipment.items[":itemId"].movements.$post).toHaveBeenCalledWith({
      param: { itemId: "e1" },
      json: { kind: "receipt", quantity: 5 },
    }),
  );
  await fireEvent.press(await screen.findByText("Devolver"));
  await waitFor(() =>
    expect(equipment.loans[":loanId"].return.$post).toHaveBeenCalledWith({
      param: { loanId: "l1" },
    }),
  );
});
