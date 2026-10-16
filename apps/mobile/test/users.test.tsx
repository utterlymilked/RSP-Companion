import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Users from "../app/(app)/users";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({ Redirect: () => null }));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
jest.mock("../src/auth/session", () => ({
  useMe: () => ({ data: { permissions: ["users.manage"] } }),
}));
jest.mock("../src/api", () => ({
  api: { users: { $get: jest.fn() }, invitations: { $post: jest.fn() } },
}));

const users = jest.mocked(api.users);
const invitations = jest.mocked(api.invitations);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  users.$get.mockResolvedValue(ok({ users: [] }));
});

it("offers every role and disables the team-scoped ones", async () => {
  await renderScreen(<Users />);
  expect(await screen.findByRole("button", { name: "Treinador" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delegado" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Encarregado de educação" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Sócio" })).toBeEnabled();
});

it("asks for a valid email and at least one role before sending", async () => {
  await renderScreen(<Users />);
  await fireEvent.press(await screen.findByRole("button", { name: "Enviar convite" }));
  expect(await screen.findByText("Indique um email válido.")).toBeTruthy();
  expect(screen.getByText("Escolha pelo menos uma função.")).toBeTruthy();
  expect(invitations.$post).not.toHaveBeenCalled();
});

it("sends the invitation with the chosen roles", async () => {
  invitations.$post.mockResolvedValue(
    ok({ id: "i1", email: "ana@example.pt", expiresAt: "2026-10-23T00:00:00Z" }),
  );
  await renderScreen(<Users />);
  await fireEvent.changeText(await screen.findByLabelText("Email"), "Ana@Example.pt");
  await fireEvent.press(screen.getByRole("button", { name: "Encarregado de educação" }));
  await fireEvent.press(screen.getByRole("button", { name: "Enviar convite" }));
  await waitFor(() =>
    expect(invitations.$post).toHaveBeenCalledWith({
      json: {
        email: "ana@example.pt",
        roles: [{ role: "guardian", teamId: null, classId: null }],
      },
    }),
  );
  expect(
    await screen.findByText("Convite enviado. Chega por email em poucos minutos."),
  ).toBeTruthy();
});
