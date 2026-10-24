import { randomUUID } from "node:crypto";
import { eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import type { FileStorage, ServedStorage } from "../../storage/types.js";
import { type MasterKeys, openEvidence, rewrapKey, sealEvidence } from "./crypto.js";
import { evidenceFiles } from "./schema.js";

/** Pending evidence expires after this long (ADR 0026 section 9). */
export const EVIDENCE_PENDING_DAYS = 30;

/**
 * What the identity features need to keep evidence: file storage plus master keys. Absent when
 * either is missing, and then the document method stays off (`evidenceReady`).
 */
export interface EvidenceStore {
  storage: FileStorage;
  keys: MasterKeys;
}

export const evidenceStatus = (storage: FileStorage | null, keys: MasterKeys | null) => ({
  storageConfigured: storage !== null,
  keyConfigured: keys !== null,
  ready: storage !== null && keys !== null,
});

export function createEvidenceStore(
  storage: FileStorage | null,
  keys: MasterKeys | null,
): EvidenceStore | null {
  return storage && keys ? { storage, keys } : null;
}

/** Encrypts and stores one file; only ciphertext reaches the bucket. */
export async function putEvidence(
  db: Db,
  store: EvidenceStore,
  input: { ownerUserId: string; body: Uint8Array; contentType: string; now?: Date },
) {
  const sealed = sealEvidence(store.keys, Buffer.from(input.body));
  const storageKey = `identity/${randomUUID()}`;
  await store.storage.put(storageKey, sealed.ciphertext, "application/octet-stream");
  const now = input.now ?? new Date();
  try {
    const [row] = await db
      .insert(evidenceFiles)
      .values({
        ownerUserId: input.ownerUserId,
        storageKey,
        contentType: input.contentType,
        size: input.body.length,
        keyId: sealed.keyId,
        wrappedKey: sealed.wrappedKey,
        sha256: sealed.sha256,
        expiresAt: new Date(now.getTime() + EVIDENCE_PENDING_DAYS * 86_400_000),
      })
      .returning();
    if (!row) throw new Error("evidence not stored");
    return row;
  } catch (error) {
    await store.storage.delete(storageKey); // no orphaned ciphertext
    throw error;
  }
}

/** Reads the ciphertext back through the storage's own short-lived signed read and decrypts it. */
async function fetchCiphertext(storage: FileStorage, key: string): Promise<Buffer> {
  const served = storage as Partial<ServedStorage>;
  const url = await storage.signedUrl(key, {
    fileName: "evidence",
    contentType: "application/octet-stream",
    expiresInSeconds: 60,
  });
  if (served.open) {
    const token = url.split("/").pop() ?? "";
    const file = await served.open(token);
    if (!file) throw new ApiError(404, "not_found");
    return Buffer.from(file.body);
  }
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(404, "not_found");
  return Buffer.from(await res.arrayBuffer());
}

/** Decrypted bytes of a file. Callers must have checked `identity.documents.read` and audit the read. */
export async function readEvidence(db: Db, store: EvidenceStore, fileId: string) {
  const [row] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.id, fileId));
  if (!row) throw new ApiError(404, "not_found");
  const ciphertext = await fetchCiphertext(store.storage, row.storageKey);
  const body = openEvidence(store.keys, {
    ciphertext,
    keyId: row.keyId,
    wrappedKey: row.wrappedKey,
  });
  return { body, contentType: row.contentType };
}

/** Deletes files from storage first, then their rows; returns how many were purged. */
export async function purgeEvidence(db: Db, store: EvidenceStore, fileIds: string[]) {
  if (fileIds.length === 0) return 0;
  const rows = await db.select().from(evidenceFiles).where(inArray(evidenceFiles.id, fileIds));
  for (const row of rows) await store.storage.delete(row.storageKey);
  await db.delete(evidenceFiles).where(
    inArray(
      evidenceFiles.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}

/** Purges what has expired (pending evidence nobody decided). */
export async function purgeExpiredEvidence(db: Db, store: EvidenceStore, now = new Date()) {
  const due = await db
    .select({ id: evidenceFiles.id })
    .from(evidenceFiles)
    .where(lt(evidenceFiles.expiresAt, now));
  return purgeEvidence(
    db,
    store,
    due.map((d) => d.id),
  );
}

/** After a master key rotation: re-wraps every file's data key under the current key. */
export async function rewrapAll(db: Db, store: EvidenceStore) {
  const rows = await db.select().from(evidenceFiles);
  let changed = 0;
  for (const row of rows) {
    if (row.keyId === store.keys.current) continue;
    const next = rewrapKey(store.keys, row);
    await db.update(evidenceFiles).set(next).where(eq(evidenceFiles.id, row.id));
    changed++;
  }
  return changed;
}
