// Exports the Android JS bundle for over-the-air updates into dist-ota (served by the API
// server as OTA_DIR). EXPO_PUBLIC_API_URL must be the server the installed APK talks to.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const out = "dist-ota";
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
