import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import SignUp from "../app/sign-up";
import { api } from "../src/api";
import { authClient } from "../src/auth/client";
import { renderScreen } from "./render";

jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
  authClient: { signUp: { email: jest.fn() } },
}));
jest.mock("../src/auth/altcha", () => ({ solveChallenge: () => "solved" }));
jest.mock("../src/api", () => ({
  api: { registration: { config: { $get: jest.fn() }, challenge: { $get: jest.fn() } } },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

const config = jest.mocked(api.registration.config.$get);
const challenge = jest.mocked(api.registration.challenge.$get);
const signUp = jest.mocked(authClient.signUp.email);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  challenge.mockResolvedValue(ok({ algorithm: "SHA-256" }));
});

it("says registration is closed when the server says so", async () => {
  config.mockResolvedValue(ok({ open: false, keyRequired: false, paused: false }));
  await renderScreen(<SignUp />);
  expect(await screen.findByText("O registo está fechado.")).toBeTruthy();
});

it("sends the proof and the key, then asks to check the email", async () => {
  config.mockResolvedValue(ok({ open: true, keyRequired: true, paused: false }));
  signUp.mockResolvedValue({ data: { ok: true }, error: null } as never);
  await renderScreen(<SignUp />);
  await fireEvent.changeText(await screen.findByLabelText("Nome"), "Ana");
  await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.test");
  await fireEvent.changeText(screen.getByLabelText("Palavra-passe"), "correct-horse-battery");
  await fireEvent.changeText(
    screen.getByLabelText("Confirmar palavra-passe"),
    "correct-horse-battery",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Chave de registo (testadores)"),
    "k".repeat(16),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Registar" }));
  expect(await screen.findByText("Aceite o aviso de privacidade para continuar.")).toBeTruthy();
  expect(signUp).not.toHaveBeenCalled();
  await fireEvent(screen.getByLabelText("Li o aviso de privacidade"), "valueChange", true);
  await fireEvent.press(screen.getByRole("button", { name: "Registar" }));
  await waitFor(() => expect(signUp).toHaveBeenCalled());
  expect(signUp.mock.calls[0]?.[0]).toMatchObject({
    email: "ana@example.test",
    fetchOptions: { headers: { "x-altcha": "solved", "x-registration-key": "k".repeat(16) } },
  });
  expect(await screen.findByText("Verifique o seu email")).toBeTruthy();
});
