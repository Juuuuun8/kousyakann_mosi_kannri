import type { IsoDateTime, LocationId } from "../../contracts/src/types.ts";
import type { CREDENTIAL_MODES, PASSWORD_ALGORITHMS, USER_ROLES, USER_STATUSES } from "./constants.ts";

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type CredentialMode = (typeof CREDENTIAL_MODES)[number];
export type PasswordAlgorithm = (typeof PASSWORD_ALGORITHMS)[number];

/**
 * One restricted Users-sheet row. No plaintext or reversible password field is
 * allowed. Null credential fields are permitted only for OTP_ONLY users.
 */
export interface UserAccessRecord {
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly locationId: LocationId | null;
  readonly credentialMode: CredentialMode;
  readonly passwordAlgorithm: PasswordAlgorithm | null;
  readonly passwordSalt: string | null;
  readonly passwordVerifier: string | null;
  readonly passwordIterations: number | null;
  readonly passwordUpdatedAt: IsoDateTime | null;
  readonly mustChangePassword: boolean;
  readonly failedAttemptCount: number;
  readonly lockedUntil: IsoDateTime | null;
}

/** Raw password exists only in request memory and must never be logged. */
export interface PasswordLoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface PasswordLoginPublicResult {
  readonly ok: boolean;
  readonly code: "AUTHENTICATED" | "AUTHENTICATION_FAILED" | "PASSWORD_CHANGE_REQUIRED";
}

export interface AuthValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AuthValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AuthValidationIssue[];
}
