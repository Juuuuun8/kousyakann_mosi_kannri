import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_POLICY,
  constantTimeTextEqual,
  derivePasswordVerifier,
  generatePasswordSalt,
  normalizeLoginEmail,
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
