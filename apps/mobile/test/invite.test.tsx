import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import Invite from "../app/invite";
import { api } from "../src/api";
import { authClient } from "../src/auth/client";
import { useMe } from "../src/auth/session";
import { renderScreen } from "./render";

jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
  authClient: { signIn: { email: jest.fn() } },
}));
jest.mock("../src/auth/session", () => ({
  meQueryKey: ["me"],
  useMe: jest.fn(),
  refreshSession: jest.fn(async () => undefined),
}));
jest.mock("../src/api", () => ({ api: { invitations: { accept: { $post: jest.fn() } } } }));
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    useLocalSearchParams: jest.fn(),
  };
});

const params = jest.mocked(useLocalSearchParams);
const me = jest.mocked(useMe);
const accept = jest.mocked(api.invitations.accept.$post);
const signIn = jest.mocked(authClient.signIn.email);

const ok = (body: unknown) => ({ ok: true, status: 201, json: async () => body }) as never;
const fail = (code: string) =>
  ({ ok: false, status: 400, json: async () => ({ error: { code } }) }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({ token: "t".repeat(32) });
  me.mockReturnValue({ data: null } as never);
});

async function fill() {
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Ana");
  await fireEvent.changeText(screen.getByLabelText("Palavra-passe"), "correct-horse-battery");
  await fireEvent.changeText(
    screen.getByLabelText("Confirmar palavra-passe"),
    "correct-horse-battery",
  );
}

async function fillAndSubmit() {
  await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
}

it("explains a link without a token", async () => {
  params.mockReturnValue({});
  await renderScreen(<Invite />);
  expect(screen.getByText(/Este link está incompleto/)).toBeTruthy();
});

it("checks the password rules before creating the account", async () => {
  await renderScreen(<Invite />);
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Ana");
  await fireEvent.changeText(screen.getByLabelText("Palavra-passe"), "short");
  await fireEvent.changeText(screen.getByLabelText("Confirmar palavra-passe"), "different");
  await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByText(/pelo menos 10 caracteres/)).toBeTruthy();
  expect(screen.getByText("As palavras-passe não coincidem.")).toBeTruthy();
  expect(accept).not.toHaveBeenCalled();
});

it("sends the request once however often the button is pressed, and shows a spinner", async () => {
  let release: (value: never) => void = () => {};
  accept.mockReturnValue(new Promise((resolve) => (release = resolve)) as never);
  signIn.mockResolvedValue({ error: null } as never);
  await renderScreen(<Invite />);
  await fill();
  // The handler is async: pressing does not wait for it, so the request is still in flight.
  const press = fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Criar conta" })).toBeDisabled();
  // Enter in the last field submits too; it must not send a second request.
  fireEvent(screen.getByLabelText("Confirmar palavra-passe"), "submitEditing");

  release(ok({ userId: "u1", email: "ana@example.pt" }));
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
  expect(signIn).toHaveBeenCalledWith({
    email: "ana@example.pt",
    password: "correct-horse-battery",
  });
  await press;
  expect(accept).toHaveBeenCalledTimes(1);
});

it("leaves the invite screen once signed in", async () => {
  me.mockReturnValue({ data: { user: { id: "u1" } } } as never);
  await renderScreen(<Invite />);
  expect(screen.getByText("redirect:/")).toBeTruthy();
});

it("tells the user when the account was created but signing in failed, and allows a retry", async () => {
  accept.mockResolvedValue(ok({ userId: "u1", email: "ana@example.pt" }));
  signIn.mockResolvedValueOnce({ error: { status: 500 } } as never);
  await renderScreen(<Invite />);
  await fillAndSubmit();
  expect(await screen.findByText(/A conta foi criada, mas não conseguimos/)).toBeTruthy();

  signIn.mockResolvedValueOnce({ error: null } as never);
  await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
  expect(accept).toHaveBeenCalledTimes(2);
});

it("shows why an invitation cannot be used", async () => {
  accept.mockResolvedValue(fail("invitation_invalid"));
  await renderScreen(<Invite />);
  await fillAndSubmit();
  expect(await screen.findByText(/Este convite já foi usado ou expirou/)).toBeTruthy();
  expect(signIn).not.toHaveBeenCalled();
});
