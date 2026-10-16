import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import Documents from "../app/(app)/documents";
import PersonDocuments from "../app/documents/[personId]";
import { api } from "../src/api";
import { pickFile, uploadDocument } from "../src/features/documents/upload";
import { renderScreen } from "./render";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ personId: "p1" }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
const mockMe = jest.fn();
jest.mock("../src/auth/session", () => ({ useMe: () => ({ data: mockMe() }) }));
jest.mock("../src/features/documents/upload", () => ({
  ...jest.requireActual("../src/features/documents/upload"),
  pickFile: jest.fn(),
  takePhoto: jest.fn(),
  uploadDocument: jest.fn(),
}));
jest.mock("../src/api", () => ({
  api: {
    people: { $get: jest.fn() },
    documents: {
      expiring: { $get: jest.fn() },
      people: { ":personId": { $get: jest.fn() } },
      ":documentId": { url: { $get: jest.fn() }, $delete: jest.fn() },
    },
  },
}));

const documents = jest.mocked(api.documents);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const secretaria = { permissions: ["documents.read", "documents.write"], roles: [] };
const doc = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  personId: "p1",
  kind: "id_document",
  title: null,
  issuedOn: null,
  expiresOn: "2020-01-01",
  fileName: "cc.pdf",
  contentType: "application/pdf",
  sizeBytes: 10,
  createdAt: "2026-10-01T00:00:00Z",
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(secretaria);
});

it("lists expired documents first and opens the person's documents", async () => {
  documents.expiring.$get.mockResolvedValue(
    ok({
      documents: [
        {
          personId: "p1",
          fullName: "Pessoa Teste",
          kind: "id_document",
          expiresOn: "2020-01-01",
          status: "expired",
        },
      ],
    }),
  );
  await renderScreen(<Documents />);
  await fireEvent.press(await screen.findByText("Pessoa Teste"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/documents/[personId]",
    params: { personId: "p1" },
  });
  expect(screen.getByText(/Caducou em 2020-01-01/)).toBeTruthy();
});

it("uploads a picked file with its kind and expiry, then reloads the list", async () => {
  documents.people[":personId"].$get.mockResolvedValue(ok({ documents: [doc()], canUpload: true }));
  jest
    .mocked(pickFile)
    .mockResolvedValue({ uri: "file:///cc.pdf", name: "novo.pdf", type: "application/pdf" });
  jest.mocked(uploadDocument).mockResolvedValue({});
  await renderScreen(<PersonDocuments />);

  await fireEvent.press(await screen.findByText("Escolher ficheiro"));
  await fireEvent.changeText(await screen.findByLabelText("Caduca em (opcional)"), "2027-01-31");
  await fireEvent.press(screen.getByText("Enviar"));

  await waitFor(() =>
    expect(uploadDocument).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "novo.pdf" }),
      expect.objectContaining({ kind: "federation_registration", expiresOn: "2027-01-31" }),
    ),
  );
  await waitFor(() => expect(documents.people[":personId"].$get).toHaveBeenCalledTimes(2));
});

it("opens a document through a signed link", async () => {
  documents.people[":personId"].$get.mockResolvedValue(ok({ documents: [doc()], canUpload: true }));
  documents[":documentId"].url.$get.mockResolvedValue(
    ok({ url: "/api/documents/files/abc", expiresAt: "x" }),
  );
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await renderScreen(<PersonDocuments />);
  await fireEvent.press(await screen.findByText("Documento de identificação"));
  await waitFor(() => expect(open).toHaveBeenCalledWith("http://api.test/api/documents/files/abc"));
});

it("shows coaches the list without upload or delete", async () => {
  mockMe.mockReturnValue({ permissions: ["documents.read"], roles: [] });
  documents.people[":personId"].$get.mockResolvedValue(ok({ documents: [doc()], canUpload: true }));
  await renderScreen(<PersonDocuments />);
  await screen.findByText("Documento de identificação");
  expect(screen.queryByText("Escolher ficheiro")).toBeNull();
  expect(screen.queryByText(/Apagar/)).toBeNull();
});
