import assert from "node:assert/strict";
import test from "node:test";

import { API_SECURITY_HEADERS, STATIC_SECURITY_HEADERS, canonicalRequest, signRequest, verifySignedRequest } from "../src/index.ts";

const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const now = 1790630400000;

function request(overrides = {}) {
  return { method: "POST", path: "/api/register", timestamp: String(now), nonce: "synthetic_nonce_0000000001", bodyText: JSON.stringify({ synthetic: true }), ...overrides };
}

test("canonical request binds method, path, timestamp, nonce, and body hash", () => {
  assert.equal(canonicalRequest("POST", "/api/register", "1", "nonce", "hash"), "POST\n/api/register\n1\nnonce\nhash");
});

test("valid signature passes and altered body, signature, expiry, and replay fail closed", async () => {
  const signed = await signRequest(request(), secret);
  assert.deepEqual(await verifySignedRequest(signed, secret, now, new Set()), { ok: true, nonce: signed.nonce });
  assert.equal((await verifySignedRequest({ ...signed, bodyText: "{}" }, secret, now, new Set())).code, "BODY_HASH_MISMATCH");
  assert.equal((await verifySignedRequest({ ...signed, signature: `${signed.signature.slice(0, -1)}A` }, secret, now, new Set())).code, "SIGNATURE_MISMATCH");
  assert.equal((await verifySignedRequest(signed, secret, now + 60_001, new Set())).code, "EXPIRED");
  assert.equal((await verifySignedRequest(signed, secret, now, new Set([signed.nonce]))).code, "REPLAYED");
});

test("signature format rejects untrusted path and short secret", async () => {
  await assert.rejects(() => signRequest(request({ path: "https://evil.invalid/" }), secret), /invalid/u);
  await assert.rejects(() => signRequest(request(), new Uint8Array(8)), /at least 32/u);
});

test("security headers prohibit framing, external execution, indexing, and API caching", () => {
  assert.match(STATIC_SECURITY_HEADERS["Content-Security-Policy"], /frame-ancestors 'none'/u);
  assert.match(STATIC_SECURITY_HEADERS["Content-Security-Policy"], /connect-src 'self'/u);
  assert.equal(API_SECURITY_HEADERS["Cache-Control"], "no-store, max-age=0");
  assert.equal(API_SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
});
