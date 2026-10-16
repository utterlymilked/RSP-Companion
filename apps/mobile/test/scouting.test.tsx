import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Scouting from "../app/(app)/scouting";
import ProspectDetail from "../app/scouting/[prospectId]";
import NewProspect from "../app/scouting/new";
import { api } from "../src/api";
import { choose, renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ prospectId: "p1" }),
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
    scouting: {
      prospects: {
        $get: jest.fn(),
        $post: jest.fn(),
        ":prospectId": { $get: jest.fn(), $patch: jest.fn(), reports: { $post: jest.fn() } },
      },
    },
  },
}));

const scouting = jest.mocked(api.scouting);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const scout = { permissions: ["scouting.read", "scouting.write"], roles: [] };
const prospect = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  fullName: "Jogador Externo",
  birthYear: 2012,
  currentClub: "Clube X",
  position: "Médio",
  status: "observed",
  notes: null,
  retainUntil: "2027-10-15",
  expired: false,
  lastRating: 4,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(scout);
});

it("lists prospects with status and rating, flags expired ones and filters", async () => {
  scouting.prospects.$get.mockResolvedValue(
    ok({
      prospects: [
        prospect(),
        prospect({ id: "p2", fullName: "Antigo", expired: true, lastRating: null }),
      ],
    }),
  );
  await renderScreen(<Scouting />);
  expect(await screen.findByText("Jogador Externo")).toBeTruthy();
  expect(screen.getByText("Observado · 2012 · Clube X")).toBeTruthy();
  expect(screen.getByText("4/5")).toBeTruthy();
  expect(screen.getByText(/Prazo de retenção ultrapassado/)).toBeTruthy();
  await choose("Estado", "Convidado");
  await waitFor(() =>
    expect(scouting.prospects.$get).toHaveBeenLastCalledWith({ query: { status: "invited" } }),
  );
});

it("hides the new button from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["scouting.read"], roles: [] });
  scouting.prospects.$get.mockResolvedValue(ok({ prospects: [] }));
  await renderScreen(<Scouting />);
  expect(await screen.findByText("Sem atletas em observação.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo atleta" })).toBeNull();
});

it("needs a name, then creates the prospect", async () => {
  scouting.prospects.$post.mockResolvedValue(ok({ prospect: prospect() }));
  await renderScreen(<NewProspect />);
  await fireEvent.press(await screen.findByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Indique um nome.")).toBeTruthy();
  expect(scouting.prospects.$post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Jogador Externo");
  await fireEvent.changeText(screen.getByLabelText("Ano de nascimento (opcional)"), "2012");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(scouting.prospects.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ fullName: "Jogador Externo", birthYear: 2012 }),
    }),
  );
});

it("moves a prospect along the pipeline and adds a report", async () => {
  scouting.prospects[":prospectId"].$get.mockResolvedValue(
    ok({
      prospect: prospect(),
      reports: [{ id: "r1", observedOn: "2026-10-08", rating: 5, text: "Muito bom." }],
    }),
  );
  scouting.prospects[":prospectId"].$patch.mockResolvedValue(ok({}));
  scouting.prospects[":prospectId"].reports.$post.mockResolvedValue(ok({}));
  await renderScreen(<ProspectDetail />);
  expect(await screen.findByText("Muito bom.")).toBeTruthy();
  await choose("Estado", "Convidado");
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].$patch).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: { status: "invited" },
    }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Adicionar relatório" }));
  expect(await screen.findByText("Escreva o relatório.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Relatório"), "Boa visão de jogo.");
  await fireEvent.press(screen.getByRole("button", { name: "Adicionar relatório" }));
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].reports.$post).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: expect.objectContaining({ rating: 3, text: "Boa visão de jogo." }),
    }),
  );
});
