import { healthResponseSchema } from "@rsp/shared";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json()).status).toBe("ok");
  });
});
