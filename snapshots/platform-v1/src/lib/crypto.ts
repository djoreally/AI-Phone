import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Master secret stands in for the hardware-backed KeyStore / HSM in production.
const MASTER = process.env.AIPHONE_SIGNING_SECRET || "aiphone-dev-signing-secret-change-me";

export function deviceKey(deviceRef: string): Buffer {
  return createHmac("sha256", MASTER).update(`device-key:${deviceRef || "studio"}`).digest();
}

export function hmacHex(key: Buffer | string, msg: string): string {
  return createHmac("sha256", key).update(msg).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function randomFingerprint(): string {
  return "SHA256:" + randomBytes(32).toString("base64url");
}

export function randomId(bytes = 12): string {
  return randomBytes(bytes).toString("hex");
}

// ----- Minimal HS256 JWT for device-scoped telephony tokens -----
const JWT_KEY = createHmac("sha256", MASTER).update("jwt-auth-gateway").digest();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export type TokenClaims = {
  iss: string;
  sub: string;
  jti: string;
  scope: string;
  numbers: string[];
  provider: string;
  iat: number;
  exp: number;
};

export function signJwt(claims: Omit<TokenClaims, "iat" | "exp" | "iss">, ttlSeconds: number): { token: string; claims: TokenClaims } {
  const iat = Math.floor(Date.now() / 1000);
  const full: TokenClaims = { iss: "aiphone-auth-gateway", ...claims, iat, exp: iat + ttlSeconds };
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(full);
  const sig = createHmac("sha256", JWT_KEY).update(`${head}.${body}`).digest("base64url");
  return { token: `${head}.${body}.${sig}`, claims: full };
}

export function verifyJwt(token: string): { ok: true; claims: TokenClaims } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "Malformed token" };
  const expected = createHmac("sha256", JWT_KEY).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "Bad signature" };
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as TokenClaims;
    if (claims.exp * 1000 < Date.now()) return { ok: false, reason: "Token expired" };
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "Malformed token" };
  }
}

/** Deterministic sub-secret (stands in for an HSM-held key). */
export function secretDerive(label: string): Buffer {
  return createHmac("sha256", MASTER).update(label).digest();
}

/** Recursively sort object keys so JSON survives jsonb round-trips byte-for-byte. */
export function sortKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sortKeys) as unknown as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => [k, sortKeys(o[k])])) as T;
  }
  return v;
}
