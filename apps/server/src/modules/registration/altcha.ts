import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * ALTCHA-compatible proof of work (self-hosted, no third party, no cookies; ADR 0026): the
 * server signs a challenge `sha256(salt + n)` for a secret `n` below `maxNumber`; the client
 * finds `n` by brute force and sends the payload back. Each challenge expires and is single use.
 */
export interface Challenge {
  algorithm: "SHA-256";
  challenge: string;
  salt: string;
  signature: string;
  maxnumber: number;
}

const MAX_NUMBER = 100_000;
const TTL_MS = 10 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const sign = (secret: string, challenge: string) =>
  createHmac("sha256", secret).update(challenge).digest("hex");

export function createChallenge(secret: string, now = Date.now()): Challenge {
  const salt = `${randomBytes(12).toString("hex")}?expires=${Math.floor((now + TTL_MS) / 1000)}`;
  const number = randomBytes(4).readUInt32BE() % MAX_NUMBER;
  const challenge = sha256(`${salt}${number}`);
  return {
    algorithm: "SHA-256",
    challenge,
    salt,
    signature: sign(secret, challenge),
    maxnumber: MAX_NUMBER,
  };
}

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The solved payload (base64 JSON) is valid, unexpired and signed by us; reports its salt. */
export function verifySolution(
  secret: string,
  payload: string | undefined,
  now = Date.now(),
): { ok: false } | { ok: true; salt: string } {
  if (!payload || payload.length > 1000) return { ok: false };
  let data: Partial<Record<string, unknown>>;
  try {
    data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return { ok: false };
  }
  const { algorithm, challenge, salt, signature, number } = data;
  if (
    algorithm !== "SHA-256" ||
    typeof challenge !== "string" ||
    typeof salt !== "string" ||
    typeof signature !== "string" ||
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 0 ||
    number > MAX_NUMBER
  ) {
    return { ok: false };
  }
  const expires = Number(new URLSearchParams(salt.split("?")[1] ?? "").get("expires"));
  if (!expires || expires * 1000 < now) return { ok: false };
  if (!safeEqual(sign(secret, challenge), signature)) return { ok: false };
  if (!safeEqual(sha256(`${salt}${number}`), challenge)) return { ok: false };
  return { ok: true, salt };
}

/** Client side of the same proof, used by tests (the app has its own solver). */
export function solveChallenge(c: Challenge): string {
  for (let number = 0; number <= c.maxnumber; number++) {
    if (sha256(`${c.salt}${number}`) === c.challenge) {
      const { algorithm, challenge, salt, signature } = c;
      return Buffer.from(
        JSON.stringify({ algorithm, challenge, number, salt, signature }),
      ).toString("base64");
    }
  }
  throw new Error("unsolvable challenge");
}
