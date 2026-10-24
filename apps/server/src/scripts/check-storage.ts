import { randomUUID } from "node:crypto";
import { loadEnv } from "../env.js";
import { openEvidence, parseMasterKeys, sealEvidence } from "../modules/evidence/crypto.js";
import { createStorage } from "../storage/index.js";

// Runs in the app container (Ops task `check-storage`): uploads a small dummy object to the
// configured document storage, reads it back through a signed URL, then deletes it. It prints
// only the bucket name and the outcome of each step, never keys or the signed URL (the Actions
// logs are public).

const env = loadEnv();
const storage = createStorage(env);
if (!storage)
  throw new Error("No document storage configured: set STORAGE_S3_* (docs/OPERATIONS.md)");
console.log(
  `Storage: ${env.STORAGE_S3_BUCKET ? `bucket ${env.STORAGE_S3_BUCKET}` : "local directory"}`,
);

const key = `healthcheck/${randomUUID()}.txt`;
const body = new TextEncoder().encode(`rsc storage check ${new Date().toISOString()}`);
let failed = false;
const step = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    // Error names and messages from the S3 SDK carry no credentials.
    console.log(
      `FAIL ${name}: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"}`,
    );
  }
};

await step("upload", () => storage.put(key, body, "text/plain"));
await step("read via signed url", async () => {
  const url = await storage.signedUrl(key, {
    fileName: "check.txt",
    contentType: "text/plain",
    expiresInSeconds: 60,
  });
  // The local-directory storage hands out a path served by the app, not a full URL.
  if (!url.startsWith("http")) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (new TextDecoder().decode(await response.arrayBuffer()) !== new TextDecoder().decode(body)) {
    throw new Error("content differs");
  }
});
await step("delete", () => storage.delete(key));

// Identity evidence (ADR 0026): seal with the master key, store, read back, open, compare. Only
// ciphertext reaches the bucket; nothing here is printed.
if (!env.IDENTITY_DOCS_KEYS) {
  console.log("skip evidence round trip: IDENTITY_DOCS_KEYS not set");
} else {
  const plain = Buffer.from(`rsc evidence check ${new Date().toISOString()}`);
  const evidenceKey = `healthcheck/${randomUUID()}.bin`;
  const sealed = sealEvidence(parseMasterKeys(env.IDENTITY_DOCS_KEYS), plain);
  await step("evidence upload", () =>
    storage.put(evidenceKey, sealed.ciphertext, "application/octet-stream"),
  );
  await step("evidence read and decrypt", async () => {
    const url = await storage.signedUrl(evidenceKey, {
      fileName: "check.bin",
      contentType: "application/octet-stream",
      expiresInSeconds: 60,
    });
    if (!url.startsWith("http")) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const opened = openEvidence(parseMasterKeys(env.IDENTITY_DOCS_KEYS ?? ""), {
      ciphertext: Buffer.from(await response.arrayBuffer()),
      keyId: sealed.keyId,
      wrappedKey: sealed.wrappedKey,
    });
    if (!Buffer.from(opened).equals(plain)) throw new Error("content differs");
  });
  await step("evidence delete", () => storage.delete(evidenceKey));
}
if (failed) process.exit(1);
console.log("Storage works.");
