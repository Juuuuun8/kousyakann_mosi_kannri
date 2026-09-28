import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_POLICY,
  authorizeAction,
  constantTimeTextEqual,
  createSessionRecord,
  derivePasswordVerifier,
  evaluatePasswordLogin,
  generatePasswordSalt,
  normalizeLoginEmail,
  sessionCookie,
  sessionMatches,
  validatePasswordLoginRequest,
  validatePasswordValue,
  validateUserAccessRecord,
} from "../src/index.ts";

function user(overrides = {}) {
  return {
    email: "synthetic.user@example.invalid",
    role: "INPUT",
    status: "ACTIVE",
    locationId: "loc.synthetic.1",
    credentialMode: "PASSWORD_WITH_OTP_RECOVERY",
    passwordAlgorithm: "PBKDF2-HMAC-SHA256",
    passwordSalt: "AAECAwQFBgcICQoLDA0ODw",
    passwordVerifier: "zANnSG9vTTB8xWHfTsgRkxuAb0pav6DzIU6VN7jTuxM",
    passwordIterations: PASSWORD_POLICY.pbkdf2Iterations,
    passwordUpdatedAt: "2026-09-28T00:00:00Z",
    mustChangePassword: true,
    failedAttemptCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

test("Users row allows only verifier fields and rejects plaintext-like extras", () => {
  assert.equal(validateUserAccessRecord(user()).ok, true);
  const plaintextKey = ["password", "Plaintext"].join("");
  assert.equal(validateUserAccessRecord({ ...user(), [plaintextKey]: "forbidden" }).ok, false);
  assert.equal(validateUserAccessRecord(user({ status: "UNKNOWN" })).ok, false);
  assert.equal(validateUserAccessRecord(user({ passwordIterations: 1 })).ok, false);
});

test("OTP-only row cannot retain password credential values", () => {
  const valid = user({
    credentialMode: "OTP_ONLY",
    passwordAlgorithm: null,
    passwordSalt: null,
    passwordVerifier: null,
    passwordIterations: null,
    passwordUpdatedAt: null,
    mustChangePassword: false,
  });
  assert.equal(validateUserAccessRecord(valid).ok, true);
  assert.equal(validateUserAccessRecord({ ...valid, passwordSalt: "not-allowed" }).ok, false);
});

test("login request normalizes email and applies length-only password policy", () => {
  assert.equal(normalizeLoginEmail("  SYNTHETIC.USER@EXAMPLE.INVALID "), "synthetic.user@example.invalid");
  assert.equal(validatePasswordValue("correct horse battery staple").ok, true);
  assert.equal(validatePasswordValue("too-short").ok, false);
  assert.equal(validatePasswordLoginRequest({ email: "synthetic.user@example.invalid", password: "correct horse battery staple" }).ok, true);
});

test("PBKDF2 verifier is deterministic, salted, and constant-time comparable", async () => {
  const password = "synthetic passphrase for tests";
  const firstSalt = generatePasswordSalt();
  const secondSalt = generatePasswordSalt();
  assert.notEqual(firstSalt, secondSalt);
  const first = await derivePasswordVerifier(password, firstSalt);
  const repeated = await derivePasswordVerifier(password, firstSalt);
  const second = await derivePasswordVerifier(password, secondSalt);
  assert.equal(constantTimeTextEqual(first, repeated), true);
  assert.equal(constantTimeTextEqual(first, second), false);
});

test("password evaluation authenticates, requires initial change, and clears failures", async () => {
  const password = "synthetic passphrase for login";
  const salt = generatePasswordSalt();
  const verifier = await derivePasswordVerifier(password, salt);
  const record = user({ passwordSalt: salt, passwordVerifier: verifier, failedAttemptCount: 2, lockedUntil: null });
  const result = await evaluatePasswordLogin({ email: record.email, password }, record, { salt, verifier }, new Date("2026-09-29T00:00:00Z"));
  assert.deepEqual(result.publicResult, { ok: true, code: "PASSWORD_CHANGE_REQUIRED" });
  assert.equal(result.updatedUser.failedAttemptCount, 0);
  assert.equal(result.updatedUser.lockedUntil, null);
});

test("wrong, absent, revoked, and locked identities share one public failure", async () => {
  const password = "synthetic passphrase for login";
  const salt = generatePasswordSalt();
  const verifier = await derivePasswordVerifier(password, salt);
  const dummy = { salt, verifier };
  const request = { email: "synthetic.user@example.invalid", password: "different synthetic passphrase" };
  const current = user({ passwordSalt: salt, passwordVerifier: verifier, mustChangePassword: false });
  const results = await Promise.all([
    evaluatePasswordLogin(request, current, dummy, new Date("2026-09-29T00:00:00Z")),
    evaluatePasswordLogin(request, null, dummy, new Date("2026-09-29T00:00:00Z")),
    evaluatePasswordLogin(request, user({ ...current, status: "REVOKED" }), dummy, new Date("2026-09-29T00:00:00Z")),
    evaluatePasswordLogin(request, user({ ...current, lockedUntil: "2026-09-29T00:10:00Z" }), dummy, new Date("2026-09-29T00:00:00Z")),
  ]);
  assert.ok(results.every((result) => JSON.stringify(result.publicResult) === JSON.stringify({ ok: false, code: "AUTHENTICATION_FAILED" })));
});

test("five failures lock the account for fifteen minutes", async () => {
  const password = "synthetic passphrase for login";
  const salt = generatePasswordSalt();
  const verifier = await derivePasswordVerifier(password, salt);
  const dummy = { salt, verifier };
  let record = user({ passwordSalt: salt, passwordVerifier: verifier, mustChangePassword: false });
  for (let index = 0; index < 5; index += 1) {
    const result = await evaluatePasswordLogin({ email: record.email, password: "different synthetic passphrase" }, record, dummy, new Date("2026-09-29T00:00:00Z"));
    record = result.updatedUser;
  }
  assert.equal(record.failedAttemptCount, 5);
  assert.equal(record.lockedUntil, "2026-09-29T00:15:00.000Z");
});

test("role authorization preserves INPUT register-only and initial-change gates", () => {
  const inputUser = user({ mustChangePassword: false });
  assert.equal(authorizeAction(inputUser, "CREATE_REPORT"), true);
  assert.equal(authorizeAction(inputUser, "READ_REPORTS"), false);
  assert.equal(authorizeAction(user({ role: "ADMIN", mustChangePassword: false }), "EXPORT_ML"), true);
  assert.equal(authorizeAction(user({ role: "AUTH_MANAGER", mustChangePassword: false }), "RESET_CREDENTIAL"), true);
  assert.equal(authorizeAction(user({ role: "AUTH_MANAGER", mustChangePassword: false }), "READ_REPORTS"), false);
  assert.equal(authorizeAction(user({ role: "AUTH_MANAGER", mustChangePassword: false }), "EXPORT_ML"), false);
  assert.equal(authorizeAction(user({ role: "ADMIN", status: "REVOKED", mustChangePassword: false }), "ANALYZE"), false);
  assert.equal(authorizeAction(user({ role: "ADMIN", mustChangePassword: true }), "ANALYZE"), false);
  assert.equal(authorizeAction(user({ role: "ADMIN", mustChangePassword: true }), "CHANGE_PASSWORD"), true);
});

test("session stores only a hash and produces a strict secure cookie", async () => {
  const issued = await createSessionRecord("synthetic.user@example.invalid", new Date("2026-09-29T00:00:00Z"), 3600);
  assert.notEqual(issued.record.sessionHash, issued.token);
  assert.equal(await sessionMatches(issued.token, issued.record, new Date("2026-09-29T00:30:00Z")), true);
  assert.equal(await sessionMatches(issued.token, issued.record, new Date("2026-09-29T01:00:00Z")), false);
  assert.match(sessionCookie(issued.token, 3600), /HttpOnly; Secure; SameSite=Strict/u);
});
