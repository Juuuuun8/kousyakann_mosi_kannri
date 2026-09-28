import {
  CREDENTIAL_MODES,
  PASSWORD_ALGORITHMS,
  PASSWORD_POLICY,
  USER_ROLES,
  USER_STATUSES,
} from "./constants.ts";
import type { AuthValidationIssue, AuthValidationResult } from "./types.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const USER_ACCESS_KEYS = [
  "email", "role", "status", "locationId", "credentialMode", "passwordAlgorithm",
  "passwordSalt", "passwordVerifier", "passwordIterations", "passwordUpdatedAt",
  "mustChangePassword", "failedAttemptCount", "lockedUntil",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isOneOf = (values: readonly string[], value: unknown): boolean => isString(value) && values.includes(value);

function issue(path: string, code: string, message: string): AuthValidationIssue { return { path, code, message }; }
function result(issues: AuthValidationIssue[]): AuthValidationResult { return { ok: issues.length === 0, issues }; }

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePasswordValue(password: unknown): AuthValidationResult {
  const issues: AuthValidationIssue[] = [];
  if (!isString(password)) return result([issue("$.password", "STRING", "password must be a string")]);
  const length = Array.from(password).length;
  if (length < PASSWORD_POLICY.minimumLength) issues.push(issue("$.password", "PASSWORD_TOO_SHORT", `password must have at least ${PASSWORD_POLICY.minimumLength} characters`));
  if (length > PASSWORD_POLICY.maximumLength) issues.push(issue("$.password", "PASSWORD_TOO_LONG", `password must have at most ${PASSWORD_POLICY.maximumLength} characters`));
  return result(issues);
}

export function validatePasswordLoginRequest(value: unknown): AuthValidationResult {
  const issues: AuthValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "login request must be an object")]);
  if (!isString(value.email) || !EMAIL_RE.test(value.email) || value.email !== normalizeLoginEmail(value.email)) {
    issues.push(issue("$.email", "EMAIL", "email must be a normalized login address"));
  }
  issues.push(...validatePasswordValue(value.password).issues);
  return result(issues);
}

export function validateUserAccessRecord(value: unknown): AuthValidationResult {
  const issues: AuthValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "user access row must be an object")]);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...USER_ACCESS_KEYS].sort())) {
    issues.push(issue("$", "COLUMN_SET", "row contains missing or forbidden credential columns"));
  }
  if (!isString(value.email) || !EMAIL_RE.test(value.email) || value.email !== normalizeLoginEmail(value.email)) issues.push(issue("$.email", "EMAIL", "email must be normalized and valid"));
  if (!isOneOf(USER_ROLES, value.role)) issues.push(issue("$.role", "ROLE", "unknown user role"));
  if (!isOneOf(USER_STATUSES, value.status)) issues.push(issue("$.status", "STATUS", "unknown user status"));
  if (value.locationId !== null && (!isString(value.locationId) || !ID_RE.test(value.locationId))) issues.push(issue("$.locationId", "LOCATION_ID", "must be a contract identifier or null"));
  if (!isOneOf(CREDENTIAL_MODES, value.credentialMode)) issues.push(issue("$.credentialMode", "CREDENTIAL_MODE", "unknown credential mode"));
  if (typeof value.mustChangePassword !== "boolean") issues.push(issue("$.mustChangePassword", "BOOLEAN", "mustChangePassword must be boolean"));
  if (typeof value.failedAttemptCount !== "number" || !Number.isInteger(value.failedAttemptCount) || value.failedAttemptCount < 0) issues.push(issue("$.failedAttemptCount", "COUNT", "failedAttemptCount must be a non-negative integer"));
  if (value.lockedUntil !== null && (!isString(value.lockedUntil) || !ISO_RE.test(value.lockedUntil))) issues.push(issue("$.lockedUntil", "ISO_DATETIME", "lockedUntil must be UTC datetime or null"));

  if (value.credentialMode === "OTP_ONLY") {
    for (const key of ["passwordAlgorithm", "passwordSalt", "passwordVerifier", "passwordIterations", "passwordUpdatedAt"]) {
      if (value[key] !== null) issues.push(issue(`$.${key}`, "OTP_ONLY_NULL", "password fields must be null for OTP_ONLY"));
    }
  } else {
    if (!isOneOf(PASSWORD_ALGORITHMS, value.passwordAlgorithm)) issues.push(issue("$.passwordAlgorithm", "ALGORITHM", "unsupported password algorithm"));
    if (!isString(value.passwordSalt) || !BASE64URL_RE.test(value.passwordSalt)) issues.push(issue("$.passwordSalt", "BASE64URL", "salt must be non-empty base64url"));
    if (!isString(value.passwordVerifier) || !BASE64URL_RE.test(value.passwordVerifier)) issues.push(issue("$.passwordVerifier", "BASE64URL", "verifier must be non-empty base64url"));
    if (value.passwordIterations !== PASSWORD_POLICY.pbkdf2Iterations) issues.push(issue("$.passwordIterations", "WORK_FACTOR", `iterations must be ${PASSWORD_POLICY.pbkdf2Iterations}`));
    if (!isString(value.passwordUpdatedAt) || !ISO_RE.test(value.passwordUpdatedAt)) issues.push(issue("$.passwordUpdatedAt", "ISO_DATETIME", "passwordUpdatedAt must be UTC datetime"));
  }
  return result(issues);
}
