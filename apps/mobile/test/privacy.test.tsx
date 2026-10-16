import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Account from "../app/(app)/account";
import AuditLog from "../app/audit";
import PrivacyNotice from "../app/privacy";
import PersonPrivacy from "../app/privacy/[personId]";
import { api } from "../src/api";
import { signOut } from "../src/auth/session";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ personId: "child" }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
const mockMe = jest.fn();
jest.mock("../src/auth/session", () => ({
  useMe: () => ({ data: mockMe() }),
  signOut: jest.fn(async () => undefined),
}));
jest.mock("../src/i18n", () => ({ setLocale: jest.fn() }));
jest.mock("../src/api", () => ({
  api: {
    people: { ":personId": { guardians: { $get: jest.fn() } } },
    notifications: { preferences: { $get: jest.fn(), $put: jest.fn() } },
    "audit-log": { $get: jest.fn() },
    privacy: {
      subjects: { $get: jest.fn() },
      account: { delete: { $post: jest.fn() } },
      requests: { $post: jest.fn() },
      people: {
        ":personId": {
          consents: {
            $get: jest.fn(),
            $post: jest.fn(),
            ":kind": { revoke: { $post: jest.fn() } },
          },
          export: { $get: jest.fn() },
          erase: { $post: jest.fn() },
        },
      },
    },
  },
}));

const privacy = jest.mocked(api.privacy);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const guardian = {
  user: { id: "u1", email: "pai@example.test", name: "Pai Teste" },
  personId: "parent",
  permissions: [],
  roles: [{ role: "guardian", teamId: null, classId: null }],
};
const status = (imageRights: boolean) => ({
  personId: "child",
  minor: true,
  consents: [
    {
      kind: "image_rights",
      given: imageRights,
      grantedOn: imageRights ? "2026-10-01" : null,
      grantedByPersonId: imageRights ? "parent" : null,
      grantedByName: imageRights ? "Pai Teste" : null,
    },
    {
      kind: "transport",
      given: false,
      grantedOn: null,
      grantedByPersonId: null,
      grantedByName: null,
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(guardian);
  privacy.subjects.$get.mockResolvedValue(
    ok({
      subjects: [
        { id: "parent", fullName: "Pai Teste", relation: "self" },
        { id: "child", fullName: "Filho Teste", relation: "ward" },
      ],
    }),
  );
});

it("lets a guardian give image rights for a ward in their own name", async () => {
  privacy.people[":personId"].consents.$get.mockResolvedValue(ok(status(false)));
  privacy.people[":personId"].consents.$post.mockResolvedValue(ok(status(true)));
  await renderScreen(<PersonPrivacy />);
  await fireEvent.press(await screen.findByText(/Direitos de imagem/));
  await waitFor(() =>
    expect(privacy.people[":personId"].consents.$post).toHaveBeenCalledWith({
      param: { personId: "child" },
      json: expect.objectContaining({ kind: "image_rights", grantedByPersonId: "parent" }),
    }),
  );
  expect(await screen.findByText("Consentimento registado.")).toBeTruthy();
  // Guardians ask the office to erase; only the office erases.
  expect(screen.getByText("Pedir ao clube que apague os dados")).toBeTruthy();
  expect(screen.queryByText("Apagar todos os dados desta pessoa")).toBeNull();
});

it("lets the office erase a person after confirming", async () => {
  mockMe.mockReturnValue({
    ...guardian,
    personId: null,
    permissions: ["consents.read", "consents.write", "privacy.manage"],
  });
  privacy.subjects.$get.mockResolvedValue(ok({ subjects: [] }));
  privacy.people[":personId"].consents.$get.mockResolvedValue(ok(status(true)));
  privacy.people[":personId"].erase.$post.mockResolvedValue(
    ok({ erased: { files: 0, logins: 0 } }),
  );
  await renderScreen(<PersonPrivacy />);
  await fireEvent.press(await screen.findByText("Apagar todos os dados desta pessoa"));
  await fireEvent.press(screen.getByText("Apagar definitivamente"));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(privacy.people[":personId"].erase.$post).toHaveBeenCalledWith({
    param: { personId: "child" },
    json: {},
  });
});

it("deletes the account from the account screen and signs out", async () => {
  jest
    .mocked(api.notifications.preferences.$get)
    .mockResolvedValue(ok({ preferences: { push: true, email: false } }));
  privacy.account.delete.$post.mockResolvedValue(ok({ deleted: true }));
  await renderScreen(<Account />);
  expect(await screen.findByText("Filho Teste")).toBeTruthy();
  await fireEvent.press(screen.getByText("Eliminar a minha conta"));
  await fireEvent.press(screen.getByText("Pedir também ao clube que apague os meus dados"));
  await fireEvent.press(screen.getByText("Eliminar conta definitivamente"));
  await waitFor(() => expect(signOut).toHaveBeenCalled());
  expect(privacy.account.delete.$post).toHaveBeenCalledWith({ json: { eraseData: true } });
});

it("shows the audit log with names and actions", async () => {
  jest.mocked(api["audit-log"].$get).mockResolvedValue(
    ok({
      entries: [
        {
          id: "a1",
          occurredAt: "2026-10-16T09:30:00.000Z",
          action: "privacy.export",
          tier: "personal",
          actorName: "Pai Teste",
          subjectPersonName: "Filho Teste",
          subjectUserName: null,
        },
      ],
    }),
  );
  await renderScreen(<AuditLog />);
  expect(await screen.findByText("Cópia de dados descarregada")).toBeTruthy();
  expect(screen.getByText("2026-10-16 10:30 · Pai Teste · Filho Teste")).toBeTruthy();
  expect(screen.queryByText("Ver mais")).toBeNull();
});

it("shows the privacy notice with the push processors", async () => {
  await renderScreen(<PrivacyNotice />);
  expect(screen.getByText("Política de privacidade")).toBeTruthy();
  expect(screen.getByText(/Expo .*Apple .*Google/)).toBeTruthy();
});
