import { formatEuros, parseEuros } from "./money";

it("formats and parses euro amounts", () => {
  expect(formatEuros(1234)).toBe("12,34 €");
  expect(formatEuros(5)).toBe("0,05 €");
  expect(parseEuros("12,5")).toBe(1250);
  expect(parseEuros("12.50")).toBe(1250);
  expect(parseEuros("")).toBeNull();
  expect(parseEuros("abc")).toBeNull();
  expect(parseEuros("-1")).toBeNull();
});
