import {
  ANALYTICS_DIMENSIONS,
  ANALYTICS_DISPLAY_TYPES,
  ANALYTICS_GROUPINGS,
  ANALYTICS_METRIC_IDS,
  ANALYTICS_RESULT_VERSION,
  ANALYTICS_ROLES,
  ANALYTICS_UNITS,
  DEFAULT_SUPPRESSION_THRESHOLD,
  SUPPRESSION_REASONS,
} from "./constants.ts";
import type {
  AnalyticsFilter,
  AnalyticsQuery,
  AnalyticsResult,
  AnalyticsValidationIssue,
  AnalyticsValidationResult,
} from "./types.ts";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isOneOf = (values: readonly string[], value: unknown): boolean =>
  typeof value === "string" && values.includes(value);

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: AnalyticsValidationIssue[]): void {
  const allowedSet = new Set(allowed);
  Object.keys(value).filter((key) => !allowedSet.has(key)).forEach((key) => issues.push(issue(`${path}.${key}`, "UNKNOWN_KEY", "field is not part of this contract")));
}

function rejectDuplicates(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (Array.isArray(value) && new Set(value.map(String)).size !== value.length) issues.push(issue(path, "DUPLICATE", "must not contain duplicate values"));
}

function issue(path: string, code: string, message: string): AnalyticsValidationIssue {
  return { path, code, message };
}

function result(issues: AnalyticsValidationIssue[]): AnalyticsValidationResult {
  return { ok: issues.length === 0, issues };
}

function arrayOfIds(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => !isString(item) || !ID_RE.test(item))) {
    issues.push(issue(path, "ID_ARRAY", "must be an array of contract identifiers"));
  }
}

function arrayOfStrings(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => !isString(item) || item.length === 0)) {
    issues.push(issue(path, "STRING_ARRAY", "must be an array of non-empty strings"));
  }
}

function validateFilter(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "OBJECT", "filter must be an object"));
    return;
  }
  rejectUnknownKeys(value, [
    "examEventIds", "locationIds", "schoolCodes", "gradeRaws", "subjectDefinitionIds", "metricDefinitionIds", "domainIds",
    "targetUniversityIds", "targetPreferenceOrders", "schemaVersionIds", "missingReasons", "importedAtFrom", "importedAtTo",
  ], path, issues);
  for (const key of [
    "examEventIds",
    "locationIds",
    "subjectDefinitionIds",
    "metricDefinitionIds",
    "domainIds",
    "schemaVersionIds",
    "targetUniversityIds",
  ]) arrayOfIds(value[key], `${path}.${key}`, issues);
  for (const key of ["schoolCodes", "gradeRaws"]) arrayOfStrings(value[key], `${path}.${key}`, issues);
  for (const key of ["examEventIds", "locationIds", "schoolCodes", "gradeRaws", "subjectDefinitionIds", "metricDefinitionIds", "domainIds", "targetUniversityIds", "targetPreferenceOrders", "schemaVersionIds", "missingReasons"]) rejectDuplicates(value[key], `${path}.${key}`, issues);
  if (value.targetPreferenceOrders !== undefined &&
      (!Array.isArray(value.targetPreferenceOrders) ||
       value.targetPreferenceOrders.some((item) => !isInteger(item) || item < 1))) {
    issues.push(issue(`${path}.targetPreferenceOrders`, "POSITIVE_INTEGER_ARRAY", "must contain positive integers"));
  }
  if (value.missingReasons !== undefined &&
      (!Array.isArray(value.missingReasons) || value.missingReasons.some((item) => !MISSING_REASONS.has(String(item))))) {
    issues.push(issue(`${path}.missingReasons`, "MISSING_REASON_ARRAY", "contains an unknown missing reason"));
  }
  for (const key of ["importedAtFrom", "importedAtTo"]) {
    if (value[key] !== undefined && (!isString(value[key]) || !ISO_RE.test(value[key]))) {
      issues.push(issue(`${path}.${key}`, "ISO_DATETIME", "must be an ISO-8601 UTC datetime"));
    }
  }
  if (isString(value.importedAtFrom) && isString(value.importedAtTo) && value.importedAtFrom > value.importedAtTo) {
    issues.push(issue(path, "DATE_RANGE", "importedAtFrom must not be later than importedAtTo"));
  }
}

function validateQuantiles(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "QUANTILES", "quantiles must be an object or null"));
    return;
  }
  rejectUnknownKeys(value, ["minimum", "p25", "median", "p75", "maximum"], path, issues);
  const values = [value.minimum, value.p25, value.median, value.p75, value.maximum];
  if (values.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    issues.push(issue(path, "QUANTILES", "all quantiles must be finite numbers"));
    return;
  }
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) < (values[index - 1] as number)) {
      issues.push(issue(path, "QUANTILE_ORDER", "quantiles must be ordered"));
      break;
    }
  }
}

function validatePoints(value: unknown, path: string, issues: AnalyticsValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "POINTS", "points must be an array"));
    return;
  }
  value.forEach((point, index) => {
    const pointPath = `${path}[${index}]`;
    if (!isRecord(point)) {
      issues.push(issue(pointPath, "OBJECT", "point must be an object"));
      return;
    }
    rejectUnknownKeys(point, ["key", "seriesKey", "value", "denominator", "sampleCount", "missingCount"], pointPath, issues);
    if (!isString(point.key) || point.key.length === 0) issues.push(issue(`${pointPath}.key`, "KEY", "point key is required"));
    if (point.seriesKey !== null && (!isString(point.seriesKey) || point.seriesKey.length === 0)) issues.push(issue(`${pointPath}.seriesKey`, "STRING_OR_NULL", "seriesKey must be non-empty or null"));
    if (point.value !== null && (typeof point.value !== "number" || !Number.isFinite(point.value))) issues.push(issue(`${pointPath}.value`, "NUMBER_OR_NULL", "point value must be finite or null"));
    for (const key of ["sampleCount", "missingCount"]) {
      if (!isInteger(point[key]) || point[key] < 0) issues.push(issue(`${pointPath}.${key}`, "COUNT", `${key} must be non-negative`));
    }
    if (point.denominator !== null && (!isInteger(point.denominator) || point.denominator < 0)) issues.push(issue(`${pointPath}.denominator`, "COUNT_OR_NULL", "denominator must be non-negative or null"));
  });
}

export function validateAnalyticsQuery(value: unknown): AnalyticsValidationResult {
  const issues: AnalyticsValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "query must be an object")]);
  rejectUnknownKeys(value, ["resultVersion", "actorRole", "filter", "groupBy", "metricIds", "comparison", "suppressionThreshold"], "$", issues);
  if (value.resultVersion !== ANALYTICS_RESULT_VERSION) {
    issues.push(issue("$.resultVersion", "VERSION", `must be ${ANALYTICS_RESULT_VERSION}`));
  }
  if (!isOneOf(ANALYTICS_ROLES, value.actorRole)) issues.push(issue("$.actorRole", "ROLE", "only ADMIN may query analytics"));
  validateFilter(value.filter, "$.filter", issues);
  if (!Array.isArray(value.groupBy) || value.groupBy.length === 0 || value.groupBy.some((item) => !isOneOf(ANALYTICS_GROUPINGS, item))) {
    issues.push(issue("$.groupBy", "GROUPING", "must contain one or more supported groupings"));
  }
  rejectDuplicates(value.groupBy, "$.groupBy", issues);
  if (!Array.isArray(value.metricIds) || value.metricIds.length === 0 || value.metricIds.some((item) => !isOneOf(ANALYTICS_METRIC_IDS, item))) {
    issues.push(issue("$.metricIds", "METRIC", "must contain one or more supported metrics"));
  }
  rejectDuplicates(value.metricIds, "$.metricIds", issues);
  if (!isInteger(value.suppressionThreshold) || value.suppressionThreshold < 1) {
    issues.push(issue("$.suppressionThreshold", "THRESHOLD", "must be a positive integer"));
  }
  if (value.comparison !== undefined) {
    if (!isRecord(value.comparison)) issues.push(issue("$.comparison", "OBJECT", "comparison must be an object"));
    else {
      rejectUnknownKeys(value.comparison, ["baseline", "comparison", "label"], "$.comparison", issues);
      validateFilter(value.comparison.baseline, "$.comparison.baseline", issues);
      validateFilter(value.comparison.comparison, "$.comparison.comparison", issues);
      if (value.comparison.label !== undefined && (!isString(value.comparison.label) || value.comparison.label.length === 0)) {
        issues.push(issue("$.comparison.label", "STRING", "label must be non-empty when provided"));
      }
    }
  }
  return result(issues);
}

export function validateAnalyticsResult(value: unknown): AnalyticsValidationResult {
  const issues: AnalyticsValidationIssue[] = [];
  if (!isRecord(value)) return result([issue("$", "OBJECT", "result must be an object")]);
  rejectUnknownKeys(value, ["resultVersion", "generatedAt", "query", "groups", "warnings"], "$", issues);
  if (value.resultVersion !== ANALYTICS_RESULT_VERSION) issues.push(issue("$.resultVersion", "VERSION", "unsupported result version"));
  if (!isString(value.generatedAt) || !ISO_RE.test(value.generatedAt)) issues.push(issue("$.generatedAt", "ISO_DATETIME", "must be UTC datetime"));
  const queryResult = validateAnalyticsQuery(value.query);
  issues.push(...queryResult.issues.map((item) => ({ ...item, path: `$.query${item.path.slice(1)}` })));
  if (!Array.isArray(value.groups)) issues.push(issue("$.groups", "ARRAY", "groups must be an array"));
  else value.groups.forEach((group, index) => {
    const path = `$.groups[${index}]`;
    if (!isRecord(group) || !isRecord(group.group) || !Array.isArray(group.metrics)) {
      issues.push(issue(path, "GROUP_RESULT", "group result must contain group and metrics"));
      return;
    }
    rejectUnknownKeys(group, ["group", "metrics"], path, issues);
    rejectUnknownKeys(group.group, ["groupKey", "dimensions", "subjectDefinitionId", "sampleCount", "excludedCount", "missingCounts"], `${path}.group`, issues);
    if (!isString(group.group.groupKey) || group.group.groupKey.length === 0) issues.push(issue(`${path}.group.groupKey`, "GROUP_KEY", "groupKey is required"));
    if (!isInteger(group.group.sampleCount) || group.group.sampleCount < 0) issues.push(issue(`${path}.group.sampleCount`, "COUNT", "sampleCount must be non-negative"));
    if (!isInteger(group.group.excludedCount) || group.group.excludedCount < 0) issues.push(issue(`${path}.group.excludedCount`, "COUNT", "excludedCount must be non-negative"));
    if (!Array.isArray(group.group.missingCounts)) issues.push(issue(`${path}.group.missingCounts`, "ARRAY", "missingCounts must be an array"));
    else group.group.missingCounts.forEach((missing, missingIndex) => {
      const missingPath = `${path}.group.missingCounts[${missingIndex}]`;
      if (!isRecord(missing)) issues.push(issue(missingPath, "OBJECT", "missing count must be an object"));
      else {
        rejectUnknownKeys(missing, ["reason", "count"], missingPath, issues);
        if (!MISSING_REASONS.has(String(missing.reason))) issues.push(issue(`${missingPath}.reason`, "MISSING_REASON", "unknown missing reason"));
        if (!isInteger(missing.count) || missing.count < 0) issues.push(issue(`${missingPath}.count`, "COUNT", "count must be non-negative"));
      }
    });
    if (!isRecord(group.group.dimensions)) issues.push(issue(`${path}.group.dimensions`, "OBJECT", "dimensions must be an object"));
    else {
      const dimensionKeys = Object.keys(group.group.dimensions);
      dimensionKeys.filter((key) => !isOneOf(ANALYTICS_DIMENSIONS, key)).forEach((key) => issues.push(issue(`${path}.group.dimensions.${key}`, "DIMENSION", "unknown or unsafe dimension")));
      dimensionKeys.forEach((key) => { if (!isString(group.group.dimensions[key]) || group.group.dimensions[key].length === 0 || group.group.dimensions[key].length > 256) issues.push(issue(`${path}.group.dimensions.${key}`, "STRING", "dimension value must be 1-256 characters")); });
      const expectedDimensions = isRecord(value.query) && Array.isArray(value.query.groupBy) ? value.query.groupBy.map(String).filter((key) => key !== "overall") : [];
      if (dimensionKeys.length !== expectedDimensions.length || expectedDimensions.some((key) => !dimensionKeys.includes(key))) issues.push(issue(`${path}.group.dimensions`, "DIMENSION_SET", "dimensions must exactly match non-overall query groupings"));
    }
    if (group.group.subjectDefinitionId !== null && (!isString(group.group.subjectDefinitionId) || !ID_RE.test(group.group.subjectDefinitionId))) issues.push(issue(`${path}.group.subjectDefinitionId`, "ID_OR_NULL", "subjectDefinitionId must be a contract identifier or null"));
    if (isRecord(value.query) && Array.isArray(value.query.groupBy)) {
      const subjectGrouped = value.query.groupBy.includes("subject");
      if (subjectGrouped && group.group.subjectDefinitionId !== group.group.dimensions.subject) issues.push(issue(`${path}.group.subjectDefinitionId`, "SUBJECT_DIMENSION", "must match the subject dimension"));
      if (!subjectGrouped && group.group.subjectDefinitionId !== null) issues.push(issue(`${path}.group.subjectDefinitionId`, "SUBJECT_DIMENSION", "must be null when subject is not grouped"));
    }
    group.metrics.forEach((metric, metricIndex) => {
      const metricPath = `${path}.metrics[${metricIndex}]`;
      if (!isRecord(metric)) {
        issues.push(issue(metricPath, "OBJECT", "metric must be an object"));
        return;
      }
      rejectUnknownKeys(metric, ["metricId", "displayType", "value", "unit", "denominator", "quantiles", "points", "suppressed", "suppressionReason"], metricPath, issues);
      if (!isOneOf(ANALYTICS_METRIC_IDS, metric.metricId)) issues.push(issue(`${metricPath}.metricId`, "METRIC", "unknown metric"));
      if (!isOneOf(ANALYTICS_DISPLAY_TYPES, metric.displayType)) issues.push(issue(`${metricPath}.displayType`, "DISPLAY_TYPE", "unknown display type"));
      if (!isOneOf(ANALYTICS_UNITS, metric.unit)) issues.push(issue(`${metricPath}.unit`, "UNIT", "unknown unit"));
      if (metric.value !== null && (typeof metric.value !== "number" || !Number.isFinite(metric.value))) issues.push(issue(`${metricPath}.value`, "NUMBER_OR_NULL", "value must be finite or null"));
      if (metric.denominator !== null && (!isInteger(metric.denominator) || metric.denominator < 0)) issues.push(issue(`${metricPath}.denominator`, "COUNT_OR_NULL", "denominator must be non-negative or null"));
      if (typeof metric.suppressed !== "boolean") issues.push(issue(`${metricPath}.suppressed`, "BOOLEAN", "suppressed is required"));
      if (metric.suppressed && !isOneOf(SUPPRESSION_REASONS, metric.suppressionReason)) issues.push(issue(`${metricPath}.suppressionReason`, "SUPPRESSION", "suppressed metrics require a reason"));
      if (!metric.suppressed && metric.suppressionReason !== null) issues.push(issue(`${metricPath}.suppressionReason`, "SUPPRESSION", "unsuppressed metrics must have null reason"));
      if (metric.quantiles !== null) validateQuantiles(metric.quantiles, `${metricPath}.quantiles`, issues);
      validatePoints(metric.points, `${metricPath}.points`, issues);
      if (metric.suppressed && (metric.value !== null || metric.quantiles !== null || (Array.isArray(metric.points) && metric.points.length > 0))) {
        issues.push(issue(metricPath, "SUPPRESSED_DATA_LEAK", "suppressed metric must not include values, quantiles, or points"));
      }
      if (!metric.suppressed && metric.displayType === "scalar" && metric.value === null) issues.push(issue(`${metricPath}.value`, "SCALAR_VALUE", "scalar metric requires a value"));
      if (!metric.suppressed && metric.displayType === "distribution" && metric.quantiles === null && Array.isArray(metric.points) && metric.points.length === 0) {
        issues.push(issue(metricPath, "DISTRIBUTION_DATA", "distribution requires quantiles or points"));
      }
      if (!metric.suppressed && ["series", "breakdown", "matrix"].includes(String(metric.displayType)) && Array.isArray(metric.points) && metric.points.length === 0) {
        issues.push(issue(`${metricPath}.points`, "POINTS_REQUIRED", `${metric.displayType} requires points`));
      }
    });
    const queryMetricIds = isRecord(value.query) && Array.isArray(value.query.metricIds) ? value.query.metricIds.map(String) : [];
    const resultMetricIds = group.metrics.flatMap((metric) => isRecord(metric) && isString(metric.metricId) ? [metric.metricId] : []);
    if (new Set(resultMetricIds).size !== resultMetricIds.length) issues.push(issue(`${path}.metrics`, "DUPLICATE_METRIC", "group must not contain duplicate metric IDs"));
    if (queryMetricIds.length && (queryMetricIds.length !== resultMetricIds.length || queryMetricIds.some((id) => !resultMetricIds.includes(id)))) issues.push(issue(`${path}.metrics`, "METRIC_SET", "group metrics must exactly match query.metricIds"));
  });
  if (!Array.isArray(value.warnings) || value.warnings.some((warning) => !isString(warning) || warning.length > 500)) issues.push(issue("$.warnings", "STRING_ARRAY", "warnings must be an array of strings no longer than 500 characters"));
  return result(issues);
}

export function defaultSuppressionThreshold(): number {
  return DEFAULT_SUPPRESSION_THRESHOLD;
}
