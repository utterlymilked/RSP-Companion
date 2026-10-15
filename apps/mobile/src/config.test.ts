import { apiOrigin } from "./config";

describe("apiOrigin", () => {
  it("uses the configured URL without a trailing slash", () => {
    expect(apiOrigin("https://rsp.example/", "ios", undefined)).toBe("https://rsp.example");
  });

  it("falls back to the page's origin on web", () => {
    expect(apiOrigin(undefined, "web", "http://localhost:8081")).toBe("http://localhost:8081");
  });

  it("requires a URL on native", () => {
    expect(() => apiOrigin(undefined, "android", undefined)).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});
