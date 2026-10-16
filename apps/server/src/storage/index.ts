import type { Env } from "../env.js";
import { createLocalStorage } from "./local.js";
import { createS3Storage } from "./s3.js";
import type { FileStorage } from "./types.js";

export type { FileStorage, ServedStorage } from "./types.js";

/** The configured file storage: S3 if set, else a directory, else none (uploads answer 503). */
export function createStorage(env: Env): FileStorage | null {
  if (env.STORAGE_S3_BUCKET) {
    return createS3Storage({
      endpoint: env.STORAGE_S3_ENDPOINT,
      region: env.STORAGE_S3_REGION,
      bucket: env.STORAGE_S3_BUCKET,
      // The env schema requires both keys whenever the bucket is set.
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY ?? "",
    });
  }
  if (env.STORAGE_DIR) {
    return createLocalStorage({
      dir: env.STORAGE_DIR,
      secret: env.BETTER_AUTH_SECRET,
    });
  }
  return null;
}
