/* eslint-disable @typescript-eslint/no-require-imports */
const makeConfig = require("../app.config.js") as (input: {
  config: Record<string, unknown>;
}) => Record<string, any>;

const base = { config: { ios: {}, android: {}, updates: {} } };

describe("build variants (ADR 0020)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("production is the club's app and keeps the store id", () => {
    process.env.APP_VARIANT = "production";
    process.env.EXPO_PUBLIC_API_URL = "https://prod.example.pt/";
    const config = makeConfig(base);
    expect(config.name).toBe("SFF RSC");
    expect(config.android.package).toBe("pt.realsportmassama.companion");
    expect(config.scheme).toBe("rsc");
    expect(config.updates.url).toBe("https://prod.example.pt/api/ota/manifest");
  });

  it("anything else is the tester app, installable next to production", () => {
    delete process.env.APP_VARIANT;
    process.env.EXPO_PUBLIC_API_URL = "https://staging.example.pt";
    const config = makeConfig(base);
    expect(config.name).toBe("SFF RSC Teste");
    expect(config.android.package).toBe("pt.realsportmassama.companion.teste");
    expect(config.ios.bundleIdentifier).toBe("pt.realsportmassama.companion.teste");
    expect(config.scheme).toBe("rsc-teste");
  });
});
