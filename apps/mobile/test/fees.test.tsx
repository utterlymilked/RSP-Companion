import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import Fees from "../app/(app)/fees";
import ChargeDetail from "../app/fee/[chargeId]";
import { api } from "../src/api";
import { renderScreen } from "./render";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ chargeId: "c1" }),
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
    fees: {
      charges: {
        $get: jest.fn(),
        ":chargeId": {
          $get: jest.fn(),
          payments: { $post: jest.fn() },
          cancel: { $post: jest.fn() },
        },
      },
    },
  },
}));

const fees = jest.mocked(api.fees);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const treasurer = { permissions: ["fees.read", "fees.write"], roles: [] };
const charge = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  personName: "Pessoa Teste",
  description: "Mensalidade outubro",
  kind: "monthly",
  dueDate: "2026-10-08",
  netCents: 2000,
  paidCents: 500,
  balanceCents: 1500,
  status: "overdue",
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.mockReturnValue(treasurer);
});

it("lists charges with the balance and filters by status", async () => {
  fees.charges.$get.mockResolvedValue(ok({ charges: [charge()] }));
  await renderScreen(<Fees />);
  expect(await screen.findByText("Pessoa Teste · Mensalidade outubro")).toBeTruthy();
  expect(screen.getByText("Em atraso · 2026-10-08")).toBeTruthy();
  expect(screen.getByText("15,00 €")).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Em atraso" }));
  await waitFor(() =>
    expect(fees.charges.$get).toHaveBeenLastCalledWith({ query: { status: "overdue" } }),
  );
});

it("records a payment in cents from the charge screen", async () => {
  fees.charges[":chargeId"].$get.mockResolvedValue(
    ok({
      charge: charge(),
      payments: [
        { id: "p1", receiptNumber: 7, method: "cash", paidOn: "2026-10-02", amountCents: 500 },
      ],
    }),
  );
  fees.charges[":chargeId"].payments.$post.mockResolvedValue(ok({}));
  await renderScreen(<ChargeDetail />);
  expect(await screen.findByText("Recibo 7 · Numerário")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Registar pagamento" }));
  expect(await screen.findByText("Indique um valor.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Valor recebido em euros"), "15,00");
  await fireEvent.press(screen.getByRole("button", { name: "Registar pagamento" }));
  await waitFor(() =>
    expect(fees.charges[":chargeId"].payments.$post).toHaveBeenCalledWith({
      param: { chargeId: "c1" },
      json: { amountCents: 1500, method: "cash" },
    }),
  );
});

it("hides payment actions from readers", async () => {
  mockMe.mockReturnValue({ permissions: ["fees.read"], roles: [] });
  fees.charges[":chargeId"].$get.mockResolvedValue(ok({ charge: charge(), payments: [] }));
  await renderScreen(<ChargeDetail />);
  expect(await screen.findByText("Ainda sem pagamentos.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Registar pagamento" })).toBeNull();
});
