import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { clubWide, TEST_EVIDENCE_KEYS, testApp } from "../../test/app.js";
import { describeDb, withRollback } from "../../test/db.js";
import { openEvidence, parseMasterKeys, rewrapKey, sealEvidence } from "./crypto.js";
import { evidenceFiles } from "./schema.js";
import {
  purgeEvidence,
  purgeExpiredEvidence,
  putEvidence,
  readEvidence,
  rewrapAll,
} from "./service.js";

const keys = () => parseMasterKeys(TEST_EVIDENCE_KEYS);

it("seals and opens, and refuses a tampered file or a wrong key", () => {
  const master = keys();
  const plain = randomBytes(5000);
  const sealed = sealEvidence(master, plain);
  expect(sealed.ciphertext.includes(plain.subarray(0, 64))).toBe(false);
  expect(openEvidence(master, sealed).equals(plain)).toBe(true);
  const tampered = Buffer.from(sealed.ciphertext);
  tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 1, tampered.length - 1);
  expect(() => openEvidence(master, { ...sealed, ciphertext: tampered })).toThrow(
    "evidence_corrupt",
  );
  const other = parseMasterKeys(`9:${randomBytes(32).toString("base64")}`);
  expect(() => openEvidence(other, sealed)).toThrow("evidence_key_missing");
});

it("rotates: old files still open, and rewrapping moves them to the current key", () => {
  const old = parseMasterKeys(TEST_EVIDENCE_KEYS.split(",")[1] ?? "");
  const sealed = sealEvidence(old, Buffer.from("scan"));
  expect(sealed.keyId).toBe("1");
  const now = keys(); // current is "2", "1" still known
  expect(openEvidence(now, sealed).toString()).toBe("scan");
  const moved = rewrapKey(now, sealed);
  expect(moved.keyId).toBe("2");
  expect(openEvidence(now, { ...sealed, ...moved }).toString()).toBe("scan");
});

it("rejects malformed master keys", () => {
  expect(() => parseMasterKeys("1:short")).toThrow();
  expect(() => parseMasterKeys("nokey")).toThrow();
});

describeDb("evidence store", () => {
  it("keeps only ciphertext in the bucket and reads it back", () =>
    withRollback(async (db) => {
      const t = testApp(db, { evidence: true });
      const owner = await t.userWith([clubWide("anonymous")]);
      const store = t.evidence;
      if (!store) throw new Error("no store");
      const scan = randomBytes(2048);
      const row = await putEvidence(db, store, {
        ownerUserId: owner.user.id,
        body: scan,
        contentType: "image/jpeg",
      });
      const stored = t.storage.files.get(row.storageKey);
      expect(stored?.contentType).toBe("application/octet-stream");
      expect(Buffer.from(stored?.body ?? []).includes(scan.subarray(0, 64))).toBe(false);
      const back = await readEvidence(db, store, row.id);
      expect(back.body.equals(scan)).toBe(true);
      expect(back.contentType).toBe("image/jpeg");
    }));

  it("purges storage before rows, and what expired", () =>
    withRollback(async (db) => {
      const t = testApp(db, { evidence: true });
      const owner = await t.userWith([clubWide("anonymous")]);
      const store = t.evidence;
      if (!store) throw new Error("no store");
      const a = await putEvidence(db, store, {
        ownerUserId: owner.user.id,
        body: Buffer.from("a"),
        contentType: "image/png",
      });
      const b = await putEvidence(db, store, {
        ownerUserId: owner.user.id,
        body: Buffer.from("b"),
        contentType: "image/png",
      });
      expect(await purgeEvidence(db, store, [a.id])).toBe(1);
      expect(t.storage.files.has(a.storageKey)).toBe(false);
      const later = new Date(Date.now() + 31 * 86_400_000);
      expect(await purgeExpiredEvidence(db, store, later)).toBe(1);
      expect(t.storage.files.size).toBe(0);
      expect((await db.select().from(evidenceFiles)).length).toBe(0);
      expect(b.id).toBeTruthy();
    }));

  it("rewraps all files after a rotation", () =>
    withRollback(async (db) => {
      const t = testApp(db, { evidence: true });
      const owner = await t.userWith([clubWide("anonymous")]);
      const store = t.evidence;
      if (!store) throw new Error("no store");
      const file = await putEvidence(db, store, {
        ownerUserId: owner.user.id,
        body: Buffer.from("x"),
        contentType: "image/png",
      });
      expect(file.keyId).toBe("2");
      expect(await rewrapAll(db, store)).toBe(0);
    }));

  it("reports readiness to developers only", () =>
    withRollback(async (db) => {
      const without = testApp(db);
      const dev = await without.userWith([clubWide("developer")]);
      const res = await without.request("/api/registration/status", { cookie: dev.cookie });
      expect(((await res.json()) as { evidence: { ready: boolean } }).evidence.ready).toBe(false);
      const withKeys = testApp(db, { evidence: true });
      const dev2 = await withKeys.userWith([clubWide("developer")]);
      const res2 = await withKeys.request("/api/registration/status", { cookie: dev2.cookie });
      expect(((await res2.json()) as { evidence: { ready: boolean } }).evidence.ready).toBe(true);
    }));
});
