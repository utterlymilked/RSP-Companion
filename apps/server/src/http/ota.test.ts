import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { otaRoutes } from "./ota.js";

function exportDir() {
  const dir = mkdtempSync(join(tmpdir(), "rsc-ota-"));
  mkdirSync(join(dir, "_expo"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "_expo", "entry.hbc"), "bundle-bytes");
  writeFileSync(join(dir, "assets", "abc"), "png-bytes");
  writeFileSync(
    join(dir, "metadata.json"),
    JSON.stringify({
      fileMetadata: {
        android: { bundle: "_expo/entry.hbc", assets: [{ path: "assets/abc", ext: "png" }] },
      },
    }),
  );
  writeFileSync(join(dir, "expoConfig.json"), JSON.stringify({ name: "RSC", runtimeVersion: "1" }));
  return dir;
}

const headers = (extra: Record<string, string> = {}) => ({
  "expo-platform": "android",
  "expo-runtime-version": "1",
  "expo-protocol-version": "1",
  ...extra,
});

const parts = (body: string) => JSON.parse(body.split("\r\n\r\n")[1]?.split("\r\n--")[0] ?? "");

describe("otaRoutes", () => {
  const app = otaRoutes({ dir: exportDir(), baseUrl: "https://rsc.test" });

  it("offers the update to a matching runtime", async () => {
    const res = await app.request("/manifest", { headers: headers() });
    expect(res.headers.get("content-type")).toMatch(/^multipart\/mixed; boundary=/);
    const text = await res.text();
    const manifest = parts(text);
    expect(manifest.runtimeVersion).toBe("1");
    expect(manifest.launchAsset.url).toMatch(
      /^https:\/\/rsc\.test\/api\/ota\/assets\/[0-9a-f]{32}$/,
    );
    expect(manifest.launchAsset.contentType).toBe("application/javascript");
    expect(manifest.assets[0].contentType).toBe("image/png");
    expect(manifest.extra.expoClient.name).toBe("RSC");
    const asset = await app.request(
      new URL(manifest.assets[0].url).pathname.replace("/api/ota", ""),
    );
    expect(await asset.text()).toBe("png-bytes");
  });

  it("answers noUpdateAvailable for another runtime, platform or the current update", async () => {
    const first = await app.request("/manifest", { headers: headers() });
    const id = parts(await first.text()).id;
    for (const h of [
      headers({ "expo-runtime-version": "2" }),
      headers({ "expo-platform": "ios" }),
      headers({ "expo-current-update-id": id }),
    ]) {
      expect(await (await app.request("/manifest", { headers: h })).text()).toContain(
        "noUpdateAvailable",
      );
    }
  });

  it("serves only listed assets", async () => {
    expect((await app.request("/assets/..%2Fmetadata.json")).status).toBe(404);
  });

  it("is empty without an export", async () => {
    const empty = otaRoutes({ dir: mkdtempSync(join(tmpdir(), "rsc-ota-")), baseUrl: "https://x" });
    expect((await empty.request("/manifest", { headers: headers() })).status).toBe(404);
  });
});
