import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { api } from "../src/api";
import { FeedbackWidget } from "../src/features/feedback/FeedbackWidget";
import { renderScreen } from "./render";

let mockPermissions: string[] = ["feedback.submit"];
jest.mock("expo-router", () => ({
  usePathname: () => "/booking/new",
  useGlobalSearchParams: () => ({ space: "s1" }),
}));
jest.mock("../src/auth/session", () => ({
  meQueryKey: ["me"],
  useMe: () => ({ data: { user: { id: "u1" }, permissions: mockPermissions } }),
}));
jest.mock("../src/api", () => ({ api: { feedback: { $post: jest.fn() } } }));

const post = api.feedback.$post as unknown as jest.Mock;

describe("feedback widget", () => {
  beforeEach(() => {
    mockPermissions = ["feedback.submit"];
    post.mockReset().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "f1" }) });
  });

  it("is hidden from users who cannot send feedback", async () => {
    mockPermissions = ["bookings.read"];
    await renderScreen(<FeedbackWidget />);
    expect(screen.queryByTestId("feedback-widget")).toBeNull();
  });

  it("sends the note with the screen the tester was on", async () => {
    await renderScreen(<FeedbackWidget />);
    await fireEvent.press(await screen.findByRole("button", { name: "Abrir feedback" }));
    await fireEvent.changeText(
      await screen.findByLabelText("O que aconteceu ou o que sugere?"),
      "Falta o botão de cancelar",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0].json).toMatchObject({
      kind: "bug",
      message: "Falta o botão de cancelar",
      route: "/booking/new?space=s1",
      viewport: { width: 750, height: 1334 },
    });
  });
});
