/**
 * A random UUID v4 for a draft's idempotency key (`clientKey`). Hermes has no
 * `crypto.randomUUID`, and the key only needs to be unique per reporter, not secret.
 */
export function newClientKey(random: () => number = Math.random): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(random() * 16);
    return (c === "x" ? n : (n & 0x3) | 0x8).toString(16);
  });
}
