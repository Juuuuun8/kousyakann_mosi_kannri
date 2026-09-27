import {
  ABILITY_LEVELS,
  ANSWER_CORRECTNESS_CODES,
  EMAIL_PATTERN,
  IDENTITY_STATUSES,
  ISO_DATETIME_PATTERN,
  IDENTIFIER_PATTERN,
  MISSING_REASONS,
  PAYLOAD_TEXT_MAX_LENGTH,
  PAYLOAD_TYPES,
  PERSON_STATUSES,
  REPORT_STATUSES,
  SHA256_HEX_PATTERN,
  UUID_PATTERN,
} from "./constants.ts";
import type {
  AnswerCorrectnessCode,
  PayloadJson,
  PayloadRecord,
  ReportRecord,
  SubjectScoreRecord,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";

type UnknownRecord = Record<string, unknown>;

const UUID_RE = new RegExp(UUID_PATTERN);
const HASH_RE = new RegExp(SHA256_HEX_PATTERN);
const ID_RE = new RegExp(IDENTIFIER_PATTERN);
const DATETIME_RE = new RegExp(ISO_DATETIME_PATTERN);
const EMAIL_RE = new RegExp(EMAIL_PATTERN);
const PAYLOAD_JSON_TYPE_BY_RECORD_TYPE: Record<string, string> = {
  TREND: "trend",
  DOMAIN: "domain_results",
  ANSWER_MARKS: "answer_marks",
  TARGETS: "targets",
  NARRATIVE: "narrative",
  RAW_LABELS: "raw_labels",
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

const isOneOf = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === "string" && (values as readonly string[]).includes(value);

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function requiredString(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  const value = object[key];
  if (!isString(value) || value.length === 0) {
    issues.push(issue(`${path}.${key}`, "REQUIRED_STRING", "must be a non-empty string"));
    return null;
  }
  return value;
}

function uuidField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
  nullable = false,
): void {
  const value = object[key];
  if (nullable && value === null) return;
  if (!isString(value) || !UUID_RE.test(value)) {
    issues.push(issue(`${path}.${key}`, "UUID", "must be an RFC 4122 UUID string"));
  }
}

function identifierField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
  nullable = false,
): void {
  const value = object[key];
  if (nullable && value === null) return;
  if (!isString(value) || !ID_RE.test(value)) {
    issues.push(issue(`${path}.${key}`, "IDENTIFIER", "must use the contract identifier format"));
  }
}

function hashField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
  nullable = false,
): void {
  const value = object[key];
  if (nullable && value === null) return;
  if (!isString(value) || !HASH_RE.test(value)) {
    issues.push(issue(`${path}.${key}`, "SHA256", "must be a lowercase 64-character SHA-256 hex string"));
  }
}

function datetimeField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = object[key];
  if (!isString(value) || !DATETIME_RE.test(value)) {
    issues.push(issue(`${path}.${key}`, "ISO_DATETIME", "must be an ISO-8601 UTC datetime"));
  }
}

function nonNegativeInteger(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
  min = 0,
): void {
  const value = object[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    issues.push(issue(`${path}.${key}`, "NON_NEGATIVE_INTEGER", `must be an integer >= ${min}`));
  }
}

function nullableNumberField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isNullableNumber(object[key])) {
    issues.push(issue(`${path}.${key}`, "NUMBER_OR_NULL", "must be a finite number or null"));
  }
}

function nullableTextField(
  object: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isNullableString(object[key])) {
    issues.push(issue(`${path}.${key}`, "STRING_OR_NULL", "must be a string or null"));
  }
}

function result(issues: ValidationIssue[]): ValidationResult {
  return { ok: issues.length === 0, issues };
}

export function validateReportRecord(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "must be an object")]);
  const path = "$";

  uuidField(value, "reportId", path, issues);
  if (!isOneOf(REPORT_STATUSES, value.status)) {
    issues.push(issue("$.status", "ENUM", "unknown report status"));
  }
  identifierField(value, "locationId", path, issues);
  identifierField(value, "examEventId", path, issues);
  uuidField(value, "personId", path, issues, true);
  if (!isOneOf(IDENTITY_STATUSES, value.identityStatus)) {
    issues.push(issue("$.identityStatus", "ENUM", "unknown identity status"));
  }
  nullableTextField(value, "examCandidateId", path, issues);
  for (const key of [
    "schoolCodeRaw",
    "schoolNameRaw",
    "gradeRaw",
    "classRaw",
    "localNumberRaw",
    "studentNameKanaRaw",
  ]) nullableTextField(value, key, path, issues);
  identifierField(value, "schemaVersionId", path, issues);
  requiredString(value, "parserVersion", path, issues);
  requiredString(value, "normalizationVersion", path, issues);
  hashField(value, "pdfHash", path, issues);
  hashField(value, "semanticFingerprint", path, issues);
  nonNegativeInteger(value, "pageCount", path, issues, 1);
  nonNegativeInteger(value, "subjectCount", path, issues);
  nonNegativeInteger(value, "payloadCount", path, issues);
  datetimeField(value, "importedAt", path, issues);
  const importedBy = requiredString(value, "importedBy", path, issues);
  if (importedBy !== null && !EMAIL_RE.test(importedBy)) {
    issues.push(issue("$.importedBy", "EMAIL", "must be an email-like actor identifier"));
  }
  uuidField(value, "supersedesReportId", path, issues, true);
  return result(issues);
}

export function validateSubjectScoreRecord(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "must be an object")]);
  const path = "$";
  uuidField(value, "recordId", path, issues);
  uuidField(value, "reportId", path, issues);
  identifierField(value, "subjectDefinitionId", path, issues);
  identifierField(value, "metricDefinitionId", path, issues);
  for (const key of [
    "score",
    "maxScore",
    "scoreRate",
    "deviation",
    "nationalAverage",
    "nationalRank",
    "nationalPopulation",
    "currentStudentAverage",
    "graduateAverage",
    "currentRank",
    "currentPopulation",
    "schoolDeviation",
    "schoolAverage",
    "schoolRank",
    "schoolPopulation",
  ]) nullableNumberField(value, key, path, issues);
  if (value.abilityLevel !== null && !isOneOf(ABILITY_LEVELS, value.abilityLevel)) {
    issues.push(issue("$.abilityLevel", "ENUM", "unknown ability level"));
  }
  if (value.missingReason !== null && !isOneOf(MISSING_REASONS, value.missingReason)) {
    issues.push(issue("$.missingReason", "ENUM", "unknown missing reason"));
  }
  nullableTextField(value, "sourceLabelRaw", path, issues);
  hashField(value, "valueHash", path, issues, true);
  identifierField(value, "schemaVersionId", path, issues);
  requiredString(value, "parserVersion", path, issues);
  requiredString(value, "normalizationVersion", path, issues);
  return result(issues);
}

function isNullableMissingReason(value: unknown): boolean {
  return value === null || isOneOf(MISSING_REASONS, value);
}

function validatePayloadJsonInternal(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "OBJECT", "payload JSON must be an object"));
    return;
  }
  if (value.v !== 1) issues.push(issue(`${path}.v`, "VERSION", "only payload version 1 is supported"));
  if (!isString(value.type)) {
    issues.push(issue(`${path}.type`, "TYPE", "payload type is required"));
    return;
  }
  if (!Array.isArray(value.items)) {
    issues.push(issue(`${path}.items`, "ARRAY", "payload items must be an array"));
    return;
  }

  if (value.type === "answer_marks") {
    if (!isString(value.subject) || value.subject.length === 0) {
      issues.push(issue(`${path}.subject`, "REQUIRED_STRING", "answer mark subject is required"));
    }
    value.items.forEach((item, index) => {
      const itemPath = `${path}.items[${index}]`;
      if (!Array.isArray(item) || item.length !== 6) {
        issues.push(issue(itemPath, "TUPLE_LENGTH", "answer mark tuple must have exactly six elements"));
        return;
      }
      const [major, answerRaw, correctnessRaw, correctnessCode, markRaw, missingReason] = item;
      if (major !== null && (typeof major !== "number" || !Number.isInteger(major) || major < 1)) {
        issues.push(issue(`${itemPath}[0]`, "QUESTION_NUMBER", "major question must be a positive integer or null"));
      }
      if (!isString(answerRaw) || answerRaw.length === 0) {
        issues.push(issue(`${itemPath}[1]`, "REQUIRED_STRING", "answer number raw value is required"));
      }
      if (!isNullableString(correctnessRaw) || !isNullableString(markRaw)) {
        issues.push(issue(itemPath, "STRING_OR_NULL", "raw answer fields must be strings or null"));
      }
      if (correctnessCode !== null && !isOneOf(ANSWER_CORRECTNESS_CODES, correctnessCode)) {
        issues.push(issue(`${itemPath}[3]`, "ENUM", "unknown answer correctness code"));
      }
      if (!isNullableMissingReason(missingReason)) {
        issues.push(issue(`${itemPath}[5]`, "ENUM", "unknown missing reason"));
      }
    });
    return;
  }

  if (!["domain_results", "trend", "targets", "narrative", "raw_labels"].includes(value.type)) {
    issues.push(issue(`${path}.type`, "ENUM", "unknown payload type"));
  }
}

export function validatePayloadJson(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  validatePayloadJsonInternal(value, "$", issues);
  return result(issues);
}

export function validatePayloadRecord(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "must be an object")]);
  const path = "$";
  uuidField(value, "payloadId", path, issues);
  uuidField(value, "reportId", path, issues);
  if (!isOneOf(PAYLOAD_TYPES, value.payloadType)) {
    issues.push(issue("$.payloadType", "ENUM", "unknown payload type"));
  }
  identifierField(value, "subjectDefinitionId", path, issues, true);
  requiredString(value, "payloadFormatVersion", path, issues);
  nonNegativeInteger(value, "chunkIndex", path, issues);
  nonNegativeInteger(value, "chunkCount", path, issues, 1);
  nonNegativeInteger(value, "itemCount", path, issues);
  if (typeof value.chunkIndex === "number" && typeof value.chunkCount === "number" && value.chunkIndex >= value.chunkCount) {
    issues.push(issue("$.chunkIndex", "CHUNK_RANGE", "chunkIndex must be smaller than chunkCount"));
  }
  hashField(value, "payloadHash", path, issues);
  hashField(value, "chunkHash", path, issues);
  if (!isString(value.jsonText) || value.jsonText.length === 0) {
    issues.push(issue("$.jsonText", "JSON_TEXT", "jsonText must be non-empty"));
  } else if (value.jsonText.length > PAYLOAD_TEXT_MAX_LENGTH) {
    issues.push(issue("$.jsonText", "JSON_TEXT_LENGTH", `jsonText must be <= ${PAYLOAD_TEXT_MAX_LENGTH} characters`));
  } else {
    try {
      const parsed: unknown = JSON.parse(value.jsonText);
      const payloadResult = validatePayloadJson(parsed);
      for (const payloadIssue of payloadResult.issues) {
        issues.push(issue(`$.jsonText${payloadIssue.path.slice(1)}`, payloadIssue.code, payloadIssue.message));
      }
      if (
        isRecord(parsed) &&
        isString(value.payloadType) &&
        isString(parsed.type) &&
        PAYLOAD_JSON_TYPE_BY_RECORD_TYPE[value.payloadType] !== parsed.type
      ) {
        issues.push(issue("$.jsonText.type", "PAYLOAD_TYPE_MISMATCH", "payloadType must match the embedded JSON type"));
      }
    } catch {
      issues.push(issue("$.jsonText", "JSON_PARSE", "jsonText must contain valid JSON"));
    }
  }
  datetimeField(value, "createdAt", path, issues);
  return result(issues);
}

export function isPayloadJson(value: unknown): value is PayloadJson {
  return validatePayloadJson(value).ok;
}

export function isReportRecord(value: unknown): value is ReportRecord {
  return validateReportRecord(value).ok;
}

export function isSubjectScoreRecord(value: unknown): value is SubjectScoreRecord {
  return validateSubjectScoreRecord(value).ok;
}

export function isPayloadRecord(value: unknown): value is PayloadRecord {
  return validatePayloadRecord(value).ok;
}
