import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import ImportScreen from "../app/(app)/import";
import { renderScreen } from "./render";

const mockSend = jest.fn();
jest.mock("../src/features/imports/files", () => ({
  pickSpreadsheet: async () => ({ uri: "file:///x.xlsx", name: "jogadores.xlsx" }),
  sendImport: (...args: unknown[]) => mockSend(...args),
  saveTemplate: jest.fn(),
}));

const report = (applied: boolean) => ({
  kind: "players",
  applied,
  counts: { create: 1, update: 0, unchanged: 0, error: 1 },
  rows: [
    { line: 2, status: "create", label: "Jogador 9", identityCode: "RSC-0A1B2C3D", error: null },
    { line: 3, status: "error", label: "Bia Teste", identityCode: null, error: "unknown_team" },
  ],
});

beforeEach(() => jest.clearAllMocks());

it("previews a spreadsheet with row errors, then applies it", async () => {
  mockSend.mockResolvedValueOnce(report(false)).mockResolvedValueOnce(report(true));
  await renderScreen(<ImportScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Escolher ficheiro Excel" }));

  expect(
    await screen.findByText("Equipa não encontrada nesta época.", { exact: false }),
  ).toBeTruthy();
  expect(screen.getByText("Jogador 9")).toBeTruthy();
  expect(mockSend).toHaveBeenCalledWith("players", expect.anything(), false);

  await fireEvent.press(screen.getByRole("button", { name: "Importar 1 linhas" }));
  await waitFor(() =>
    expect(mockSend).toHaveBeenLastCalledWith("players", expect.anything(), true),
  );
  expect(await screen.findByText("Importação concluída.")).toBeTruthy();
});
