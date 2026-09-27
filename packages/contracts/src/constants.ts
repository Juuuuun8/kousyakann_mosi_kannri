export const REPORT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUPERSEDED",
  "REJECTED",
] as const;

export const IDENTITY_STATUSES = [
  "RESOLVED",
  "NEW_CONFIRMED",
  "AMBIGUOUS",
  "UNRESOLVED",
] as const;

export const PERSON_STATUSES = ["ACTIVE", "MERGED", "SPLIT_REVIEW"] as const;

export const MISSING_REASONS = [
  "NOT_APPLICABLE",
  "NOT_TAKEN",
  "NOT_PRINTED",
  "BLANK_ON_REPORT",
  "UNREADABLE",
  "PARSER_ERROR",
  "UNKNOWN_CODE",
  "REDACTED",
] as const;

export const PAYLOAD_TYPES = [
  "TREND",
  "DOMAIN",
  "ANSWER_MARKS",
  "TARGETS",
  "NARRATIVE",
  "RAW_LABELS",
] as const;

export const ANSWER_CORRECTNESS_CODES = [
  "CORRECT",
  "WRONG",
  "PARTIAL",
  "UNDETERMINED",
  "NO_ANSWER",
  "EXTRA_MARK",
] as const;

export const ABILITY_LEVELS = ["S", "A", "B", "C", "D", "E", "F"] as const;

export const IDENTIFIER_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
export const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
export const SHA256_HEX_PATTERN = "^[0-9a-f]{64}$";
export const ISO_DATETIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$";
export const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
export const PAYLOAD_TEXT_MAX_LENGTH = 40000;
