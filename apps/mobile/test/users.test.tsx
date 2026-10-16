import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Users from "../app/(app)/users";
import UserScreen from "../app/user/[userId]";
import Invite from "../app/user/invite";
import { api } from "../src/api";
import { choose, renderScreen } from "./render";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ userId: "u2" }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
jest.mock("../src/auth/session", () => ({
  meQueryKey: ["me"],
  useMe: () => ({ data: { user: { id: "u1" }, permissions: ["users.manage"] } }),
}));
jest.mock("../src/api", () => {
  const invitation = { resend: { $post: jest.fn() }, $delete: jest.fn() };
  const user = {
    $get: jest.fn(),
    roles: { $post: jest.fn(), ":assignmentId": { $delete: jest.fn() } },
    person: { $put: jest.fn() },
    active: { $put: jest.fn() },
  };
  return {
    api: {
      users: { $get: jest.fn(), ":userId": user },
      invitations: { $get: jest.fn(), $post: jest.fn(), ":invitationId": invitation },
      teams: { $get: jest.fn() },
      classes: { $get: jest.fn() },
      people: { $get: jest.fn() },
    },
  };
});

const T1 = "6f1c7a52-8e57-4d1b-9a43-2f8e2a3b9c10";
const P1 = "0b8e3c41-5d2a-4f6b-8c7d-1e2f3a4b5c6d";
const m = jest.mocked(api);
const user = m.users[":userId"];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const fail = (code: string) =>
  ({ ok: false, status: 409, json: async () => ({ error: { code } }) }) as never;

const ana = {
  id: "u2",
  email: "ana@example.pt",
  name: "Ana Costa",
  personId: null,
  personName: null,
  createdAt: "2026-10-01T10:00:00Z",
  deactivatedAt: null,
  lastSeenAt: "2026-10-15T10:00:00Z",
  roles: [
    { id: "r1", role: "coach", teamId: T1, classId: null, scopeName: "Sub-13 A" },
    { id: "r2", role: "member", teamId: null, classId: null, scopeName: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  m.users.$get.mockResolvedValue(ok({ users: [ana] }));
  m.invitations.$get.mockResolvedValue(ok({ invitations: [] }));
  m.teams.$get.mockResolvedValue(ok({ teams: [{ id: T1, name: "Sub-13 A" }] }));
  m.classes.$get.mockResolvedValue(ok({ classes: [{ id: "c1", name: null, code: "T1" }] }));
  m.people.$get.mockResolvedValue(ok({ people: [] }));
  user.$get.mockResolvedValue(ok({ user: ana }));
});

describe("users list", () => {
  it("shows each user's roles with their team and opens the user", async () => {
    await renderScreen(<Users />);
    expect(await screen.findByText("Treinador (Sub-13 A), Sócio")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ana Costa"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/user/[userId]", params: { userId: "u2" } });
  });

  it("filters by name ignoring accents", async () => {
    m.users.$get.mockResolvedValue(
      ok({ users: [ana, { ...ana, id: "u3", name: "João Silva", email: "j@example.pt" }] }),
    );
    await renderScreen(<Users />);
    await fireEvent.changeText(await screen.findByLabelText("Procurar por nome ou email"), "joao");
    expect(screen.getByText("João Silva")).toBeTruthy();
    expect(screen.queryByText("Ana Costa")).toBeNull();
  });

  it("lists pending invitations and sends one again or cancels it", async () => {
    m.invitations.$get.mockResolvedValue(
      ok({
        invitations: [
          {
            id: "i1",
            email: "rui@example.pt",
            personId: null,
            personName: null,
            roles: [{ role: "team_manager", teamId: T1, classId: null }],
            invitedByName: "Pedro",
            createdAt: "2026-10-01T10:00:00Z",
            expiresAt: "2026-10-08T10:00:00Z",
            expired: true,
          },
        ],
      }),
    );
    m.invitations[":invitationId"].resend.$post.mockResolvedValue(ok({ id: "i1" }));
    m.invitations[":invitationId"].$delete.mockResolvedValue(ok(null));
    await renderScreen(<Users />);
    expect(await screen.findByText("Expirado")).toBeTruthy();
    expect(await screen.findByText("Delegado (Sub-13 A)")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reenviar" }));
    await waitFor(() =>
      expect(m.invitations[":invitationId"].resend.$post).toHaveBeenCalledWith({
        param: { invitationId: "i1" },
      }),
    );
    expect(await screen.findByText("Enviámos um novo link, válido 7 dias.")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Cancelar convite de rui@example.pt" }),
    );
    await waitFor(() =>
      expect(m.invitations[":invitationId"].$delete).toHaveBeenCalledWith({
        param: { invitationId: "i1" },
      }),
    );
  });
});

describe("invite", () => {
  it("asks for a valid email and at least one role before sending", async () => {
    await renderScreen(<Invite />);
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar convite" }));
    expect(await screen.findByText("Indique um email válido.")).toBeTruthy();
    expect(screen.getByText("Escolha pelo menos uma função.")).toBeTruthy();
    expect(m.invitations.$post).not.toHaveBeenCalled();
  });

  it("sends club roles, a team role and the linked person", async () => {
    m.people.$get.mockResolvedValue(
      ok({ people: [{ id: P1, fullName: "Rui Mendes", displayName: null }] }),
    );
    m.invitations.$post.mockResolvedValue(ok({ id: "i1" }));
    await renderScreen(<Invite />);
    await fireEvent.changeText(await screen.findByLabelText("Email"), "Rui@Example.pt");
    await fireEvent.press(
      screen.getByRole("button", { name: /^Pessoa no registo \(opcional\): / }),
    );
    await fireEvent.changeText(screen.getByLabelText("Pesquisar"), "rui");
    await fireEvent.press(await screen.findByRole("radio", { name: "Rui Mendes" }));
    await choose("Funções no clube", "Encarregado de educação");
    await fireEvent.press(screen.getByRole("button", { name: "Concluído" }));
    // Two team roles fit a segmented control.
    await fireEvent.press(screen.getByRole("radio", { name: "Treinador" }));
    await choose("Equipa ou turma", "Sub-13 A");
    await fireEvent.press(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByRole("button", { name: "Retirar Treinador (Sub-13 A)" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Enviar convite" }));
    await waitFor(() =>
      expect(m.invitations.$post).toHaveBeenCalledWith({
        json: {
          email: "rui@example.pt",
          personId: P1,
          roles: [
            { role: "guardian", teamId: null, classId: null },
            { role: "coach", teamId: T1, classId: null },
          ],
        },
      }),
    );
    expect(
      await screen.findByText("Convite enviado. Chega por email em poucos minutos."),
    ).toBeTruthy();
  });
});

describe("user screen", () => {
  it("adds a team role and removes a role", async () => {
    user.roles.$post.mockResolvedValue(ok({ id: "r3" }));
    user.roles[":assignmentId"].$delete.mockResolvedValue(ok(null));
    await renderScreen(<UserScreen />);
    expect(await screen.findByText("Ana Costa")).toBeTruthy();
    await choose("Adicionar função", "Delegado");
    await choose("Equipa ou turma", "T1");
    await fireEvent.press(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() =>
      expect(user.roles.$post).toHaveBeenCalledWith({
        param: { userId: "u2" },
        json: { role: "team_manager", teamId: null, classId: "c1" },
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Retirar Sócio" }));
    await waitFor(() =>
      expect(user.roles[":assignmentId"].$delete).toHaveBeenCalledWith({
        param: { userId: "u2", assignmentId: "r2" },
      }),
    );
  });

  it("greys out roles already held", async () => {
    await renderScreen(<UserScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Adicionar função: / }));
    expect(screen.getByRole("radio", { name: /^Sócio/ })).toBeDisabled();
  });

  it("links the user to a person found by name", async () => {
    m.people.$get.mockResolvedValue(
      ok({ people: [{ id: P1, fullName: "Ana Maria Costa", displayName: null }] }),
    );
    user.person.$put.mockResolvedValue(ok(null));
    await renderScreen(<UserScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Ligar a uma pessoa: / }));
    await fireEvent.changeText(screen.getByLabelText("Pesquisar"), "ana");
    await fireEvent.press(await screen.findByRole("radio", { name: "Ana Maria Costa" }));
    await waitFor(() =>
      expect(user.person.$put).toHaveBeenCalledWith({
        param: { userId: "u2" },
        json: { personId: P1 },
      }),
    );
  });

  it("explains a person already linked to another account", async () => {
    m.people.$get.mockResolvedValue(
      ok({ people: [{ id: P1, fullName: "Ana Maria Costa", displayName: null }] }),
    );
    user.person.$put.mockResolvedValue(fail("person_has_user"));
    await renderScreen(<UserScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Ligar a uma pessoa: / }));
    await fireEvent.changeText(screen.getByLabelText("Pesquisar"), "ana");
    await fireEvent.press(await screen.findByRole("radio", { name: "Ana Maria Costa" }));
    expect(await screen.findByText("Esta pessoa já está ligada a outra conta.")).toBeTruthy();
  });

  it("deactivates after confirming, and reactivates", async () => {
    user.active.$put.mockResolvedValue(ok(null));
    await renderScreen(<UserScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Desativar conta" }));
    expect(user.active.$put).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Desativar" }));
    await waitFor(() =>
      expect(user.active.$put).toHaveBeenCalledWith({
        param: { userId: "u2" },
        json: { active: false },
      }),
    );
  });

  it("offers reactivation for a deactivated account", async () => {
    user.$get.mockResolvedValue(ok({ user: { ...ana, deactivatedAt: "2026-10-10T10:00:00Z" } }));
    user.active.$put.mockResolvedValue(ok(null));
    await renderScreen(<UserScreen />);
    expect(
      await screen.findByText("Conta desativada a 10/10/2026. Não consegue entrar."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reativar conta" }));
    await waitFor(() =>
      expect(user.active.$put).toHaveBeenCalledWith({
        param: { userId: "u2" },
        json: { active: true },
      }),
    );
  });
});
