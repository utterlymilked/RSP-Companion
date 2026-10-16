import { makeToken, readToken } from "./signed.js";
import type { ServedStorage } from "./types.js";

/** Keeps files in memory; for tests. Same signed-token download as the local storage. */
export function createMemoryStorage(secret = "test-storage-secret-at-least-32-chars") {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: ServedStorage & { files: typeof files } = {
    files,
    async put(key, body, contentType) {
      files.set(key, { body, contentType });
    },
    async delete(key) {
      files.delete(key);
    },
    async signedUrl(key, { fileName, contentType, expiresInSeconds }) {
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      return `/api/documents/files/${makeToken(secret, { key, fileName, contentType, exp })}`;
    },
    async open(token, now) {
      const claims = readToken(secret, token, now);
      const file = claims ? files.get(claims.key) : undefined;
      if (!claims || !file) return null;
      return { body: file.body, fileName: claims.fileName, contentType: claims.contentType };
    },
  };
  return storage;
}
