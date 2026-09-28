export const ML_EXPORT_SCHEMA_VERSION = "ml-export.v1";

export const ML_EXPORT_COLUMNS = [
  "ExportSchemaVersion",
  "ML_ID",
  "ExamEventID",
  "LocationID",
  "SubjectDefinitionID",
  "MetricDefinitionID",
  "Score",
  "MaxScore",
  "ScoreRate",
  "Deviation",
  "AbilityLevel",
  "MissingReason",
  "ParserVersion",
  "PayloadFormatVersion",
  "FeatureAsOf",
] as const;

export const ML_EXPORT_ALLOWED_IDENTITY_STATUSES = ["RESOLVED", "NEW_CONFIRMED"] as const;
export const ML_EXPORT_ROLES = ["ADMIN"] as const;
