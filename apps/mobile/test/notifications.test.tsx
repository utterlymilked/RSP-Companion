import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Notifications from "../app/(app)/notifications";
import NewAnnouncement from "../app/announcement/new";
import { api } from "../src/api";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
}));
jest.mock("../src/auth/client", () => ({
  isWeb: false,
  API_ORIGIN: "http://api.test",
  sessionHeaders: async () => ({}),
}));
const mockMe = jest.fn();
jest.mock("../src/auth/session", () => ({ useMe: () => ({ data: mockMe() }) }));
jest.mock("../src/api", () => ({
  api: {
    teams: { $get: jest.fn() },
    announcements: { $post: jest.fn() },
    notifications: {
      $get: jest.fn(),
      "read-all": { $post: jest.fn() },
      ":notificationId": { read: { $post: jest.fn() } },
    },
  },
}));

const TEAM = "33333333-3333-4333-8333-333333333333";
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const office = {
  permissions: ["announcements.write"],
  roles: [{ role: "admin", teamId: null, classId: null }],
};
const coach = {
  permissions: ["announcements.write"],
  roles: [{ role: "coach", teamId: TEAM, classId: null }],
};
const entry = (extra: Record<string, unknown> = {}) => ({
  id: "n1",
  kind: "callup",
  title: "Nova convocatória",
  body: null,
  link: "/event/e1",
  readAt: null,
  createdAt: "2026-10-20T17:30:00.000Z",
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(office);
  jest.mocked(api.teams.$get).mockResolvedValue(ok({ teams: [{ id: TEAM, name: "Sub-13" }] }));
});

it("shows the inbox, marks an entry read and opens its link", async () => {
  jest
    .mocked(api.notifications.$get)
    .mockResolvedValue(ok({ notifications: [entry()], unread: 1 }));
  jest.mocked(api.notifications[":notificationId"].read.$post).mockResolvedValue(ok({}));
  await renderScreen(<Notifications />);
  await fireEvent.press(await screen.findByText("Nova convocatória"));
  await waitFor(() =>
    expect(api.notifications[":notificationId"].read.$post).toHaveBeenCalledWith({
      param: { notificationId: "n1" },
    }),
  );
  expect(mockPush).toHaveBeenCalledWith("/event/e1");
});

it("marks everything read and shows an empty inbox", async () => {
  jest
    .mocked(api.notifications.$get)
    .mockResolvedValueOnce(ok({ notifications: [entry(), entry({ id: "n2" })], unread: 2 }));
  jest.mocked(api.notifications["read-all"].$post).mockResolvedValue(ok({}));
  await renderScreen(<Notifications />);
  await fireEvent.press(await screen.findByText("Marcar tudo como lido (2)"));
  await waitFor(() => expect(api.notifications["read-all"].$post).toHaveBeenCalled());
});

it("hides the new-announcement button from those who may not write", async () => {
  jest.mocked(api.notifications.$get).mockResolvedValue(ok({ notifications: [], unread: 0 }));
  mockMe.mockReturnValue({ permissions: [], roles: [] });
  await renderScreen(<Notifications />);
  expect(await screen.findByText("Sem avisos.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo aviso" })).toBeNull();
});

it("opens the announcement form for those who may write", async () => {
  jest.mocked(api.notifications.$get).mockResolvedValue(ok({ notifications: [], unread: 0 }));
  await renderScreen(<Notifications />);
  await fireEvent.press(await screen.findByRole("button", { name: "Novo aviso" }));
  expect(mockPush).toHaveBeenCalledWith("/announcement/new");
});

it("sends a club announcement from the office", async () => {
  jest.mocked(api.announcements.$post).mockResolvedValue(ok({ delivered: 3 }));
  await renderScreen(<NewAnnouncement />);
  await fireEvent.changeText(screen.getByLabelText("Título"), "Jantar");
  await fireEvent.changeText(screen.getByLabelText("Mensagem"), "Sábado às 20h");
  await fireEvent.press(screen.getByText("Enviar aviso"));
  await waitFor(() =>
    expect(api.announcements.$post).toHaveBeenCalledWith({
      json: { title: "Jantar", body: "Sábado às 20h", teamId: null },
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});

it("makes a coach pick a team before sending", async () => {
  mockMe.mockReturnValue(coach);
  jest.mocked(api.announcements.$post).mockResolvedValue(ok({ delivered: 1 }));
  await renderScreen(<NewAnnouncement />);
  await fireEvent.changeText(screen.getByLabelText("Título"), "Treino");
  await fireEvent.changeText(screen.getByLabelText("Mensagem"), "Adiado");
  await fireEvent.press(screen.getByText("Enviar aviso"));
  expect(await screen.findByText(/Escolha o destino/)).toBeTruthy();
  expect(api.announcements.$post).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByText("Sub-13"));
  await fireEvent.press(screen.getByText("Enviar aviso"));
  await waitFor(() =>
    expect(api.announcements.$post).toHaveBeenCalledWith({
      json: { title: "Treino", body: "Adiado", teamId: TEAM },
    }),
  );
});
