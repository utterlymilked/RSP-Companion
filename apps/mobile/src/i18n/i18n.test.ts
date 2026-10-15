import en from "./en.json";
import { deviceLocale } from "./index";
import ptPT from "./pt-PT.json";

/** Every key path of a nested translation object, e.g. "auth.signIn". */
function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

it("has the same keys in Portuguese and English", () => {
  expect(keys(en).sort()).toEqual(keys(ptPT).sort());
});

it("translates every role and API error code", () => {
  const { ROLES, API_ERROR_CODES } = jest.requireActual("@rsp/shared");
  const all = keys(ptPT);
  for (const role of ROLES) expect(all).toContain(`roles.${role}`);
  for (const code of API_ERROR_CODES) expect(all).toContain(`errors.${code}`);
});

it("picks the device language when supported, Portuguese otherwise", () => {
  expect(deviceLocale(["en"])).toBe("en");
  expect(deviceLocale(["pt"])).toBe("pt-PT");
  expect(deviceLocale(["fr", "en"])).toBe("en");
  expect(deviceLocale(["fr", null])).toBe("pt-PT");
});
