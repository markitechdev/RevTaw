import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for Google refresh tokens at rest: AES-256-GCM with a key that
 * lives only in the server's environment (CALENDAR_TOKEN_KEY). The student's
 * id is bound in as associated data, so a token copied to another row will
 * not decrypt. Format: "v1:" + base64url(iv | ciphertext | tag).
 */

const VERSION = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes");
  return key;
}

export function encryptToken(plain: string, userId: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

export function decryptToken(sealed: string, userId: string, keyBase64: string): string {
  if (!sealed.startsWith(VERSION)) throw new Error("unknown token format");
  const raw = Buffer.from(sealed.slice(VERSION.length), "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error("token too short");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
}
