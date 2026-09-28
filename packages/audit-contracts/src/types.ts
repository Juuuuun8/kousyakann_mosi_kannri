export const AUDIT_ROLES = ["INPUT", "ADMIN", "AUTH_MANAGER", "SYSTEM"] as const;
export const AUDIT_ACTIONS = [
  "LOGIN", "LOGOUT", "PASSWORD_CHANGE", "CREDENTIAL_RESET", "SESSION_REVOKE",
  "PDF_REGISTER", "REPORT_REJECT", "REPORT_SUPERSEDE", "ANALYSIS_VIEW", "ML_EXPORT",
] as const;
export const AUDIT_RESULTS = ["SUCCESS", "DENIED", "FAILED", "REVIEW_REQUIRED"] as const;
export const AUDIT_TARGET_KINDS = ["NONE", "USER", "REPORT", "EXAM_EVENT", "EXPORT"] as const;

export type AuditRole = (typeof AUDIT_ROLES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export type AuditTargetKind = (typeof AUDIT_TARGET_KINDS)[number];

/** Closed, row-oriented audit contract. It cannot represent PDF, CSV, payload, score, or student-name bodies. */
export interface AuditRecord {
  readonly auditId: string;
  readonly occurredAt: string;
  readonly actorUserId: string;
  readonly actorRole: AuditRole;
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly requestId: string;
  readonly targetKind: AuditTargetKind;
  readonly targetId: string | null;
  readonly detailCode: string;
  readonly itemCount: number | null;
  readonly purpose: string | null;
  readonly previousHash: string | null;
  readonly recordHash: string;
}

export type NewAuditRecord = Omit<AuditRecord, "recordHash">;

export interface AuditValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AuditValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AuditValidationIssue[];
}
