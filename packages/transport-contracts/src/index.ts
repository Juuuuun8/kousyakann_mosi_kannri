export interface SignableRequest {
  readonly method: string;
  readonly path: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly bodyText: string;
}

export interface SignedRequest extends SignableRequest {
  readonly bodyHash: string;
  readonly signature: string;
}

export type SignatureFailure = "INVALID_FORMAT" | "EXPIRED" | "REPLAYED" | "BODY_HASH_MISMATCH" | "SIGNATURE_MISMATCH";
export type SignatureVerification = { readonly ok: true; readonly nonce: string } | { readonly ok: false; readonly code: SignatureFailure };

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: Uint8Array<ArrayBuffer>, value: string): Promise<string> {
  if (secret.byteLength < 32) throw new Error("HMAC secret must be at least 32 bytes");
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function validParts(request: SignableRequest): boolean {
  return /^(?:GET|POST|PUT|PATCH|DELETE)$/u.test(request.method) && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]{1,500}$/u.test(request.path) &&
    /^\d{10,13}$/u.test(request.timestamp) && /^[A-Za-z0-9_-]{22,128}$/u.test(request.nonce);
}

export function canonicalRequest(method: string, path: string, timestamp: string, nonce: string, bodyHash: string): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

export async function signRequest(request: SignableRequest, secret: Uint8Array<ArrayBuffer>): Promise<SignedRequest> {
  if (!validParts(request)) throw new Error("request signature fields are invalid");
  const bodyHash = await sha256(request.bodyText);
  const signature = await hmac(secret, canonicalRequest(request.method, request.path, request.timestamp, request.nonce, bodyHash));
  return { ...request, bodyHash, signature };
}

export async function verifySignedRequest(request: SignedRequest, secret: Uint8Array<ArrayBuffer>, nowMs: number, usedNonces: ReadonlySet<string>, maximumSkewMs = 60_000): Promise<SignatureVerification> {
  if (!validParts(request) || !/^[0-9a-f]{64}$/u.test(request.bodyHash) || !/^[A-Za-z0-9_-]{43}$/u.test(request.signature)) return { ok: false, code: "INVALID_FORMAT" };
  const timestamp = Number(request.timestamp);
  const timestampMs = request.timestamp.length === 10 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > maximumSkewMs) return { ok: false, code: "EXPIRED" };
  if (usedNonces.has(request.nonce)) return { ok: false, code: "REPLAYED" };
  if (!constantTimeEqual(await sha256(request.bodyText), request.bodyHash)) return { ok: false, code: "BODY_HASH_MISMATCH" };
  const expected = await hmac(secret, canonicalRequest(request.method, request.path, request.timestamp, request.nonce, request.bodyHash));
  if (!constantTimeEqual(expected, request.signature)) return { ok: false, code: "SIGNATURE_MISMATCH" };
  return { ok: true, nonce: request.nonce };
}

export const STATIC_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
});

export const API_SECURITY_HEADERS = Object.freeze({ ...STATIC_SECURITY_HEADERS, "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" });
