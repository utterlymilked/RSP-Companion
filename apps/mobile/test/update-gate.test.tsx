import { act, fireEvent, screen } from "@testing-library/react-native";
import * as Updates from "expo-updates";
import { Linking, Text } from "react-native";
import { setRequiredUpdate } from "../src/app-client";
import { UpdateGate } from "../src/features/updates/UpdateGate";
import { renderScreen } from "./render";

jest.mock("../src/auth/client", () => ({ isWeb: false, API_ORIGIN: "http://api.test" }));
jest.mock("expo-updates", () => ({
  isEnabled: true,
  runtimeVersion: "3",
  updateId: "11111111-2222",
  createdAt: new Date("2026-10-19T10:00:00Z"),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

const updates = Updates as jest.Mocked<typeof Updates>;
const requirements = (over = {}) => ({
  enforced: true,
  minRuntime: "3",
  minBuiltAt: null,
  downloadUrl: "https://dl.test/apk",
  served: null,
  ...over,
});
const serve = (body: unknown) =>
  jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));

const gate = () =>
  renderScreen(
    <UpdateGate>
      <Text>conteúdo da app</Text>
    </UpdateGate>,
  );

beforeEach(() => {
  setRequiredUpdate(null);
  updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false } as never);
});
afterEach(() => jest.restoreAllMocks());

describe("update gate (ADR 0028)", () => {
  it("applies a newer bundle at launch instead of waiting for the next start", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never);
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never);
    serve(requirements());
    await gate();
    await act(async () => {});
    expect(updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(updates.reloadAsync).toHaveBeenCalled();
  });

  it("opens the app when it is current", async () => {
    serve(requirements());
    await gate();
    expect(await screen.findByText("conteúdo da app")).toBeOnTheScreen();
  });

  it("blocks with a download button when the native runtime is below the minimum", async () => {
    serve(requirements({ minRuntime: "4" }));
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await gate();
    await fireEvent.press(await screen.findByRole("button", { name: "Descarregar nova versão" }));
    expect(open).toHaveBeenCalledWith("https://dl.test/apk");
    expect(screen.queryByText("conteúdo da app")).toBeNull();
  });

  it("blocks and applies the bundle when the server minimum is newer than this build", async () => {
    updates.checkForUpdateAsync
      .mockResolvedValueOnce({ isAvailable: false } as never) // at launch: nothing yet
      .mockResolvedValue({ isAvailable: true } as never); // the blocking screen asks again
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never);
    serve(requirements({ minBuiltAt: "2026-10-25T10:00:00.000Z" }));
    await gate();
    await act(async () => {});
    expect(await screen.findByText("É necessária uma atualização")).toBeOnTheScreen();
    expect(updates.reloadAsync).toHaveBeenCalled();
  });

  it("blocks when the server answers 426 to any request", async () => {
    serve(requirements());
    await gate();
    await screen.findByText("conteúdo da app");
    await act(async () => setRequiredUpdate("apk"));
    expect(await screen.findByText("É necessária uma atualização")).toBeOnTheScreen();
  });
});
