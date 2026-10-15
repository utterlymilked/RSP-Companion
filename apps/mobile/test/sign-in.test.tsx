import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import SignIn from "../app/sign-in";
import { authClient } from "../src/auth/client";
import { renderScreen } from "./render";

jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
  authClient: { signIn: { email: jest.fn(), magicLink: jest.fn() } },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

const signIn = jest.mocked(authClient.signIn);

beforeEach(() => jest.clearAllMocks());

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Palavra-passe"), password);
}

it("asks for the missing fields before calling the server", async () => {
  await renderScreen(<SignIn />);
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findAllByText("Campo obrigatório.")).toHaveLength(2);
  expect(signIn.email).not.toHaveBeenCalled();
});

it("signs in with email and password and reloads the session", async () => {
  signIn.email.mockResolvedValue({ data: {}, error: null } as never);
  const { queryClient } = await renderScreen(<SignIn />);
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  await fill(" ana@rsp.test ", "secret-password");
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
  await waitFor(() =>
    expect(signIn.email).toHaveBeenCalledWith({
      email: "ana@rsp.test",
      password: "secret-password",
    }),
  );
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] }));
});

it("shows a translated message for wrong credentials", async () => {
  signIn.email.mockResolvedValue({
    data: null,
    error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
  } as never);
  await renderScreen(<SignIn />);
  await fill("ana@rsp.test", "wrong-password");
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByText("Email ou palavra-passe errados.")).toBeTruthy();
});

it("sends a magic link back to the app", async () => {
  signIn.magicLink.mockResolvedValue({ data: {}, error: null } as never);
  await renderScreen(<SignIn />);
  await fill("ana@rsp.test", "");
  await fireEvent.press(screen.getByRole("button", { name: "Enviar link de acesso por email" }));
  expect(await screen.findByText(/Enviámos um link de acesso/)).toBeTruthy();
  expect(signIn.magicLink).toHaveBeenCalledWith({ email: "ana@rsp.test", callbackURL: "/" });
});
