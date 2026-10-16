import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { makeToken, readToken } from "./signed.js";
import type { ServedStorage } from "./types.js";

/**
 * Stores files in a directory; the "signed URL" is an API route that checks an HMAC token.
 * For development and small installs without an object store; production prefers S3.
 */
export function createLocalStorage(options: { dir: string; secret: string }): ServedStorage {
  const root = resolve(options.dir);
  const pathOf = (key: string) => {
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error("invalid storage key");
    return path;
  };
  return {
    async put(key, body) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
    async signedUrl(key, { fileName, contentType, expiresInSeconds }) {
      const token = makeToken(options.secret, {
        key,
        fileName,
        contentType,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      });
      // Relative: the client resolves it against the API origin it already talks to.
      return `/api/documents/files/${token}`;
    },
    async open(token, now) {
      const claims = readToken(options.secret, token, now);
      if (!claims) return null;
      try {
        const body = await readFile(pathOf(claims.key));
        return { body, fileName: claims.fileName, contentType: claims.contentType };
      } catch {
        return null;
      }
    },
  };
}
