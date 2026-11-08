import { MODULE_IDS } from "@rsc/shared";
import en from "../src/i18n/en.json";
import ptPT from "../src/i18n/pt-PT.json";

type Items = Record<string, { name?: string; description?: string }>;

describe("module translations", () => {
  for (const [locale, json] of [
    ["pt-PT", ptPT],
    ["en", en],
  ] as const) {
    it(`${locale} has a name and description for every module`, () => {
      const items = (json as unknown as { modules: { items: Items } }).modules.items;
      const missing = MODULE_IDS.flatMap((id) =>
        (["name", "description"] as const)
          .filter((field) => !items[id]?.[field])
          .map((field) => `modules.items.${id}.${field}`),
      );
      expect(missing).toEqual([]);
    });
  }
});
