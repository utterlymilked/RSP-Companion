import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Envelope encryption for identity evidence (ADR 0026 section 10): every file gets a random
 * AES-256-GCM data key, and the data key is wrapped (AES-256-GCM again) by a master key from
 * the environment, identified by `keyId` so the master key can be rotated. A database or
 * bucket leak alone reveals nothing.
 */
export interface MasterKeys {
  /** Key id used for new files. */
  current: string;
  /** Every known key by id, the current one included (old ones are only needed to read). */
  keys: ReadonlyMap<string, Buffer>;
}

/** What is stored next to the ciphertext (and in the database) to read the file again. */
export interface Sealed {
  ciphertext: Buffer;
  keyId: string;
  /** The data key, wrapped by the master key (iv | tag | wrapped key), base64. */
  wrappedKey: string;
  /** SHA-256 of the plaintext, for duplicate detection only. */
  sha256: string;
}

const IV = 12;
const TAG = 16;

const seal = (key: Buffer, plaintext: Buffer) => {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

const open = (key: Buffer, sealed: Buffer) => {
  if (sealed.length < IV + TAG) throw new Error("evidence_corrupt");
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, IV));
  decipher.setAuthTag(sealed.subarray(IV, IV + TAG));
  try {
    return Buffer.concat([decipher.update(sealed.subarray(IV + TAG)), decipher.final()]);
  } catch {
    throw new Error("evidence_corrupt"); // wrong key or tampered
  }
};

/**
 * Parses `IDENTITY_DOCS_KEYS`: comma-separated `id:base64` entries of 32-byte keys; the first
 * is current. Throws on anything malformed so a bad deploy fails at start-up.
 */
export function parseMasterKeys(value: string): MasterKeys {
  const keys = new Map<string, Buffer>();
  for (const entry of value.split(",")) {
    const [id, b64] = entry.trim().split(":");
    const key = b64 ? Buffer.from(b64, "base64") : Buffer.alloc(0);
    if (!id || key.length !== 32) {
      throw new Error("IDENTITY_DOCS_KEYS needs entries id:base64 of 32-byte keys");
    }
    keys.set(id, key);
  }
  const current = [...keys.keys()][0];
  if (!current) throw new Error("IDENTITY_DOCS_KEYS is empty");
  return { current, keys };
}

export function sealEvidence(master: MasterKeys, plaintext: Buffer): Sealed {
  const key = master.keys.get(master.current);
  if (!key) throw new Error("evidence_key_missing");
  const dataKey = randomBytes(32);
  return {
    ciphertext: seal(dataKey, plaintext),
    keyId: master.current,
    wrappedKey: seal(key, dataKey).toString("base64"),
    sha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}

export function openEvidence(
  master: MasterKeys,
  file: { ciphertext: Buffer; keyId: string; wrappedKey: string },
): Buffer {
  const key = master.keys.get(file.keyId);
  if (!key) throw new Error("evidence_key_missing");
  const dataKey = open(key, Buffer.from(file.wrappedKey, "base64"));
  return open(dataKey, file.ciphertext);
}

/** Re-wraps the data key under the current master key; the stored ciphertext is untouched. */
export function rewrapKey(master: MasterKeys, file: { keyId: string; wrappedKey: string }) {
  const old = master.keys.get(file.keyId);
  const current = master.keys.get(master.current);
  if (!old || !current) throw new Error("evidence_key_missing");
  const dataKey = open(old, Buffer.from(file.wrappedKey, "base64"));
  return { keyId: master.current, wrappedKey: seal(current, dataKey).toString("base64") };
}
