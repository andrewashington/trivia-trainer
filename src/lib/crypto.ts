import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

/**
 * AES-256-GCM for vault passwords at rest. The key derives from
 * VAULT_KEY (set your own) or falls back to AUTH_SECRET so a fresh
 * install works out of the box. This is server-side encryption — it
 * protects the DB and its backups, not against someone who owns the
 * app server. That's the right tradeoff for a friend-group shared
 * vault; it is deliberately not end-to-end.
 */
function key(): Buffer {
  const secret = process.env.VAULT_KEY ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set VAULT_KEY (or AUTH_SECRET) to use the vault.");
  return scryptSync(secret, "udmplus-vault-v1", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(encoded: string): string {
  const [iv, tag, data] = encoded.split(":").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
