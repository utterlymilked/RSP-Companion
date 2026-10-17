// Production build: bundles the server and its CLI scripts with esbuild. Workspace packages
// (@rsc/shared, consumed as TypeScript source) are bundled in; npm dependencies stay external
// and come from node_modules at runtime. Output keeps src/ layout, so dist/scripts/migrate.js
// still finds ../../drizzle.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@rsc/"));

await build({
  entryPoints: [
    "src/index.ts",
    "src/scripts/migrate.ts",
    "src/scripts/create-admin.ts",
    "src/scripts/seed.ts",
    "src/scripts/export-feedback.ts",
    "src/scripts/send-demo-code.ts",
    "src/scripts/grant-developer.ts",
  ],
  outbase: "src",
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: external.flatMap((name) => [name, `${name}/*`]),
  logLevel: "info",
});
