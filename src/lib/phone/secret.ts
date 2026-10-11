import crypto from "node:crypto";

const PREFIX = "v1";

function key(): Buffer {
  const raw = process.env.AI_PHONE_VOICE_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("AI_PHONE_VOICE_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("AI_PHONE_VOICE_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return decoded;
}

export function encryptVoiceSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptVoiceSecret(value: string): string {
  const [version, ivPart, tagPart, encryptedPart] = value.split(".");
  if (version !== PREFIX || !ivPart || !tagPart || !encryptedPart) throw new Error("Unsupported encrypted voice secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}
