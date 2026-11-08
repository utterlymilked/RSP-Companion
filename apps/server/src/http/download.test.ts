import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { downloadRoutes } from "./download.js";

describe("downloadRoutes", () => {
  const dir = mkdtempSync(join(tmpdir(), "rsc-apk-"));
  writeFileSync(join(dir, "android.apk"), "0123456789");
  const app = downloadRoutes({ dir });

  it("serves the APK as a download", async () => {
    const res = await app.request("/android.apk");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-length")).toBe("10");
    expect(await res.text()).toBe("0123456789");
  });

  it("answers HEAD without a body", async () => {
    const res = await app.request("/android.apk", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("10");
  });

  it("resumes with byte ranges", async () => {
    const res = await app.request("/android.apk", { headers: { range: "bytes=4-" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 4-9/10");
    expect(await res.text()).toBe("456789");
    const tail = await app.request("/android.apk", { headers: { range: "bytes=-3" } });
    expect(await tail.text()).toBe("789");
    const bad = await app.request("/android.apk", { headers: { range: "bytes=50-" } });
    expect(bad.status).toBe(416);
  });

  it("is 404 when no APK was published", async () => {
    const empty = downloadRoutes({ dir: mkdtempSync(join(tmpdir(), "rsc-apk-")) });
    expect((await empty.request("/android.apk")).status).toBe(404);
  });
});
