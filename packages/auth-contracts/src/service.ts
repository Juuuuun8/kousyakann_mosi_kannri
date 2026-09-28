import type { IsoDateTime, Sha256Hex } from "../../contracts/src/types.ts";
import { PASSWORD_POLICY, PUBLIC_AUTH_FAILURE } from "./constants.ts";
import { constantTimeTextEqual, derivePasswordVerifier } from "./password.ts";
import type { AuthorizedAction, PasswordEvaluation, PasswordLoginRequest, SessionRecord, UserAccessRecord } from "./types.ts";
import { validatePasswordLoginRequest, validateUserAccessRecord } from "./validation.ts";

export interface DummyPasswordCredential {
  readonly salt: string;
  readonly verifier: string;
}

function asIso(value: Date): IsoDateTime { return value.toISOString() as IsoDateTime; }

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hash(value: string): Promise<Sha256Hex> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("") as Sha256Hex;
}

export async function evaluatePasswordLogin(request: PasswordLoginRequest, user: UserAccessRecord | null, dummy: DummyPasswordCredential, now: Date): Promise<PasswordEvaluation> {
  if (!validatePasswordLoginRequest(request).ok) return { publicResult: { ok: false, code: PUBLIC_AUTH_FAILURE }, updatedUser: user, authenticatedUser: null };
  if (user !== null && !validateUserAccessRecord(user).ok) throw new Error("user access record violates the closed contract");
  const passwordEnabled = user !== null && user.credentialMode !== "OTP_ONLY" && user.passwordSalt !== null && user.passwordVerifier !== null;
  const actual = await derivePasswordVerifier(request.password, passwordEnabled ? user.passwordSalt! : dummy.salt);
  const expected = passwordEnabled ? user.passwordVerifier! : dummy.verifier;
  const passwordMatches = constantTimeTextEqual(actual, expected);
  const locked = user?.lockedUntil !== null && user?.lockedUntil !== undefined && Date.parse(user.lockedUntil) > now.getTime();
  const allowed = user !== null && user.status === "ACTIVE" && passwordEnabled && !locked && passwordMatches;
  if (!allowed) {
    if (user === null || user.status !== "ACTIVE" || locked) return { publicResult: { ok: false, code: PUBLIC_AUTH_FAILURE }, updatedUser: user, authenticatedUser: null };
    const failures = user.failedAttemptCount + 1;
    const lockDate = failures >= PASSWORD_POLICY.maximumFailedAttempts ? new Date(now.getTime() + PASSWORD_POLICY.lockoutMinutes * 60_000) : null;
    const updatedUser = { ...user, failedAttemptCount: failures, lockedUntil: lockDate ? asIso(lockDate) : null };
    return { publicResult: { ok: false, code: PUBLIC_AUTH_FAILURE }, updatedUser, authenticatedUser: null };
  }
  const updatedUser = { ...user, failedAttemptCount: 0, lockedUntil: null };
  return { publicResult: { ok: true, code: updatedUser.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : "AUTHENTICATED" }, updatedUser, authenticatedUser: updatedUser };
}

const ACTION_ROLES: Readonly<Record<AuthorizedAction, readonly UserAccessRecord["role"][]>> = {
  CREATE_REPORT: ["INPUT", "ADMIN", "AUTH_MANAGER"], READ_REPORTS: ["ADMIN", "AUTH_MANAGER"], ANALYZE: ["ADMIN", "AUTH_MANAGER"],
  EXPORT_ML: ["ADMIN", "AUTH_MANAGER"], RESET_CREDENTIAL: ["AUTH_MANAGER"], CHANGE_PASSWORD: ["INPUT", "ADMIN", "AUTH_MANAGER"], LOGOUT: ["INPUT", "ADMIN", "AUTH_MANAGER"],
};

export function authorizeAction(user: UserAccessRecord, action: AuthorizedAction): boolean {
  if (!validateUserAccessRecord(user).ok || user.status !== "ACTIVE") return false;
  if (user.mustChangePassword && action !== "CHANGE_PASSWORD" && action !== "LOGOUT") return false;
  return ACTION_ROLES[action].includes(user.role);
}

export async function createSessionRecord(email: string, now: Date, lifetimeSeconds = 21600): Promise<{ readonly token: string; readonly record: SessionRecord }> {
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 21600) throw new Error("session lifetime must be 60-21600 seconds");
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64Url(tokenBytes);
  return { token, record: { sessionHash: await hash(token), email, issuedAt: asIso(now), expiresAt: asIso(new Date(now.getTime() + lifetimeSeconds * 1000)), revokedAt: null } };
}

export async function sessionMatches(token: string, record: SessionRecord, now: Date): Promise<boolean> {
  if (!token || record.revokedAt !== null || Date.parse(record.expiresAt) <= now.getTime()) return false;
  return constantTimeTextEqual(await hash(token), record.sessionHash);
}

export function sessionCookie(token: string, maxAgeSeconds = 21600): string {
  if (!/^[A-Za-z0-9_-]{40,}$/u.test(token) || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0 || maxAgeSeconds > 21600) throw new Error("session cookie parameters are invalid");
  return `session=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}
