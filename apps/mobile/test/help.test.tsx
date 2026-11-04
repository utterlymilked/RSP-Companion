import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import InvitesManual from "../app/invites-manual";
import ProdApp from "../app/prod-app";
import { openAllowedLink, PROD_APK_URL, PROD_WEB_URL } from "../src/features/help/links";
import { moreItems } from "../src/navigation";
import { renderScreen } from "./render";

let mockStaging = true;
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
jest.mock("../src/auth/session", () => ({
  meQueryKey: ["me"],
  useMe: () => ({
    data: { user: { id: "u1" }, permissions: ["users.manage"], modules: ["users"] },
  }),
}));
jest.mock("../src/features/help/useIsStaging", () => ({ useIsStaging: () => mockStaging }));

const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
beforeEach(() => {
  open.mockClear();
  mockStaging = true;
});

it("shows the invitations manual", async () => {
  await renderScreen(<InvitesManual />);
  expect(await screen.findByText("Manual: convidar pessoas")).toBeTruthy();
  expect(screen.getByText("Quem pode convidar")).toBeTruthy();
  expect(screen.getByText("Se algo correr mal")).toBeTruthy();
});

it("lists the manual for users.manage only", () => {
  const keys = (p: never[]) => moreItems(p, ["users"]).management.map((i) => i.key);
  expect(keys(["users.manage"] as never)).toContain("invitesManual");
  expect(keys([])).not.toContain("invitesManual");
  expect(moreItems(["users.manage"], []).management.map((i) => i.key)).not.toContain(
    "invitesManual",
  );
});

it("opens only the fixed production addresses", async () => {
  await renderScreen(<ProdApp />);
  await fireEvent.press(await screen.findByRole("button", { name: /Abrir a versão web/ }));
  expect(open).toHaveBeenCalledWith(PROD_WEB_URL);
  await fireEvent.press(screen.getByRole("button", { name: /Descarregar a app Android/ }));
  expect(open).toHaveBeenCalledWith(PROD_APK_URL);
});

it("refuses any other address", async () => {
  expect(await openAllowedLink("https://evil.example/app.apk")).toBe(false);
  expect(await openAllowedLink(`${PROD_WEB_URL}/../x`)).toBe(false);
  expect(open).not.toHaveBeenCalled();
});

it("is for staging only on the native app", async () => {
  mockStaging = false;
  await renderScreen(<ProdApp />);
  expect(await screen.findByText("redirect:/")).toBeTruthy();
});
