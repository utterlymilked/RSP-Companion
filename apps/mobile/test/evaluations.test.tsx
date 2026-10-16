import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import EvaluationHistory from "../app/evaluation/[personId]";
import NewEvaluation from "../app/evaluation/new";
import NewEvaluationTemplate from "../app/evaluation/template";
import { api } from "../src/api";
import { renderScreen } from "./render";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ personId: "11111111-1111-4111-8111-111111111111" }),
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
    evaluations: {
      $get: jest.fn(),
      $post: jest.fn(),
      templates: { $get: jest.fn(), $post: jest.fn() },
    },
  },
}));

const PERSON = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = "22222222-2222-4222-8222-222222222222";
const CRITERION = "33333333-3333-4333-8333-333333333333";
const evaluations = jest.mocked(api.evaluations);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const coach = { permissions: ["evaluations.read", "evaluations.write"], roles: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(coach);
});

it("shows the history with scores and offers a new evaluation to evaluators", async () => {
  evaluations.$get.mockResolvedValue(
    ok({
      evaluations: [
        {
          id: "e1",
          evaluatedOn: "2026-10-01",
          templateName: "Sub-13",
          scaleMax: 5,
          comment: "Evoluiu.",
          scores: [{ criterionId: CRITERION, label: "Técnica", score: 4 }],
        },
      ],
    }),
  );
  await renderScreen(<EvaluationHistory />);
  expect(await screen.findByText("2026-10-01 · Sub-13")).toBeTruthy();
  expect(screen.getByText("Técnica 4/5 · Evoluiu.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Novo modelo" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Nova avaliação" }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/evaluation/new",
    params: { personId: PERSON },
  });
});

it("scores each criterion of the chosen template", async () => {
  evaluations.templates.$get.mockResolvedValue(
    ok({
      templates: [
        {
          id: TEMPLATE,
          name: "Sub-13",
          scaleMax: 5,
          active: true,
          criteria: [{ id: CRITERION, label: "Técnica", position: 0 }],
        },
      ],
    }),
  );
  evaluations.$post.mockResolvedValue(ok({}));
  await renderScreen(<NewEvaluation />);
  await fireEvent.press(await screen.findByRole("radio", { name: "Sub-13" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText(/pontue pelo menos um critério/)).toBeTruthy();
  expect(evaluations.$post).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("radio", { name: "4" }));
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(evaluations.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({
        personId: PERSON,
        templateId: TEMPLATE,
        scores: [{ criterionId: CRITERION, score: 4 }],
      }),
    }),
  );
});

it("creates a template from semicolon-separated criteria", async () => {
  evaluations.templates.$post.mockResolvedValue(ok({}));
  await renderScreen(<NewEvaluationTemplate />);
  await fireEvent.press(await screen.findByRole("button", { name: "Guardar" }));
  expect(await screen.findByText(/pelo menos um critério/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Nome do modelo"), "Sub-13");
  await fireEvent.changeText(screen.getByLabelText("Critérios"), "Técnica; Atitude");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(evaluations.templates.$post).toHaveBeenCalledWith({
      json: { name: "Sub-13", scaleMax: 5, criteria: ["Técnica", "Atitude"] },
    }),
  );
});
