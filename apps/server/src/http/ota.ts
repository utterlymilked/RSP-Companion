import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Hono } from "hono";

/**
 * Self-hosted over-the-air updates for the Android app (docs/OPERATIONS.md#over-the-air-updates).
 * Speaks the Expo Updates protocol: the app asks /api/ota/manifest on launch and downloads the
 * JS bundle and assets of the `expo export` baked into the image (OTA_DIR). Only updates whose
 * runtime version matches the installed binary are offered, so native changes need a new APK.
 */

interface Metadata {
  fileMetadata: { android?: { bundle: string; assets: { path: string; ext: string }[] } };
}

interface OtaAsset {
  file: string;
  key: string;
  hash: string;
  contentType: string;
  fileExtension: string;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ttf: "font/ttf",
  otf: "font/otf",
  json: "application/json",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

const base64Url = (buf: Buffer) => buf.toString("base64url");

function uuidFrom(hash: Buffer) {
  const h = Buffer.from(hash.subarray(0, 16));
  h.writeUInt8((h.readUInt8(6) & 0x0f) | 0x50, 6);
  h.writeUInt8((h.readUInt8(8) & 0x3f) | 0x80, 8);
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export interface OtaUpdate {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launch: OtaAsset;
  assets: OtaAsset[];
  expoClient: unknown;
}

/** Reads the export in `dir` (written by `pnpm --filter @rsc/mobile build:ota`); null if absent. */
export function loadOtaUpdate(dir: string): OtaUpdate | null {
  const root = resolve(dir);
  const metaPath = join(root, "metadata.json");
  const configPath = join(root, "expoConfig.json");
  if (!existsSync(metaPath) || !existsSync(configPath)) return null;
  const metaRaw = readFileSync(metaPath);
  const android = (JSON.parse(metaRaw.toString()) as Metadata).fileMetadata.android;
  if (!android) return null;
  const expoClient = JSON.parse(readFileSync(configPath, "utf8")) as { runtimeVersion?: string };
  if (typeof expoClient.runtimeVersion !== "string") return null;
  const describe = (file: string, contentType: string, fileExtension: string): OtaAsset => {
    const bytes = readFileSync(join(root, file));
    return {
      file,
      key: createHash("md5").update(bytes).digest("hex"),
      hash: base64Url(createHash("sha256").update(bytes).digest()),
      contentType,
      fileExtension,
    };
  };
  return {
    id: uuidFrom(createHash("sha256").update(metaRaw).digest()),
    createdAt: statSync(metaPath).mtime.toISOString(),
    runtimeVersion: expoClient.runtimeVersion,
    launch: describe(android.bundle, "application/javascript", ".bundle"),
    assets: android.assets.map((a) =>
      describe(a.path, CONTENT_TYPES[a.ext] ?? "application/octet-stream", `.${a.ext}`),
    ),
    expoClient,
  };
}

export function otaRoutes({ dir, baseUrl }: { dir: string; baseUrl: string }) {
  const root = resolve(dir);
  let update: OtaUpdate | null = null;
  try {
    update = dir ? loadOtaUpdate(root) : null;
  } catch (error) {
    console.error("OTA export unreadable, updates disabled", error);
  }
  const current = update;
  const files = new Map(current ? [current.launch, ...current.assets].map((a) => [a.key, a]) : []);
  const assetUrl = (a: OtaAsset) => `${baseUrl}/api/ota/assets/${a.key}`;
  const part = (name: string, body: unknown) =>
    `Content-Disposition: form-data; name="${name}"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}`;
  const reply = (name: string, body: unknown) => {
    const boundary = randomUUID();
    return new Response(`--${boundary}\r\n${part(name, body)}\r\n--${boundary}--\r\n`, {
      headers: {
        "content-type": `multipart/mixed; boundary=${boundary}`,
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
        "cache-control": "private, max-age=0",
      },
    });
  };

  return new Hono()
    .get("/manifest", (c) => {
      if (!current) return c.json({ error: { code: "not_found" } }, 404);
      const platform = c.req.header("expo-platform");
      const runtime = c.req.header("expo-runtime-version");
      const have = c.req.header("expo-current-update-id");
      if (platform !== "android" || runtime !== current.runtimeVersion || have === current.id) {
        return reply("directive", { type: "noUpdateAvailable" });
      }
      const toAsset = (a: OtaAsset) => ({
        hash: a.hash,
        key: a.key,
        fileExtension: a.fileExtension,
        contentType: a.contentType,
        url: assetUrl(a),
      });
      return reply("manifest", {
        id: current.id,
        createdAt: current.createdAt,
        runtimeVersion: current.runtimeVersion,
        launchAsset: toAsset(current.launch),
        assets: current.assets.map(toAsset),
        metadata: {},
        extra: { expoClient: current.expoClient },
      });
    })
    .get("/assets/:key", (c) => {
      const asset = files.get(c.req.param("key"));
      if (!asset) return c.json({ error: { code: "not_found" } }, 404);
      return new Response(readFileSync(join(root, asset.file)), {
        headers: {
          "content-type": asset.contentType,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    });
}
