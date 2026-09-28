import assert from "node:assert/strict";
import test from "node:test";
import { derivePasswordVerifier } from "../../auth-contracts/src/index.ts";
import { handleGatewayRequest } from "../src/index.ts";

const password = "correct horse battery staple";
const salt = "MDEyMzQ1Njc4OWFiY2RlZg";
const pepper = "p".repeat(32);
const env = { GAS_ENDPOINT: new URL("https://script.google.com/macros/s/test/exec").toString(), GAS_HMAC_SECRET: "h".repeat(32), PASSWORD_PEPPER: pepper, ENVIRONMENT: "test" };

function random(length) { return new Uint8Array(length).fill(7); }

test("unknown routes and methods fail closed without calling GAS", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return Response.json({ ok: true, code: "OK" }); };
  const missing = await handleGatewayRequest(new Request("https://example.test/api/nope"), env, { fetcher });
  assert.equal(missing.status, 404);
  const wrongMethod = await handleGatewayRequest(new Request("https://example.test/api/auth/login"), env, { fetcher });
  assert.equal(wrongMethod.status, 405);
  assert.equal(calls, 0);
});

test("login derives a verifier, sends signed GAS calls, and sets a hardened cookie", async () => {
  const verifier = await derivePasswordVerifier(password, salt, 100000, pepper);
  const operations = [];
  const fetcher = async (_url, init) => {
    const envelope = JSON.parse(init.body);
    const inner = JSON.parse(envelope.bodyText);
    operations.push(inner);
    if (inner.operation === "auth.challenge") return Response.json({ ok: true, code: "CHALLENGE", data: { salt, verifier, iterations: 100000, stateVersion: "v1" } });
    assert.equal(inner.body.matched, true);
    assert.match(inner.body.sessionHash, /^[0-9a-f]{64}$/);
    return Response.json({ ok: true, code: "AUTHENTICATED", data: { role: "INPUT" } });
  };
  const response = await handleGatewayRequest(new Request("https://example.test/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "input@example.test", password }) }), env, { fetcher, now: () => 1_800_000_000_000, random });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure; SameSite=Strict/);
  assert.deepEqual(operations.map((item) => item.operation), ["auth.challenge", "auth.complete"]);
  assert.doesNotMatch(JSON.stringify(operations), new RegExp(password));
});

test("authenticated relay hashes the cookie and never forwards the token", async () => {
  let bodyText = "";
  const fetcher = async (_url, init) => { bodyText = init.body; return Response.json({ ok: true, code: "OK", data: { count: 1 } }); };
  const token = "A".repeat(43);
  const response = await handleGatewayRequest(new Request("https://example.test/api/analytics/query", { method: "POST", headers: { "Content-Type": "application/json", Cookie: `session=${token}` }, body: "{}" }), env, { fetcher, random });
  assert.equal(response.status, 200);
  assert.doesNotMatch(bodyText, new RegExp(token));
  assert.match(bodyText, /sessionHash/);
});

test("login rejects malformed and oversized inputs before GAS", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return Response.json({ ok: true, code: "OK" }); };
  const response = await handleGatewayRequest(new Request("https://example.test/api/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), env, { fetcher });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
