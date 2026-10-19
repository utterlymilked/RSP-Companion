import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Scouting from "../app/(app)/scouting";
import ProspectDetail from "../app/scouting/[prospectId]";
import NewProspect from "../app/scouting/new";
import NewReport from "../app/scouting/report/[prospectId]";
import { api } from "../src/api";
import { ApiRequestError } from "../src/errors";
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
    clubs: { $get: jest.fn() },
    scouting: {
      prospects: {
        $get: jest.fn(),
        $post: jest.fn(),
        ":prospectId": {
          $get: jest.fn(),
          $patch: jest.fn(),
          reports: { $post: jest.fn() },
          "link-suggestions": { $get: jest.fn() },
        },
      },
    },
  },
}));

const scouting = jest.mocked(api.scouting);
const clubs = jest.mocked(api.clubs);
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
  positions: [],
  clubAuthorisationNeeded: false,
  clubAuthorised: false,
  retainUntil: "2027-10-15",
  expired: false,
  lastRating: 4,
  nif: null,
  personId: null,
  person: null,
  archetype: null,
  targetEscalao: null,
  profile: {
    group: "mid",
    scores: {},
    overall: null,
    archetype: null,
    archetypes: [],
    heat: null,
    reportCount: 0,
  },
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
  expect(screen.getAllByText("Médio · Clube X")).toHaveLength(2);
  expect(screen.getAllByText("Observado")).toHaveLength(2);
  expect(screen.getByText("4/5")).toBeTruthy();
  expect(screen.getByText(/Prazo de retenção ultrapassado/)).toBeTruthy();
  await choose("Estado", "Convidado");
  await waitFor(() =>
    expect(scouting.prospects.$get).toHaveBeenLastCalledWith({ query: { status: "invited" } }),
  );
  await choose("Posição", "Guarda-redes");
  await waitFor(() =>
    expect(scouting.prospects.$get).toHaveBeenLastCalledWith({
      query: { status: "invited", group: "gk" },
    }),
  );
});

it("hides the new button from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["scouting.read"], roles: [] });
  scouting.prospects.$get.mockResolvedValue(ok({ prospects: [] }));
  await renderScreen(<Scouting />);
  expect(await screen.findByText("Sem atletas em observação.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo atleta" })).toBeNull();
});

it("needs a name, then creates the prospect from the essentials only", async () => {
  clubs.$get.mockResolvedValue(ok({ clubs: [] }));
  scouting.prospects.$post.mockResolvedValue(ok({ prospect: prospect() }));
  await renderScreen(<NewProspect />);
  await fireEvent.press(await screen.findByRole("button", { name: "Criar e abrir ficha" }));
  expect(await screen.findByText("Indique um nome.")).toBeTruthy();
  expect(scouting.prospects.$post).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Jogador Externo");
  await fireEvent.changeText(screen.getByLabelText("Ano de nascimento (opcional)"), "2012");
  await fireEvent.press(screen.getByRole("button", { name: "Criar e abrir ficha" }));
  await waitFor(() =>
    expect(scouting.prospects.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ fullName: "Jogador Externo", birthYear: 2012 }),
    }),
  );
  expect(screen.queryByLabelText("Nome do encarregado de educação")).toBeNull();
});

it("fills the sheet in by section", async () => {
  clubs.$get.mockResolvedValue(ok({ clubs: [] }));
  scouting.prospects[":prospectId"].$get.mockResolvedValue(
    ok({ prospect: prospect(), reports: [] }),
  );
  scouting.prospects[":prospectId"].$patch.mockResolvedValue(ok({}));
  await renderScreen(<ProspectDetail />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Ficha" }));
  expect(await screen.findByText("Desportivo")).toBeTruthy();
  // The sporting section is the second card.
  await fireEvent.press(screen.getAllByRole("button", { name: "Editar secção" })[1] as never);
  await choose("Escalão pretendido", "Sub-13");
  await fireEvent.changeText(screen.getByLabelText("Altura em cm (opcional)"), "150");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].$patch).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: { targetEscalao: "sub13", heightCm: 150 },
    }),
  );
});

it("moves a prospect along the pipeline and lists its reports", async () => {
  scouting.prospects[":prospectId"].$get.mockResolvedValue(
    ok({
      prospect: prospect(),
      reports: [
        {
          id: "r1",
          observedOn: "2026-10-08",
          rating: 5,
          text: "Muito bom.",
          scores: { passing: 8 },
          positionPlayed: "mc",
        },
      ],
    }),
  );
  scouting.prospects[":prospectId"].$patch.mockResolvedValue(ok({}));
  await renderScreen(<ProspectDetail />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Relatórios" }));
  expect(await screen.findByText("Muito bom.")).toBeTruthy();
  expect(screen.getByText(/1 atributos avaliados/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("tab", { name: "Ficha" }));
  await choose("Estado", "Convidado");
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].$patch).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: { status: "invited" },
    }),
  );
});

it("saves a report with attribute scores and the heat grid", async () => {
  scouting.prospects[":prospectId"].$get.mockResolvedValue(
    ok({ prospect: prospect(), reports: [] }),
  );
  scouting.prospects[":prospectId"].reports.$post.mockResolvedValue(ok({}));
  await renderScreen(<NewReport />);
  await fireEvent.press(await screen.findByRole("button", { name: "Guardar relatório" }));
  expect(await screen.findByText("Avalie pelo menos um atributo.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Passe 8" }));
  await fireEvent.press(screen.getByRole("button", { name: "Zona 7, intensidade 0" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar relatório" }));
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].reports.$post).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: expect.objectContaining({
        scores: { passing: 8 },
        heat: expect.arrayContaining([1]),
      }),
    }),
  );
});

it("saves an observation training report with a recommendation", async () => {
  scouting.prospects[":prospectId"].$get.mockResolvedValue(
    ok({ prospect: prospect({ trialDate: "2026-10-12" }), reports: [] }),
  );
  scouting.prospects[":prospectId"].reports.$post.mockResolvedValue(ok({}));
  await renderScreen(<NewReport />);
  await screen.findByText("Tipo de relatório");
  await fireEvent.press(screen.getByRole("radio", { name: "Treino de observação" }));
  expect(screen.queryByText("Onde esteve ativo")).toBeNull();
  await choose("Parecer de recrutamento", "Para vincular");
  await fireEvent.press(screen.getByRole("button", { name: "Passe 8" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar relatório" }));
  await waitFor(() =>
    expect(scouting.prospects[":prospectId"].reports.$post).toHaveBeenCalledWith({
      param: { prospectId: "p1" },
      json: expect.objectContaining({
        kind: "observation_training",
        recommendation: "sign",
        observedOn: "2026-10-12",
        heat: null,
      }),
    }),
  );
});

it("warns before linking a prospect to the person who has its NIF", async () => {
  scouting.prospects.$post.mockRejectedValueOnce(
    new ApiRequestError("link_confirmation_required", 409, {
      person: { fullName: "Ana Beatriz Costa", identityCode: "RSC-AB12CD34" },
    }),
  );
  scouting.prospects.$post.mockResolvedValueOnce(ok({ prospect: prospect({ personId: "x" }) }));
  await renderScreen(<NewProspect />);
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Ana B. Costa");
  await fireEvent.changeText(screen.getByLabelText("NIF (opcional)"), "999999990");
  await fireEvent.press(screen.getByRole("button", { name: "Criar e abrir ficha" }));
  expect(await screen.findByText(/vai ficar ligada a Ana Beatriz Costa/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Confirmar e ligar" }));
  await waitFor(() =>
    expect(scouting.prospects.$post).toHaveBeenLastCalledWith({
      json: expect.objectContaining({ nif: "999999990", confirmLink: true }),
    }),
  );
});
