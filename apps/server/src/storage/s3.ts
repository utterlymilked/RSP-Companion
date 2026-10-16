import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStorage } from "./types.js";

export interface S3Settings {
  /** Omit for AWS; set for Hetzner, MinIO and other S3-compatible stores. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Files in an S3-compatible bucket; downloads use pre-signed GET URLs straight from the bucket. */
export function createS3Storage(settings: S3Settings): FileStorage {
  const client = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: Boolean(settings.endpoint),
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
  const Bucket = settings.bucket;
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    signedUrl(key, { fileName, contentType, expiresInSeconds }) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentType: contentType,
          // RFC 6266: ASCII fallback plus the real name in UTF-8.
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}
