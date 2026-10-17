import { apiOrigin, parseServerUrl } from "./config";

describe("apiOrigin", () => {
  it("uses the configured URL without a trailing slash", () => {
    expect(apiOrigin("https://rsc.example/", "ios", undefined)).toBe("https://rsc.example");
  });

  it("falls back to the page's origin on web", () => {
    expect(apiOrigin(undefined, "web", "http://localhost:8081")).toBe("http://localhost:8081");
  });

  it("requires a URL on native", () => {
    expect(() => apiOrigin(undefined, "android", undefined)).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});

describe("server override and parseServerUrl", () => {
  it("prefers a saved server on native but never on web", () => {
    expect(apiOrigin("https://a.test", "android", undefined, "https://b.test/")).toBe(
      "https://b.test",
    );
    expect(apiOrigin(undefined, "web", "https://c.test", "https://b.test")).toBe("https://c.test");
  });

  it("accepts https (and http only on a LAN) and drops the path", () => {
    expect(parseServerUrl(" https://x.sslip.io/api ")).toBe("https://x.sslip.io");
    expect(parseServerUrl("http://192.168.1.5:3000")).toBe("http://192.168.1.5:3000");
    expect(parseServerUrl("http://evil.test")).toBeNull();
    expect(parseServerUrl("nope")).toBeNull();
  });
});
