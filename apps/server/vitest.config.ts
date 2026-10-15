import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local runs read DATABASE_URL / TEST_DATABASE_URL from the repo's .env, like `pnpm dev`.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
  },
});
