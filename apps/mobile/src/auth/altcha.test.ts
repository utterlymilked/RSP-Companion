import { createHash } from "node:crypto";
import { type Challenge, sha256Hex, solveChallenge } from "./altcha";

it("matches node's sha256", () => {
  for (const text of [
    "",
    "abc",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "salt?expires=1700000000123456",
  ]) {
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  }
});

it("solves a challenge into the payload the server verifies", () => {
  const salt = "abcdef?expires=9999999999";
  const challenge = createHash("sha256").update(`${salt}4242`).digest("hex");
  const c: Challenge = {
    algorithm: "SHA-256",
    challenge,
    salt,
    signature: "sig",
    maxnumber: 100000,
  };
  const payload = JSON.parse(Buffer.from(solveChallenge(c), "base64").toString());
  expect(payload).toMatchObject({ number: 4242, salt, challenge, signature: "sig" });
});
