// Exports the Android JS bundle for over-the-air updates into dist-ota/<variant> (the API
// server serves the one of its stack, OTA_DIR). APP_VARIANT is `production` or `tester` and
// EXPO_PUBLIC_API_URL the server that variant's APK talks to (docs/adr/0020-build-variants.md).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const variant = process.env.APP_VARIANT;
if (variant !== "production" && variant !== "tester") {
  console.error("APP_VARIANT must be production or tester.");
  process.exit(1);
}
const out = `dist-ota/${variant}`;
if (!process.env.EXPO_PUBLIC_API_URL) {
  console.error("EXPO_PUBLIC_API_URL is required: it is baked into the bundle and the update URL.");
  process.exit(1);
}
const run = (args) =>
  execFileSync("pnpm", ["exec", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
mkdirSync(out, { recursive: true });
run(["expo", "export", "--platform", "android", "--output-dir", out]);
// The public Expo config goes into the update manifest (extra.expoClient).
writeFileSync(`${out}/expoConfig.json`, run(["expo", "config", "--json", "--type", "public"]));
console.log(`OTA export written to ${out}`);
