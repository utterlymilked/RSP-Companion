import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Approvals from "../app/approvals";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("../src/api", () => ({
  api: { approvals: { $get: jest.fn(), ":approvalId": { decision: { $post: jest.fn() } } } },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

const list = jest.mocked(api.approvals.$get);
const decision = jest.mocked(api.approvals[":approvalId"].decision.$post);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;

const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "test",
  status: "pending",
  createdAt: "2026-10-24T10:00:00.000Z",
  decidedAt: null,
  subjectName: "Ana",
  reviewerName: null,
  reason: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue(ok({ entries: [entry] }));
  decision.mockResolvedValue({ ok: true, status: 204 } as never);
});

it("approves in one press", async () => {
  await renderScreen(<Approvals />);
  await fireEvent.press(await screen.findByRole("button", { name: "Aprovar" }));
  await waitFor(() =>
    expect(decision).toHaveBeenCalledWith({
      param: { approvalId: entry.id },
      json: { decision: "approve", reason: undefined },
    }),
  );
});

it("asks for a reason before rejecting", async () => {
  await renderScreen(<Approvals />);
  await fireEvent.press(await screen.findByRole("button", { name: "Recusar" }));
  expect(screen.getByRole("button", { name: "Confirmar recusa" })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText("Motivo (o requerente vê-o)"), "Dados em falta");
  await fireEvent.press(screen.getByRole("button", { name: "Confirmar recusa" }));
  await waitFor(() => expect(decision).toHaveBeenCalled());
  expect(decision.mock.calls[0]?.[0]?.json).toEqual({
    decision: "reject",
    reason: "Dados em falta",
  });
});
