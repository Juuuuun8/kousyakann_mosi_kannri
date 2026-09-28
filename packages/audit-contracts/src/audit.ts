import {
  AUDIT_ACTIONS, AUDIT_RESULTS, AUDIT_ROLES, AUDIT_TARGET_KINDS,
  type AuditRecord, type AuditValidationIssue, type AuditValidationResult, type NewAuditRecord,
} from "./types.ts";

const KEYS = [
  "auditId", "occurredAt", "actorUserId", "actorRole", "action", "result", "requestId",
  "targetKind", "targetId", "detailCode", "itemCount", "purpose", "previousHash", "recordHash",
] as const;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const CODE_RE = /^[A-Z0-9_]{1,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const HASH_RE = /^[a-f0-9]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...KEYS].sort());
const issue = (path: string, code: string, message: string): AuditValidationIssue => ({ path, code, message });
const oneOf = (items: readonly string[], value: unknown): boolean => typeof value === "string" && items.includes(value);

function canonical(value: NewAuditRecord): string {
  return JSON.stringify([
    value.auditId, value.occurredAt, value.actorUserId, value.actorRole, value.action, value.result,
    value.requestId, value.targetKind, value.targetId, value.detailCode, value.itemCount, value.purpose,
    value.previousHash,
  ]);
}

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAuditRecord(input: NewAuditRecord): Promise<AuditRecord> {
  const record = { ...input, recordHash: await sha256(canonical(input)) } satisfies AuditRecord;
  const validation = validateAuditRecord(record);
  if (!validation.ok) throw new Error(`invalid audit record: ${validation.issues.map((item) => item.code).join(",")}`);
  return record;
}

export function validateAuditRecord(value: unknown): AuditValidationResult {
  const issues: AuditValidationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [issue("$", "OBJECT", "audit record must be an object")] };
  if (!hasExactKeys(value)) issues.push(issue("$", "COLUMN_SET", "audit record contains missing or forbidden columns"));
  for (const key of ["auditId", "actorUserId", "requestId"]) if (typeof value[key] !== "string" || !ID_RE.test(value[key])) issues.push(issue(`$.${key}`, "ID", "must be a contract identifier"));
  if (typeof value.occurredAt !== "string" || !ISO_RE.test(value.occurredAt)) issues.push(issue("$.occurredAt", "ISO_DATETIME", "must be UTC datetime"));
  if (!oneOf(AUDIT_ROLES, value.actorRole)) issues.push(issue("$.actorRole", "ROLE", "unknown audit role"));
  if (!oneOf(AUDIT_ACTIONS, value.action)) issues.push(issue("$.action", "ACTION", "unknown audit action"));
  if (!oneOf(AUDIT_RESULTS, value.result)) issues.push(issue("$.result", "RESULT", "unknown audit result"));
  if (!oneOf(AUDIT_TARGET_KINDS, value.targetKind)) issues.push(issue("$.targetKind", "TARGET_KIND", "unknown target kind"));
  if (value.targetKind === "NONE" ? value.targetId !== null : typeof value.targetId !== "string" || !ID_RE.test(String(value.targetId))) issues.push(issue("$.targetId", "TARGET_ID", "target ID must match target kind"));
  if (typeof value.detailCode !== "string" || !CODE_RE.test(value.detailCode)) issues.push(issue("$.detailCode", "DETAIL_CODE", "must be an uppercase closed code"));
  if (value.itemCount !== null && (!Number.isSafeInteger(value.itemCount) || Number(value.itemCount) < 0)) issues.push(issue("$.itemCount", "ITEM_COUNT", "must be a non-negative safe integer or null"));
  if (value.purpose !== null && (typeof value.purpose !== "string" || value.purpose.trim().length === 0 || value.purpose.length > 200 || /[\r\n\u0000-\u001f]/u.test(value.purpose))) issues.push(issue("$.purpose", "PURPOSE", "must be a single-line purpose of at most 200 characters"));
  if (value.action === "ML_EXPORT" && (value.purpose === null || value.itemCount === null || value.targetKind !== "EXPORT")) issues.push(issue("$", "ML_EXPORT_FIELDS", "ML export audit requires purpose, item count, and export target"));
  if (value.previousHash !== null && (typeof value.previousHash !== "string" || !HASH_RE.test(value.previousHash))) issues.push(issue("$.previousHash", "HASH", "must be a SHA-256 hex digest or null"));
  if (typeof value.recordHash !== "string" || !HASH_RE.test(value.recordHash)) issues.push(issue("$.recordHash", "HASH", "must be a SHA-256 hex digest"));
  return { ok: issues.length === 0, issues };
}

export async function verifyAuditChain(records: readonly AuditRecord[]): Promise<AuditValidationResult> {
  const issues: AuditValidationIssue[] = [];
  let previous: string | null = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const validation = validateAuditRecord(record);
    issues.push(...validation.issues.map((item) => ({ ...item, path: `$[${index}]${item.path.slice(1)}` })));
    if (record.previousHash !== previous) issues.push(issue(`$[${index}].previousHash`, "CHAIN", "previous hash does not match preceding record"));
    const { recordHash: _recordHash, ...unsigned } = record;
    if (await sha256(canonical(unsigned)) !== record.recordHash) issues.push(issue(`$[${index}].recordHash`, "INTEGRITY", "record content does not match its hash"));
    previous = record.recordHash;
  }
  return { ok: issues.length === 0, issues };
}
