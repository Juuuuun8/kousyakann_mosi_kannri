export const USER_ROLES = ["INPUT", "ADMIN", "AUTH_MANAGER"] as const;
export const USER_STATUSES = ["ACTIVE", "REVOKED"] as const;
export const CREDENTIAL_MODES = ["PASSWORD", "OTP_ONLY", "PASSWORD_WITH_OTP_RECOVERY"] as const;
export const PASSWORD_ALGORITHMS = ["PBKDF2-HMAC-SHA256"] as const;

export const PASSWORD_POLICY = {
  minimumLength: 15,
  maximumLength: 128,
  pbkdf2Iterations: 600000,
  saltBytes: 16,
  verifierBytes: 32,
  maximumFailedAttempts: 5,
  lockoutMinutes: 15,
} as const;

export const PUBLIC_AUTH_FAILURE = "AUTHENTICATION_FAILED" as const;
