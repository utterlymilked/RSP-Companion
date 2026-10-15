import { fireEvent, screen } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import Invite from "../app/invite";
import { renderScreen } from "./render";

jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
  authClient: { signIn: { email: jest.fn() } },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}));

const params = jest.mocked(useLocalSearchParams);

it("explains a link without a token", async () => {
  params.mockReturnValue({});
  await renderScreen(<Invite />);
  expect(screen.getByText(/Este link está incompleto/)).toBeTruthy();
});

it("checks the password rules before creating the account", async () => {
  params.mockReturnValue({ token: "t".repeat(32) });
  await renderScreen(<Invite />);
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Ana");
  await fireEvent.changeText(screen.getByLabelText("Palavra-passe"), "short");
  await fireEvent.changeText(screen.getByLabelText("Confirmar palavra-passe"), "different");
  await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByText(/pelo menos 10 caracteres/)).toBeTruthy();
  expect(screen.getByText("As palavras-passe não coincidem.")).toBeTruthy();
});
