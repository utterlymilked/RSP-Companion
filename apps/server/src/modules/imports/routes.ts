import {
  hasPermission,
  type ImportKind,
  importParamSchema,
  MAX_IMPORT_BYTES,
  XLSX_CONTENT_TYPE,
} from "@rsc/shared";
import { Hono } from "hono";
import { ApiError, forbidden } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf } from "../access/middleware.js";
import { runImport } from "./service.js";
import { buildTemplate } from "./xlsx.js";

const TEMPLATE_FILES: Record<ImportKind, string> = {
  players: "modelo-jogadores.xlsx",
  teams: "modelo-equipas.xlsx",
};

/**
 * /api/imports: Excel templates and imports (ADR 0015). Players need `people.write`, teams
 * `teams.write`; both are club-wide permissions. The file is the raw request body, like
 * document uploads.
 */
export const importsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/:kind/template", validate("param", importParamSchema), async (c) => {
      const { kind } = c.req.valid("param");
      authorize(c, kind);
      return c.body(await buildTemplate(kind), 200, {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${TEMPLATE_FILES[kind]}"`,
      });
    })
    // Same code path as /apply, rolled back at the end: the preview is what apply would do.
    .post("/:kind/preview", validate("param", importParamSchema), async (c) => {
      const { kind } = c.req.valid("param");
      authorize(c, kind);
      return c.json(await runImport(db, kind, await readBody(c.req), { apply: false }));
    })
    .post("/:kind/apply", validate("param", importParamSchema), async (c) => {
      const { kind } = c.req.valid("param");
      authorize(c, kind);
      return c.json(await runImport(db, kind, await readBody(c.req), { apply: true }));
    });

function authorize(c: Parameters<typeof principalOf>[0], kind: ImportKind) {
  const permission = kind === "players" ? "people.write" : "teams.write";
  if (!hasPermission(principalOf(c).grants, permission)) throw forbidden();
}

async function readBody(req: {
  header: (name: string) => string | undefined;
  arrayBuffer: () => Promise<ArrayBuffer>;
}) {
  if (Number(req.header("content-length") ?? 0) > MAX_IMPORT_BYTES) {
    throw new ApiError(413, "file_too_large");
  }
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX_IMPORT_BYTES) throw new ApiError(413, "file_too_large");
  if (body.byteLength === 0) throw new ApiError(400, "invalid_request");
  return body;
}
