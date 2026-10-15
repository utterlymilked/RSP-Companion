import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import People from "../app/(app)/people";
import NewPerson from "../app/person/new";
import { api } from "../src/api";
import { renderScreen } from "./render";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
jest.mock("../src/auth/session", () => ({
  useMe: () => ({ data: { permissions: ["people.read", "people.write"] } }),
}));
jest.mock("../src/api", () => ({
  api: { people: { $get: jest.fn(), $post: jest.fn() } },
}));

const people = jest.mocked(api.people);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;

beforeEach(() => jest.clearAllMocks());

it("lists people, searches by name and opens a person", async () => {
  people.$get.mockResolvedValue(
    ok({ people: [{ id: "p1", fullName: "Ana Teste", displayName: null, sex: "female" }] }),
  );
  await renderScreen(<People />);
  await fireEvent.press(await screen.findByText("Ana Teste"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/person/[personId]",
    params: { personId: "p1" },
  });

  await fireEvent.changeText(screen.getByLabelText("Pesquisar por nome"), " ana ");
  await waitFor(() => expect(people.$get).toHaveBeenLastCalledWith({ query: { q: "ana" } }));
});

it("offers to add a person only to users who may write", async () => {
  people.$get.mockResolvedValue(ok({ people: [] }));
  await renderScreen(<People />);
  expect(await screen.findByText("Nenhuma pessoa encontrada.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Nova pessoa" }));
  expect(mockPush).toHaveBeenCalledWith("/person/new");
});

it("asks for a name before creating a person", async () => {
  await renderScreen(<NewPerson />);
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("Campo obrigatório.")).toBeTruthy();
  expect(people.$post).not.toHaveBeenCalled();
});

it("sends the new person to the API", async () => {
  people.$post.mockResolvedValue(ok({ person: { id: "p9" } }));
  await renderScreen(<NewPerson />);
  await fireEvent.changeText(screen.getByLabelText("Nome completo"), " Rui Teste ");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(people.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ fullName: "Rui Teste" }),
    }),
  );
});
