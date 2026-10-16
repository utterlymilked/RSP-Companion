import { createHmac, timingSafeEqual } from "node:crypto";

interface Claims {
  key: string;
  fileName: string;
  contentType: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** `payload.signature` token that grants one download until it expires. */
export function makeToken(secret: string, claims: Claims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** The claims of a valid, unexpired token; null otherwise. */
export function readToken(secret: string, token: string, now = new Date()): Claims | null {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.exp * 1000 > now.getTime() ? claims : null;
  } catch {
    return null;
  }
}
