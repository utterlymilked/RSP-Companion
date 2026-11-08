import { createReadStream, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";

/**
 * Serves the Android APK of this stack from our own server (docs/OPERATIONS.md#android-apks), so
 * installing never depends on GitHub's release downloads. The file `android.apk` in `dir` is put
 * there by the Ops task `publish-apk`; the tester stack serves the tester app, prod the club's.
 * Streams (the APK is ~100 MB) and honours single byte ranges so a flaky phone connection resumes.
 */
export const APK_FILE = "android.apk";
const DOWNLOAD_NAME = "sff-rsc.apk";

export function downloadRoutes({ dir }: { dir: string }) {
  const file = join(resolve(dir || "."), APK_FILE);
  const serve = (method: "GET" | "HEAD", range: string | undefined) => {
    let size: number;
    let mtime: Date;
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error("not a file");
      size = st.size;
      mtime = st.mtime;
    } catch {
      return Response.json({ error: { code: "not_found" } }, { status: 404 });
    }
    const headers: Record<string, string> = {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": `attachment; filename="${DOWNLOAD_NAME}"`,
      "accept-ranges": "bytes",
      "cache-control": "no-cache",
      "last-modified": mtime.toUTCString(),
      "x-content-type-options": "nosniff",
    };
    let start = 0;
    let end = size - 1;
    let status = 200;
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), size - 1);
      } else {
        start = Math.max(size - Number(m[2]), 0); // suffix range: the last N bytes
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      }
      status = 206;
      headers["content-range"] = `bytes ${start}-${end}/${size}`;
    }
    headers["content-length"] = String(end - start + 1);
    if (method === "HEAD") return new Response(null, { status, headers });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status, headers });
  };
  return new Hono()
    .get("/android.apk", (c) => serve("GET", c.req.header("range")))
    .on("HEAD", "/android.apk", (c) => serve("HEAD", c.req.header("range")));
}
