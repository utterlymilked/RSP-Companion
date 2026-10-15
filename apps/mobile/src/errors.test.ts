import { ApiRequestError, errorKey, jsonOrThrow } from "./errors";

describe("errorKey", () => {
  it("maps our API codes", () => {
    expect(errorKey(new ApiRequestError("invitation_invalid", 400))).toBe(
      "errors.invitation_invalid",
    );
  });

  it("maps Better Auth codes and rate limits", () => {
    expect(errorKey({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe(
      "errors.invalid_credentials",
    );
    expect(errorKey({ status: 429 })).toBe("errors.rate_limited");
  });

  it("treats a failed fetch as a network problem and anything else as generic", () => {
    expect(errorKey(new TypeError("Network request failed"))).toBe("errors.network");
    expect(errorKey({ code: "SOMETHING_NEW" })).toBe("errors.generic");
    expect(errorKey("boom")).toBe("errors.generic");
  });
});

describe("jsonOrThrow", () => {
  const response = (status: number, body: unknown) => ({
    ok: status < 300,
    status,
    json: async () => body,
  });

  it("returns the body of a 2xx response", async () => {
    await expect(jsonOrThrow(response(200, { a: 1 }))).resolves.toEqual({ a: 1 });
  });

  it("throws the API's error code otherwise", async () => {
    await expect(
      jsonOrThrow(response(403, { error: { code: "forbidden" } })),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });
});
