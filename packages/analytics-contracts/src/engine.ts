import type { ReportRecord, SubjectScoreRecord } from "../../contracts/src/types.ts";
import { ANALYTICS_RESULT_VERSION } from "./constants.ts";
import type {
  AnalyticsDimension,
  AnalyticsFilter,
  AnalyticsGroup,
  AnalyticsGrouping,
  AnalyticsMetricId,
  AnalyticsMetricValue,
  AnalyticsPoint,
  AnalyticsQuantiles,
  AnalyticsQuery,
  AnalyticsResult,
} from "./types.ts";
import { validateAnalyticsQuery, validateAnalyticsResult } from "./validation.ts";

export interface AnalyticsDataset {
  readonly reports: readonly ReportRecord[];
  readonly subjectScores: readonly SubjectScoreRecord[];
}

export interface AnalyticsExecutionIssue {
  readonly code: "INVALID_QUERY" | "UNSUPPORTED_GROUPING" | "UNSUPPORTED_METRIC" | "UNSUPPORTED_FILTER" | "UNSUPPORTED_COMPARISON" | "MIXED_SCHEMA_VERSIONS" | "MIXED_METRIC_DEFINITIONS" | "MIXED_SUBJECT_DEFINITIONS" | "INVALID_RESULT";
  readonly message: string;
}

export class AnalyticsExecutionError extends Error {
  readonly issues: readonly AnalyticsExecutionIssue[];

  constructor(issues: readonly AnalyticsExecutionIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "AnalyticsExecutionError";
    this.issues = issues;
  }
}

interface JoinedRow {
  readonly report: ReportRecord;
  readonly score: SubjectScoreRecord;
}

const SUPPORTED_GROUPINGS = new Set<AnalyticsGrouping>([
  "overall", "exam_event", "location", "school", "grade", "subject", "metric_definition", "ability_level",
]);

const SUPPORTED_METRICS = new Set<AnalyticsMetricId>([
  "report_count", "person_count", "subject_taker_count", "participation_rate", "data_completeness_rate",
  "score_mean", "score_median", "score_rate_mean", "score_rate_distribution", "deviation_mean",
  "deviation_median", "deviation_distribution", "score_standard_deviation", "score_quantiles",
  "missing_rate", "national_gap_mean", "school_gap_mean",
]);

function included<T>(filter: readonly T[] | undefined, value: T): boolean {
  return filter === undefined || filter.includes(value);
}

function reportMatches(report: ReportRecord, filter: AnalyticsFilter): boolean {
  return included(filter.examEventIds, report.examEventId) &&
    included(filter.locationIds, report.locationId) &&
    included(filter.schoolCodes, report.schoolCodeRaw ?? "") &&
    included(filter.gradeRaws, report.gradeRaw ?? "") &&
    included(filter.schemaVersionIds, report.schemaVersionId) &&
    (filter.importedAtFrom === undefined || report.importedAt >= filter.importedAtFrom) &&
    (filter.importedAtTo === undefined || report.importedAt <= filter.importedAtTo);
}

function rowMatches(row: JoinedRow, filter: AnalyticsFilter): boolean {
  return reportMatches(row.report, filter) &&
    included(filter.subjectDefinitionIds, row.score.subjectDefinitionId) &&
    included(filter.metricDefinitionIds, row.score.metricDefinitionId) &&
    (filter.missingReasons === undefined || (row.score.missingReason !== null && filter.missingReasons.includes(row.score.missingReason)));
}

function groupingValue(row: JoinedRow, grouping: AnalyticsGrouping): string {
  switch (grouping) {
    case "overall": return "overall";
    case "exam_event": return row.report.examEventId;
    case "location": return row.report.locationId;
    case "school": return row.report.schoolCodeRaw ?? "school.unknown";
    case "grade": return row.report.gradeRaw ?? "grade.unknown";
    case "subject": return row.score.subjectDefinitionId;
    case "metric_definition": return row.score.metricDefinitionId;
    case "ability_level": return row.score.abilityLevel ?? "ability.unknown";
    default: return "unsupported";
  }
}

function groupRows(rows: readonly JoinedRow[], groupBy: readonly AnalyticsGrouping[]): ReadonlyMap<string, readonly JoinedRow[]> {
  const grouped = new Map<string, JoinedRow[]>();
  for (const row of rows) {
    const key = groupBy.map((grouping) => `${grouping}=${groupingValue(row, grouping)}`).join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function quantile(sorted: readonly number[], position: number): number {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function quantiles(values: readonly number[]): AnalyticsQuantiles | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minimum: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    maximum: sorted.at(-1) as number,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number | null {
  const average = mean(values);
  if (average === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function finiteValues(rows: readonly JoinedRow[], read: (row: JoinedRow) => number | null): readonly number[] {
  return rows.flatMap((row) => {
    const value = read(row);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
}

function distributionPoints(values: readonly number[], bands: readonly { key: string; min: number; max: number }[]): readonly AnalyticsPoint[] {
  return bands.map((band) => {
    const count = values.filter((value) => value >= band.min && value < band.max).length;
    return { key: band.key, seriesKey: null, value: count, denominator: values.length, sampleCount: count, missingCount: 0 };
  });
}

function suppressedMetric(metricId: AnalyticsMetricId, displayType: AnalyticsMetricValue["displayType"], unit: AnalyticsMetricValue["unit"], denominator: number): AnalyticsMetricValue {
  return { metricId, displayType, value: null, unit, denominator, quantiles: null, points: [], suppressed: true, suppressionReason: "SMALL_GROUP" };
}

function scalar(metricId: AnalyticsMetricId, value: number | null, unit: AnalyticsMetricValue["unit"], denominator: number): AnalyticsMetricValue {
  if (value === null) return { metricId, displayType: "scalar", value: null, unit, denominator, quantiles: null, points: [], suppressed: true, suppressionReason: "INSUFFICIENT_DATA" };
  return { metricId, displayType: "scalar", value, unit, denominator, quantiles: null, points: [], suppressed: false, suppressionReason: null };
}

function metricValue(metricId: AnalyticsMetricId, rows: readonly JoinedRow[], sampleCount: number, threshold: number): AnalyticsMetricValue {
  const scores = finiteValues(rows, (row) => row.score.score);
  const rates = finiteValues(rows, (row) => row.score.scoreRate);
  const deviations = finiteValues(rows, (row) => row.score.deviation);
  const takerCount = rows.filter((row) => row.score.score !== null && row.score.missingReason === null).length;
  const scalarShape: Record<string, { unit: AnalyticsMetricValue["unit"]; denominator: number; value: number | null }> = {
    report_count: { unit: "count", denominator: sampleCount, value: sampleCount },
    person_count: { unit: "count", denominator: sampleCount, value: new Set(rows.flatMap((row) => row.report.personId ? [row.report.personId] : [])).size },
    subject_taker_count: { unit: "count", denominator: rows.length, value: takerCount },
    participation_rate: { unit: "rate", denominator: rows.length, value: rows.length === 0 ? null : takerCount / rows.length },
    data_completeness_rate: { unit: "rate", denominator: rows.length, value: rows.length === 0 ? null : rows.filter((row) => row.score.missingReason === null).length / rows.length },
    score_mean: { unit: "score", denominator: scores.length, value: mean(scores) },
    score_median: { unit: "score", denominator: scores.length, value: quantiles(scores)?.median ?? null },
    score_rate_mean: { unit: "rate", denominator: rates.length, value: mean(rates) },
    deviation_mean: { unit: "deviation", denominator: deviations.length, value: mean(deviations) },
    deviation_median: { unit: "deviation", denominator: deviations.length, value: quantiles(deviations)?.median ?? null },
    score_standard_deviation: { unit: "score", denominator: scores.length, value: standardDeviation(scores) },
    missing_rate: { unit: "rate", denominator: rows.length, value: rows.length === 0 ? null : rows.filter((row) => row.score.missingReason !== null).length / rows.length },
    national_gap_mean: { unit: "score", denominator: finiteValues(rows, (row) => row.score.score === null || row.score.nationalAverage === null ? null : row.score.score - row.score.nationalAverage).length, value: mean(finiteValues(rows, (row) => row.score.score === null || row.score.nationalAverage === null ? null : row.score.score - row.score.nationalAverage)) },
    school_gap_mean: { unit: "score", denominator: finiteValues(rows, (row) => row.score.score === null || row.score.schoolAverage === null ? null : row.score.score - row.score.schoolAverage).length, value: mean(finiteValues(rows, (row) => row.score.score === null || row.score.schoolAverage === null ? null : row.score.score - row.score.schoolAverage)) },
  };
  const scalarDefinition = scalarShape[metricId];
  if (scalarDefinition) return sampleCount < threshold ? suppressedMetric(metricId, "scalar", scalarDefinition.unit, scalarDefinition.denominator) : scalar(metricId, scalarDefinition.value, scalarDefinition.unit, scalarDefinition.denominator);

  const distribution = metricId === "score_rate_distribution" ? {
    values: rates,
    unit: "rate" as const,
    bands: [
      { key: "rate.0-20", min: 0, max: 0.2 }, { key: "rate.20-40", min: 0.2, max: 0.4 },
      { key: "rate.40-60", min: 0.4, max: 0.6 }, { key: "rate.60-80", min: 0.6, max: 0.8 },
      { key: "rate.80-100", min: 0.8, max: Number.POSITIVE_INFINITY },
    ],
  } : metricId === "deviation_distribution" ? {
    values: deviations,
    unit: "deviation" as const,
    bands: [
      { key: "deviation.lt40", min: Number.NEGATIVE_INFINITY, max: 40 }, { key: "deviation.40-50", min: 40, max: 50 },
      { key: "deviation.50-60", min: 50, max: 60 }, { key: "deviation.60-70", min: 60, max: 70 },
      { key: "deviation.gte70", min: 70, max: Number.POSITIVE_INFINITY },
    ],
  } : { values: scores, unit: "score" as const, bands: [] };
  if (sampleCount < threshold) return suppressedMetric(metricId, "distribution", distribution.unit, distribution.values.length);
  const summary = quantiles(distribution.values);
  if (summary === null) return { metricId, displayType: "distribution", value: null, unit: distribution.unit, denominator: 0, quantiles: null, points: [], suppressed: true, suppressionReason: "INSUFFICIENT_DATA" };
  return {
    metricId,
    displayType: "distribution",
    value: null,
    unit: distribution.unit,
    denominator: distribution.values.length,
    quantiles: summary,
    points: distribution.bands.length === 0 ? [] : distributionPoints(distribution.values, distribution.bands),
    suppressed: false,
    suppressionReason: null,
  };
}

function analyticsGroup(key: string, rows: readonly JoinedRow[], groupBy: readonly AnalyticsGrouping[]): AnalyticsGroup {
  const first = rows[0];
  const dimensions: Partial<Record<AnalyticsDimension, string>> = {};
  for (const grouping of groupBy) {
    if (grouping !== "overall") dimensions[grouping as AnalyticsDimension] = groupingValue(first, grouping);
  }
  const missing = new Map<string, number>();
  rows.forEach((row) => {
    if (row.score.missingReason) missing.set(row.score.missingReason, (missing.get(row.score.missingReason) ?? 0) + 1);
  });
  return {
    groupKey: key,
    dimensions,
    subjectDefinitionId: groupBy.includes("subject") ? first.score.subjectDefinitionId : null,
    sampleCount: new Set(rows.map((row) => row.report.reportId)).size,
    excludedCount: rows.filter((row) => row.score.missingReason !== null).length,
    missingCounts: [...missing].sort(([left], [right]) => left.localeCompare(right)).map(([reason, count]) => ({ reason: reason as never, count })),
  };
}

export function executeSubjectAnalytics(query: AnalyticsQuery, dataset: AnalyticsDataset, generatedAt: string): AnalyticsResult {
  const queryValidation = validateAnalyticsQuery(query);
  if (!queryValidation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_QUERY", message: queryValidation.issues.map((item) => item.message).join(", ") }]);
  const unsupportedGroupings = query.groupBy.filter((grouping) => !SUPPORTED_GROUPINGS.has(grouping));
  const unsupportedMetrics = query.metricIds.filter((metric) => !SUPPORTED_METRICS.has(metric));
  const issues: AnalyticsExecutionIssue[] = [];
  if (unsupportedGroupings.length) issues.push({ code: "UNSUPPORTED_GROUPING", message: unsupportedGroupings.join(", ") });
  if (unsupportedMetrics.length) issues.push({ code: "UNSUPPORTED_METRIC", message: unsupportedMetrics.join(", ") });
  if (query.filter.targetUniversityIds !== undefined || query.filter.targetPreferenceOrders !== undefined) issues.push({ code: "UNSUPPORTED_FILTER", message: "target filters require the target payload analytics engine" });
  if (query.comparison !== undefined) issues.push({ code: "UNSUPPORTED_COMPARISON", message: "comparison execution is not implemented in the subject summary engine" });
  if (issues.length) throw new AnalyticsExecutionError(issues);

  const reports = new Map(dataset.reports.filter((report) => report.status === "ACTIVE").map((report) => [report.reportId, report]));
  const rows = dataset.subjectScores.flatMap((score) => {
    const report = reports.get(score.reportId);
    const row = report ? { report, score } : null;
    return row && rowMatches(row, query.filter) ? [row] : [];
  });
  const metricDefinitions = new Set(rows.map((row) => row.score.metricDefinitionId));
  const schemaVersions = new Set(rows.map((row) => row.report.schemaVersionId));
  const subjectDefinitions = new Set(rows.map((row) => row.score.subjectDefinitionId));
  if (schemaVersions.size > 1) {
    throw new AnalyticsExecutionError([{ code: "MIXED_SCHEMA_VERSIONS", message: "select one schemaVersionId before aggregation" }]);
  }
  if (metricDefinitions.size > 1 && !query.groupBy.includes("metric_definition")) {
    throw new AnalyticsExecutionError([{ code: "MIXED_METRIC_DEFINITIONS", message: "select one metricDefinitionId or group by metric_definition" }]);
  }
  if (subjectDefinitions.size > 1 && !query.groupBy.includes("subject") && query.metricIds.some((metric) => !["report_count", "person_count"].includes(metric))) {
    throw new AnalyticsExecutionError([{ code: "MIXED_SUBJECT_DEFINITIONS", message: "select one subjectDefinitionId or group by subject for subject metrics" }]);
  }

  const groups = [...groupRows(rows, query.groupBy)].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => {
    const metadata = analyticsGroup(key, group, query.groupBy);
    return {
      group: metadata,
      metrics: query.metricIds.map((metricId) => metricValue(metricId, group, metadata.sampleCount, query.suppressionThreshold)),
    };
  });
  const result: AnalyticsResult = {
    resultVersion: ANALYTICS_RESULT_VERSION,
    generatedAt: generatedAt as AnalyticsResult["generatedAt"],
    query,
    groups,
    warnings: [],
  };
  const resultValidation = validateAnalyticsResult(result);
  if (!resultValidation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_RESULT", message: resultValidation.issues.map((item) => item.message).join(", ") }]);
  return result;
}
