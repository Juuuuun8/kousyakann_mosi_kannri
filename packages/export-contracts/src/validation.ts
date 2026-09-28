import {
  ML_EXPORT_ALLOWED_IDENTITY_STATUSES,
  ML_EXPORT_COLUMNS,
  ML_EXPORT_ROLES,
  ML_EXPORT_SCHEMA_VERSION,
} from "./constants.ts";
import type { ExportValidationIssue, ExportValidationResult } from "./types.ts";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ML_ID_RE = /^ml_[A-Za-z0-9._:-]{8,127}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const ABILITY_LEVELS = new Set(["S", "A", "B", "C", "D", "E", "F"]);
const MISSING_REASONS = new Set([
  "NOT_APPLICABLE",
  "NOT_TAKEN",
  "NOT_PRINTED",
  "BLANK_ON_REPORT",
  "UNREADABLE",
  "PARSER_ERROR",
  "UNKNOWN_CODE",
  "REDACTED",
]);
const ROW_KEYS = [
  "exportSchemaVersion", "mlId", "identityStatus", "examEventId", "locationId",
  "subjectDefinitionId", "metricDefinitionId", "score", "maxScore", "scoreRate",
  "deviation", "abilityLevel", "missingReason", "parserVersion", "payloadFormatVersion",
  "featureAsOf",
] as const;
const REQUEST_KEYS = ["actorRole", "exportSchemaVersion", "purpose", "requestedAt", "filter", "rows"] as const;
const FILTER_KEYS = ["examEventIds", "locationIds", "subjectDefinitionIds", "importedAtFrom", "importedAtTo"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumberOrNull = (value: unknown): boolean => value === null || (typeof value === "number" && Number.isFinite(value));
const isOneOf = (values: readonly string[], value: unknown): boolean => typeof value === "string" && values.includes(value);

function issue(path: string, code: string, message: string): ExportValidationIssue { return { path, code, message }; }
function result(issues: ExportValidationIssue[]): ExportValidationResult { return { ok: issues.length === 0, issues }; }

function requiredId(row: Record<string, unknown>, key: string, issues: ExportValidationIssue[]): void {
  if (!isString(row[key]) || !ID_RE.test(row[key])) issues.push(issue(`$.${key}`, "ID", "must be a contract identifier"));
}

function sameKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateIdList(filter: Record<string, unknown>, key: string, issues: ExportValidationIssue[]): void {
  const value = filter[key];
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !isString(item) || !ID_RE.test(item))) {
    issues.push(issue(`$.filter.${key}`, "ID_LIST", "must be a non-empty list of contract identifiers"));
    return;
  }
  if (new Set(value).size !== value.length) issues.push(issue(`$.filter.${key}`, "DUPLICATE", "filter identifiers must be unique"));
}

function validateFilter(value: unknown, issues: ExportValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue("$.filter", "OBJECT", "filter is required"));
    return;
  }
  if (!sameKeys(value, FILTER_KEYS)) issues.push(issue("$.filter", "FILTER_KEYS", "filter contains forbidden keys"));
  for (const key of ["examEventIds", "locationIds", "subjectDefinitionIds"]) validateIdList(value, key, issues);
  for (const key of ["importedAtFrom", "importedAtTo"]) {
    const item = value[key];
    if (item !== undefined && (!isString(item) || !ISO_RE.test(item))) issues.push(issue(`$.filter.${key}`, "ISO_DATETIME", "must be UTC datetime"));
  }
  if (isString(value.importedAtFrom) && isString(value.importedAtTo) && value.importedAtFrom > value.importedAtTo) {
    issues.push(issue("$.filter", "DATE_ORDER", "importedAtFrom must not be after importedAtTo"));
  }
}

export function validateMlExportRow(value: unknown): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "ML row must be an object")]);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...ROW_KEYS].sort())) {
    issues.push(issue("$", "COLUMN_SET", "row contains missing or forbidden columns"));
  }
  if (value.exportSchemaVersion !== ML_EXPORT_SCHEMA_VERSION) issues.push(issue("$.exportSchemaVersion", "VERSION", "unsupported export schema version"));
  if (!isString(value.mlId) || !ML_ID_RE.test(value.mlId)) issues.push(issue("$.mlId", "ML_ID", "must be a generated ML_ID"));
  if (!isOneOf(ML_EXPORT_ALLOWED_IDENTITY_STATUSES, value.identityStatus)) issues.push(issue("$.identityStatus", "IDENTITY_STATUS", "unresolved identity cannot be exported"));
  for (const key of ["examEventId", "locationId", "subjectDefinitionId", "metricDefinitionId"]) requiredId(value, key, issues);
  for (const key of ["score", "maxScore", "scoreRate", "deviation"]) {
    if (!isFiniteNumberOrNull(value[key])) issues.push(issue(`$.${key}`, "NUMBER_OR_NULL", "must be finite or null"));
  }
  if (value.abilityLevel !== null && !ABILITY_LEVELS.has(String(value.abilityLevel))) issues.push(issue("$.abilityLevel", "ABILITY_LEVEL", "unknown ability level"));
  if (value.missingReason !== null && !MISSING_REASONS.has(String(value.missingReason))) issues.push(issue("$.missingReason", "MISSING_REASON", "unknown missing reason"));
  if (!isString(value.parserVersion) || value.parserVersion.length === 0) issues.push(issue("$.parserVersion", "STRING", "parserVersion is required"));
  if (value.payloadFormatVersion !== null && (!isString(value.payloadFormatVersion) || value.payloadFormatVersion.length === 0)) issues.push(issue("$.payloadFormatVersion", "STRING_OR_NULL", "must be a string or null"));
  if (!isString(value.featureAsOf) || !ISO_RE.test(value.featureAsOf)) issues.push(issue("$.featureAsOf", "ISO_DATETIME", "must be UTC datetime"));
  return result(issues);
}

export function validateMlExportRows(rows: unknown): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];
  if (!Array.isArray(rows)) return result([issue("$", "ARRAY", "rows must be an array")]);
  const keys = new Set<string>();
  rows.forEach((row, index) => {
    const rowResult = validateMlExportRow(row);
    issues.push(...rowResult.issues.map((item) => ({ ...item, path: `$[${index}]${item.path.slice(1)}` })));
    if (isRecord(row)) {
      const key = [row.mlId, row.examEventId, row.subjectDefinitionId, row.metricDefinitionId].join("|");
      if (keys.has(key)) issues.push(issue(`$[${index}]`, "DUPLICATE", "duplicate ML observation"));
      keys.add(key);
    }
  });
  return result(issues);
}

export function validateMlExportRequest(value: unknown): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "export request must be an object")]);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...REQUEST_KEYS].sort())) issues.push(issue("$", "REQUEST_KEYS", "request contains missing or forbidden keys"));
  if (!isOneOf(ML_EXPORT_ROLES, value.actorRole)) issues.push(issue("$.actorRole", "ROLE", "only ADMIN may export"));
  if (value.exportSchemaVersion !== ML_EXPORT_SCHEMA_VERSION) issues.push(issue("$.exportSchemaVersion", "VERSION", "unsupported export schema version"));
  if (!isString(value.purpose) || value.purpose.trim().length === 0) issues.push(issue("$.purpose", "PURPOSE", "purpose is required"));
  if (!isString(value.requestedAt) || !ISO_RE.test(value.requestedAt)) issues.push(issue("$.requestedAt", "ISO_DATETIME", "must be UTC datetime"));
  validateFilter(value.filter, issues);
  const rowsResult = validateMlExportRows(value.rows);
  issues.push(...rowsResult.issues.map((item) => ({ ...item, path: `$.rows${item.path.slice(1)}` })));
  return result(issues);
}

export function mlExportColumns(): readonly string[] { return ML_EXPORT_COLUMNS; }
