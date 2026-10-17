import { randomUUID } from "node:crypto";
import {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_KINDS,
  type DocumentKind,
  expiringQuerySchema,
  hasPermission,
  healthPermission,
  MAX_DOCUMENT_BYTES,
  uploadDocumentQuerySchema,
} from "@rsc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { ApiError, forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import type { ServedStorage } from "../../storage/types.js";
import { principalOf } from "../access/middleware.js";
import {
  authorizeHealthRead,
  authorizeHealthWrite,
  type Principal,
  personScope,
  readScope,
} from "../access/service.js";
import { audit } from "../audit/service.js";
import { todayInLisbon } from "../fees/service.js";
import {
  createDocument,
  deleteDocument,
  expiringDocuments,
  getDocument,
  getPerson,
  listDocuments,
  matchesContentType,
  missingDocuments,
} from "./service.js";

const personParam = z.object({ personId: z.uuid() });
const documentParam = z.object({ documentId: z.uuid() });

/** How long a download link works. */
const URL_LIFETIME_SECONDS = 300;

const isServed = (storage: object): storage is ServedStorage => "open" in storage;

/** Kinds of a person's documents the principal may list: all with documents.read, else medical exams for the medical roles. */
async function visibleKinds(db: AppDeps["db"], principal: Principal, personId: string) {
  const scope = await personScope(db, personId);
  if (hasPermission(principal.grants, "documents.read", scope)) return [...DOCUMENT_KINDS];
  if (hasPermission(principal.grants, healthPermission("medical", "read"), scope)) {
    return ["medical_exam" as const];
  }
  return [];
}

/** Writing and opening files of a kind: medical exams are health tier, the rest `documents.write`. */
async function authorizeFile(
  db: AppDeps["db"],
  principal: Principal,
  personId: string,
  kind: DocumentKind,
  access: "read" | "write",
): Promise<boolean> {
  if (kind === "medical_exam") {
    const check = access === "read" ? authorizeHealthRead : authorizeHealthWrite;
    return check(db, principal, { personId, discipline: "medical" });
  }
  const scope = await personScope(db, personId);
  if (!hasPermission(principal.grants, "documents.write", scope)) return false;
  await audit(db, {
    actorUserId: principal.userId,
    action: access === "read" ? "document.read" : "document.write",
    tier: "personal",
    subjectPersonId: personId,
    details: { kind },
  });
  return true;
}

/**
 * /api/documents: files kept for people (ADR 0009). Anyone with `documents.read` sees kind,
 * title and expiry; opening or changing a file needs `documents.write`, except medical exams,
 * which only the medical roles touch (health tier, audited). Downloads use short-lived signed
 * URLs, so the file bytes never pass through a session-less route without a token.
 */
export const documentsRoutes = ({ db, storage }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/expiring", validate("query", expiringQuerySchema), async (c) => {
      const query = c.req.valid("query");
      // Club-wide for admin and secretaria; coaches and delegados get their own teams.
      const scope = readScope(principalOf(c), "documents.read");
      if (scope !== "all" && scope.teamIds.length === 0) throw forbidden();
      let teamIds = scope === "all" ? undefined : scope.teamIds;
      if (query.teamId) {
        if (teamIds && !teamIds.includes(query.teamId)) throw forbidden();
        teamIds = [query.teamId];
      }
      const today = todayInLisbon();
      return c.json({
        documents: await expiringDocuments(db, { today, days: query.days, teamIds }),
      });
    })
    .get("/missing", async (c) => {
      const principal = principalOf(c);
      const scope = readScope(principal, "documents.read");
      if (scope !== "all" && scope.teamIds.length === 0) throw forbidden();
      // Whether a medical exam exists is health tier: only club-wide medical roles see it.
      const includeMedical = readScope(principal, healthPermission("medical", "read")) === "all";
      return c.json({
        people: await missingDocuments(db, {
          today: todayInLisbon(),
          teamIds: scope === "all" ? undefined : scope.teamIds,
          includeMedical,
        }),
      });
    })
    .get("/files/:token", async (c) => {
      // No session: the signed token is the credential (served storage only).
      const file = storage && isServed(storage) ? await storage.open(c.req.param("token")) : null;
      if (!file) throw notFound();
      return new Response(file.body as BodyInit, {
        headers: {
          "content-type": file.contentType,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    })
    .get("/people/:personId", validate("param", personParam), async (c) => {
      const principal = principalOf(c);
      const { personId } = c.req.valid("param");
      const kinds = await visibleKinds(db, principal, personId);
      if (kinds.length === 0) throw forbidden();
      if (!(await getPerson(db, personId))) throw notFound();
      return c.json({
        documents: await listDocuments(db, personId, kinds),
        canUpload: storage !== null,
      });
    })
    .post(
      "/people/:personId",
      validate("param", personParam),
      validate("query", uploadDocumentQuerySchema),
      async (c) => {
        const principal = principalOf(c);
        const { personId } = c.req.valid("param");
        const meta = c.req.valid("query");
        if (!storage) throw new ApiError(503, "storage_unavailable");
        if (!(await getPerson(db, personId))) throw notFound();
        if (!(await authorizeFile(db, principal, personId, meta.kind, "write"))) throw forbidden();

        const declared = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
        const contentType = DOCUMENT_CONTENT_TYPES.find((type) => type === declared);
        if (!contentType) throw new ApiError(415, "unsupported_file_type");
        if (Number(c.req.header("content-length") ?? 0) > MAX_DOCUMENT_BYTES) {
          throw new ApiError(413, "file_too_large");
        }
        const body = new Uint8Array(await c.req.arrayBuffer());
        if (body.byteLength > MAX_DOCUMENT_BYTES) throw new ApiError(413, "file_too_large");
        if (body.byteLength === 0) throw new ApiError(400, "invalid_request");
        if (!matchesContentType(body, contentType)) {
          throw new ApiError(415, "unsupported_file_type");
        }

        const storageKey = `documents/${personId}/${randomUUID()}`;
        await storage.put(storageKey, body, contentType);
        try {
          const document = await writeOrApiError(db, (tx) =>
            createDocument(tx, {
              personId,
              storageKey,
              contentType,
              sizeBytes: body.byteLength,
              uploadedBy: principal.userId,
              meta,
            }),
          );
          return c.json({ document }, 201);
        } catch (error) {
          await storage.delete(storageKey).catch(() => undefined);
          throw error;
        }
      },
    )
    .get("/:documentId/url", validate("param", documentParam), async (c) => {
      const principal = principalOf(c);
      if (!storage) throw new ApiError(503, "storage_unavailable");
      const document = await getDocument(db, c.req.valid("param").documentId);
      if (!document) throw notFound();
      const kinds = await visibleKinds(db, principal, document.personId);
      // A kind the caller cannot even list does not exist for them.
      if (!kinds.includes(document.kind)) throw notFound();
      if (!(await authorizeFile(db, principal, document.personId, document.kind, "read"))) {
        throw forbidden();
      }
      const url = await storage.signedUrl(document.storageKey, {
        fileName: document.fileName,
        contentType: document.contentType,
        expiresInSeconds: URL_LIFETIME_SECONDS,
      });
      return c.json({
        url,
        expiresAt: new Date(Date.now() + URL_LIFETIME_SECONDS * 1000).toISOString(),
      });
    })
    .delete("/:documentId", validate("param", documentParam), async (c) => {
      const principal = principalOf(c);
      const document = await getDocument(db, c.req.valid("param").documentId);
      if (!document) throw notFound();
      const kinds = await visibleKinds(db, principal, document.personId);
      if (!kinds.includes(document.kind)) throw notFound();
      if (!(await authorizeFile(db, principal, document.personId, document.kind, "write"))) {
        throw forbidden();
      }
      await writeOrApiError(db, (tx) => deleteDocument(tx, document.id));
      // The row is gone first: a failed file delete leaves an orphan, never a dangling row.
      await storage?.delete(document.storageKey).catch((error) => console.error(error));
      return c.body(null, 204);
    });
