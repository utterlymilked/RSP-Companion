import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import TrialRequest from "../app/trial-request";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock("../src/api", () => ({
  api: { "trial-requests": { $post: jest.fn() } },
}));

const post = api["trial-requests"].$post as unknown as jest.Mock;

describe("public trial request", () => {
  it("asks for the privacy consent and a contact before sending", async () => {
    await renderScreen(<TrialRequest />);
    fireEvent.changeText(screen.getByLabelText("Nome completo"), "Jogador Teste");
    fireEvent.press(screen.getByText("Enviar pedido"));
    expect(await screen.findByText("É preciso aceitar o tratamento de dados.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});
