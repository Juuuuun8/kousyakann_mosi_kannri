import type {
  MissingReason,
  ReportRecord,
  SubjectScoreRecord,
} from "../../contracts/src/types.ts";
import { ANALYTICS_RESULT_VERSION } from "./constants.ts";
import { AnalyticsExecutionError, type AnalyticsDataset, type AnalyticsExecutionIssue } from "./engine.ts";
import type {
  AnalyticsDimension,
  AnalyticsFilter,
  AnalyticsGrouping,
  AnalyticsMetricId,
  AnalyticsMetricValue,
  AnalyticsPoint,
  AnalyticsQuantiles,
  AnalyticsQuery,
  AnalyticsResult,
} from "./types.ts";
import { validateAnalyticsQuery, validateAnalyticsResult } from "./validation.ts";

interface ComparisonRow {
  readonly report: ReportRecord;
  readonly score: SubjectScoreRecord;
}

interface PairedRow {
  readonly baseline: ComparisonRow;
  readonly comparison: ComparisonRow;
  readonly scoreRateChange: number | null;
  readonly nationalGapRateChange: number | null;
  readonly deviationChange: number | null;
  readonly baselineBand: string | null;
}

const CONFIRMED_IDENTITIES = new Set(["RESOLVED", "NEW_CONFIRMED"]);
const SUPPORTED_GROUPINGS = new Set<AnalyticsGrouping>([
  "overall", "location", "school", "grade", "subject", "metric_definition", "ability_level", "baseline_band",
]);
const CURRENT_ASSIGNABLE_GROUPINGS = new Set<AnalyticsGrouping>([
  "overall", "location", "school", "grade", "subject", "metric_definition",
]);
const SUPPORTED_METRICS = new Set<AnalyticsMetricId>([
  "comparable_person_count", "excluded_rate", "change_from_previous_event", "change_distribution",
  "change_by_baseline_band", "national_gap_rate_change_mean", "deviation_change_mean", "deviation_change_distribution",
]);

function included<T>(filter: readonly T[] | undefined, value: T): boolean {
  return filter === undefined || filter.includes(value);
}

function matches(row: ComparisonRow, filter: AnalyticsFilter): boolean {
  const { report, score } = row;
  return included(filter.examEventIds, report.examEventId) && included(filter.locationIds, report.locationId) &&
    included(filter.schoolCodes, report.schoolCodeRaw ?? "") && included(filter.gradeRaws, report.gradeRaw ?? "") &&
    included(filter.schemaVersionIds, report.schemaVersionId) && included(filter.subjectDefinitionIds, score.subjectDefinitionId) &&
    included(filter.metricDefinitionIds, score.metricDefinitionId) &&
    (filter.missingReasons === undefined || (score.missingReason !== null && filter.missingReasons.includes(score.missingReason))) &&
    (filter.importedAtFrom === undefined || report.importedAt >= filter.importedAtFrom) &&
    (filter.importedAtTo === undefined || report.importedAt <= filter.importedAtTo);
}

function rows(dataset: AnalyticsDataset): readonly ComparisonRow[] {
  const reports = new Map(dataset.reports.filter((report) => report.status === "ACTIVE").map((report) => [report.reportId, report]));
  return dataset.subjectScores.flatMap((score) => {
    const report = reports.get(score.reportId);
    return report ? [{ report, score }] : [];
  });
}

function pairKey(row: ComparisonRow): string | null {
  const { report, score } = row;
  if (report.personId === null || !CONFIRMED_IDENTITIES.has(report.identityStatus)) return null;
  return `${report.personId}|${score.subjectDefinitionId}|${score.metricDefinitionId}`;
}

function uniqueIndex(input: readonly ComparisonRow[], side: "baseline" | "comparison"): ReadonlyMap<string, ComparisonRow> {
  const result = new Map<string, ComparisonRow>();
  const duplicates = new Set<string>();
  input.forEach((row) => {
    const key = pairKey(row);
    if (key === null) return;
    if (result.has(key)) duplicates.add(key);
    else result.set(key, row);
  });
  if (duplicates.size) throw new AnalyticsExecutionError([{
    code: "DUPLICATE_COMPARISON_KEY",
    message: `${side} contains multiple ACTIVE rows for the same person, subject, and metric definition`,
  }]);
  return result;
}

function finiteDifference(left: number | null, right: number | null, scale = 1): number | null {
  if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  return (right - left) * scale;
}

function nationalGapRate(row: ComparisonRow): number | null {
  const { score } = row;
  if (score.scoreRate === null || score.nationalAverage === null || score.maxScore === null || score.maxScore <= 0) return null;
  return score.scoreRate - score.nationalAverage / score.maxScore;
}

function baselineBand(scoreRate: number | null): string | null {
  if (scoreRate === null || !Number.isFinite(scoreRate)) return null;
  if (scoreRate < .25) return "baseline.lt25";
  if (scoreRate < .5) return "baseline.25-50";
  if (scoreRate < .75) return "baseline.50-75";
  return "baseline.gte75";
}

function pair(baseline: ComparisonRow, comparison: ComparisonRow): PairedRow {
  return {
    baseline,
    comparison,
    scoreRateChange: finiteDifference(baseline.score.scoreRate, comparison.score.scoreRate, 100),
    nationalGapRateChange: finiteDifference(nationalGapRate(baseline), nationalGapRate(comparison), 100),
    deviationChange: finiteDifference(baseline.score.deviation, comparison.score.deviation),
    baselineBand: baselineBand(baseline.score.scoreRate),
  };
}

function groupingValue(row: PairedRow, grouping: AnalyticsGrouping): string {
  switch (grouping) {
    case "overall": return "overall";
    case "location": return row.comparison.report.locationId;
    case "school": return row.comparison.report.schoolCodeRaw ?? "school.unknown";
    case "grade": return row.comparison.report.gradeRaw ?? "grade.unknown";
    case "subject": return row.comparison.score.subjectDefinitionId;
    case "metric_definition": return row.comparison.score.metricDefinitionId;
    case "ability_level": return row.baseline.score.abilityLevel ?? "ability.unknown";
    case "baseline_band": return row.baselineBand ?? "baseline.unknown";
    default: return "unsupported";
  }
}

function currentGroupingValue(row: ComparisonRow, grouping: AnalyticsGrouping): string | null {
  switch (grouping) {
    case "overall": return "overall";
    case "location": return row.report.locationId;
    case "school": return row.report.schoolCodeRaw ?? "school.unknown";
    case "grade": return row.report.gradeRaw ?? "grade.unknown";
    case "subject": return row.score.subjectDefinitionId;
    case "metric_definition": return row.score.metricDefinitionId;
    default: return null;
  }
}

function quantile(sorted: readonly number[], position: number): number {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower]! : sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function quantiles(input: readonly number[]): AnalyticsQuantiles | null {
  if (!input.length) return null;
  const sorted = [...input].sort((a, b) => a - b);
  return { minimum: sorted[0]!, p25: quantile(sorted, .25), median: quantile(sorted, .5), p75: quantile(sorted, .75), maximum: sorted.at(-1)! };
}

function values(input: readonly PairedRow[], read: (row: PairedRow) => number | null): readonly number[] {
  return input.flatMap((row) => {
    const value = read(row);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
}

function average(input: readonly number[]): number | null {
  return input.length ? input.reduce((sum, value) => sum + value, 0) / input.length : null;
}

function suppressed(metricId: AnalyticsMetricId, displayType: AnalyticsMetricValue["displayType"], unit: AnalyticsMetricValue["unit"], denominator: number, reason: "SMALL_GROUP" | "INSUFFICIENT_DATA" | "IDENTITY_UNRESOLVED"): AnalyticsMetricValue {
  return { metricId, displayType, value: null, unit, denominator, quantiles: null, points: [], suppressed: true, suppressionReason: reason };
}

function scalar(metricId: AnalyticsMetricId, input: readonly number[], unit: AnalyticsMetricValue["unit"], sampleCount: number, threshold: number): AnalyticsMetricValue {
  if (sampleCount < threshold) return suppressed(metricId, "scalar", unit, input.length, "SMALL_GROUP");
  const value = average(input);
  if (value === null) return suppressed(metricId, "scalar", unit, 0, "INSUFFICIENT_DATA");
  return { metricId, displayType: "scalar", value, unit, denominator: input.length, quantiles: null, points: [], suppressed: false, suppressionReason: null };
}

function distribution(metricId: AnalyticsMetricId, input: readonly number[], unit: AnalyticsMetricValue["unit"], sampleCount: number, threshold: number): AnalyticsMetricValue {
  if (sampleCount < threshold) return suppressed(metricId, "distribution", unit, input.length, "SMALL_GROUP");
  const summary = quantiles(input);
  if (!summary) return suppressed(metricId, "distribution", unit, 0, "INSUFFICIENT_DATA");
  const bands = [
    { key: "change.lt-20", min: Number.NEGATIVE_INFINITY, max: -20 }, { key: "change.-20--5", min: -20, max: -5 },
    { key: "change.-5-5", min: -5, max: 5 }, { key: "change.5-20", min: 5, max: 20 },
    { key: "change.gte20", min: 20, max: Number.POSITIVE_INFINITY },
  ];
  const points: AnalyticsPoint[] = bands.map((band) => {
    const count = input.filter((value) => value >= band.min && value < band.max).length;
    return { key: band.key, seriesKey: null, value: count, denominator: input.length, sampleCount: count, missingCount: 0 };
  });
  return { metricId, displayType: "distribution", value: null, unit, denominator: input.length, quantiles: summary, points, suppressed: false, suppressionReason: null };
}

function bandBreakdown(metricId: AnalyticsMetricId, input: readonly PairedRow[], threshold: number): AnalyticsMetricValue {
  if (input.length < threshold) return suppressed(metricId, "breakdown", "percentage_point", input.length, "SMALL_GROUP");
  const bands = ["baseline.lt25", "baseline.25-50", "baseline.50-75", "baseline.gte75"];
  const points: AnalyticsPoint[] = bands.map((key) => {
    const bandValues = values(input.filter((row) => row.baselineBand === key), (row) => row.scoreRateChange);
    return {
      key,
      seriesKey: bandValues.length < threshold ? "SMALL_GROUP" : null,
      value: bandValues.length < threshold ? null : average(bandValues),
      denominator: bandValues.length,
      sampleCount: bandValues.length,
      missingCount: 0,
    };
  });
  if (points.every((point) => point.value === null)) return suppressed(metricId, "breakdown", "percentage_point", input.length, "INSUFFICIENT_DATA");
  return { metricId, displayType: "breakdown", value: null, unit: "percentage_point", denominator: input.length, quantiles: null, points, suppressed: false, suppressionReason: null };
}

function metric(metricId: AnalyticsMetricId, input: readonly PairedRow[], excludedCount: number, threshold: number): AnalyticsMetricValue {
  const sampleCount = new Set(input.map((row) => row.comparison.report.personId)).size;
  if (metricId === "comparable_person_count") {
    if (sampleCount < threshold) return suppressed(metricId, "scalar", "count", sampleCount, "SMALL_GROUP");
    return { metricId, displayType: "scalar", value: sampleCount, unit: "count", denominator: sampleCount + excludedCount, quantiles: null, points: [], suppressed: false, suppressionReason: null };
  }
  if (metricId === "excluded_rate") {
    const denominator = sampleCount + excludedCount;
    if (sampleCount < threshold) return suppressed(metricId, "scalar", "rate", denominator, sampleCount ? "SMALL_GROUP" : "IDENTITY_UNRESOLVED");
    if (!denominator) return suppressed(metricId, "scalar", "rate", 0, "INSUFFICIENT_DATA");
    return { metricId, displayType: "scalar", value: excludedCount / denominator, unit: "rate", denominator, quantiles: null, points: [], suppressed: false, suppressionReason: null };
  }
  if (metricId === "change_from_previous_event") return scalar(metricId, values(input, (row) => row.scoreRateChange), "percentage_point", sampleCount, threshold);
  if (metricId === "national_gap_rate_change_mean") return scalar(metricId, values(input, (row) => row.nationalGapRateChange), "percentage_point", sampleCount, threshold);
  if (metricId === "deviation_change_mean") return scalar(metricId, values(input, (row) => row.deviationChange), "deviation", sampleCount, threshold);
  if (metricId === "change_distribution") return distribution(metricId, values(input, (row) => row.scoreRateChange), "percentage_point", sampleCount, threshold);
  if (metricId === "deviation_change_distribution") return distribution(metricId, values(input, (row) => row.deviationChange), "deviation", sampleCount, threshold);
  return bandBreakdown(metricId, input, threshold);
}

function oneEvent(filter: AnalyticsFilter, side: string, issues: AnalyticsExecutionIssue[]): void {
  if (filter.examEventIds?.length !== 1) issues.push({ code: "UNSUPPORTED_COMPARISON", message: `${side} must select exactly one examEventId` });
}

function hasTargetFilter(filter: AnalyticsFilter): boolean {
  return filter.targetUniversityIds !== undefined || filter.targetPreferenceOrders !== undefined;
}

export function executeSubjectComparisonAnalytics(query: AnalyticsQuery, dataset: AnalyticsDataset, generatedAt: string): AnalyticsResult {
  const validation = validateAnalyticsQuery(query);
  if (!validation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_QUERY", message: validation.issues.map((item) => item.message).join(", ") }]);
  const issues: AnalyticsExecutionIssue[] = [];
  if (!query.comparison) issues.push({ code: "UNSUPPORTED_COMPARISON", message: "comparison filters are required" });
  const unsupportedGroups = query.groupBy.filter((grouping) => !SUPPORTED_GROUPINGS.has(grouping));
  const unsupportedMetrics = query.metricIds.filter((metricId) => !SUPPORTED_METRICS.has(metricId));
  if (unsupportedGroups.length) issues.push({ code: "UNSUPPORTED_GROUPING", message: unsupportedGroups.join(", ") });
  if (unsupportedMetrics.length) issues.push({ code: "UNSUPPORTED_METRIC", message: unsupportedMetrics.join(", ") });
  if (query.filter.examEventIds !== undefined) issues.push({ code: "UNSUPPORTED_FILTER", message: "common filter must not contain examEventIds; select events in comparison filters" });
  if (hasTargetFilter(query.filter) || (query.comparison && (hasTargetFilter(query.comparison.baseline) || hasTargetFilter(query.comparison.comparison)))) issues.push({ code: "UNSUPPORTED_FILTER", message: "target filters do not apply to subject comparison" });
  if (query.comparison) {
    oneEvent(query.comparison.baseline, "baseline", issues);
    oneEvent(query.comparison.comparison, "comparison", issues);
    if (query.comparison.baseline.examEventIds?.[0] === query.comparison.comparison.examEventIds?.[0]) issues.push({ code: "UNSUPPORTED_COMPARISON", message: "baseline and comparison exam events must differ" });
  }
  if (issues.length || !query.comparison) throw new AnalyticsExecutionError(issues);

  const allRows = rows(dataset);
  const commonRows = allRows.filter((row) => matches(row, query.filter));
  const baselineRows = commonRows.filter((row) => matches(row, query.comparison?.baseline ?? {}));
  const comparisonRows = commonRows.filter((row) => matches(row, query.comparison?.comparison ?? {}));
  const baselineIndex = uniqueIndex(baselineRows, "baseline");
  const comparisonIndex = uniqueIndex(comparisonRows, "comparison");
  const paired = [...comparisonIndex].flatMap(([key, current]) => {
    const previous = baselineIndex.get(key);
    return previous ? [pair(previous, current)] : [];
  });

  const definitionRows = comparisonRows.length ? comparisonRows : baselineRows;
  const metricDefinitions = new Set(definitionRows.map((row) => row.score.metricDefinitionId));
  const subjectDefinitions = new Set(definitionRows.map((row) => row.score.subjectDefinitionId));
  if (metricDefinitions.size > 1 && !query.groupBy.includes("metric_definition")) throw new AnalyticsExecutionError([{ code: "MIXED_METRIC_DEFINITIONS", message: "select one metricDefinitionId or group by metric_definition" }]);
  if (subjectDefinitions.size > 1 && !query.groupBy.includes("subject")) throw new AnalyticsExecutionError([{ code: "MIXED_SUBJECT_DEFINITIONS", message: "select one subjectDefinitionId or group by subject" }]);

  const grouped = new Map<string, PairedRow[]>();
  paired.forEach((row) => {
    const key = query.groupBy.map((grouping) => `${grouping}=${groupingValue(row, grouping)}`).join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  const canAssignExcludedToGroups = query.groupBy.every((grouping) => CURRENT_ASSIGNABLE_GROUPINGS.has(grouping));
  const candidateGroups = new Map<string, { count: number; exemplar: ComparisonRow }>();
  if (canAssignExcludedToGroups) comparisonRows.forEach((row) => {
    const key = query.groupBy.map((grouping) => `${grouping}=${currentGroupingValue(row, grouping)}`).join("|");
    const existing = candidateGroups.get(key);
    candidateGroups.set(key, { count: (existing?.count ?? 0) + 1, exemplar: existing?.exemplar ?? row });
  });
  const eligibleComparisonCount = comparisonRows.filter((row) => pairKey(row) !== null).length;
  const globallyExcluded = Math.max(0, comparisonRows.length - paired.length);
  const groupKeys = new Set([...grouped.keys(), ...candidateGroups.keys()]);
  if (!groupKeys.size && query.groupBy.length === 1 && query.groupBy[0] === "overall") groupKeys.add("overall=overall");
  const groupedEntries: readonly [string, readonly PairedRow[]][] = [...groupKeys].sort().map((key): [string, readonly PairedRow[]] => [key, grouped.get(key) ?? []]);
  const groups = groupedEntries.map(([key, groupRows]) => {
    const first = groupRows[0];
    const candidate = candidateGroups.get(key);
    const dimensions: Partial<Record<AnalyticsDimension, string>> = {};
    query.groupBy.forEach((grouping) => {
      if (grouping === "overall") return;
      const value = first ? groupingValue(first, grouping) : candidate ? currentGroupingValue(candidate.exemplar, grouping) : null;
      if (value !== null) dimensions[grouping as AnalyticsDimension] = value;
    });
    const sampleCount = new Set(groupRows.map((row) => row.comparison.report.personId)).size;
    const excludedCount = candidate ? Math.max(0, candidate.count - groupRows.length) : query.groupBy.length === 1 && query.groupBy[0] === "overall" ? globallyExcluded : 0;
    const missing = new Map<MissingReason, number>();
    groupRows.forEach((row) => {
      for (const reason of [row.baseline.score.missingReason, row.comparison.score.missingReason]) if (reason) missing.set(reason, (missing.get(reason) ?? 0) + 1);
    });
    return {
      group: {
        groupKey: key,
        dimensions,
        subjectDefinitionId: query.groupBy.includes("subject") ? first?.comparison.score.subjectDefinitionId ?? candidate?.exemplar.score.subjectDefinitionId ?? null : null,
        sampleCount,
        excludedCount,
        missingCounts: [...missing].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ({ reason, count })),
      },
      metrics: query.metricIds.map((metricId) => metric(metricId, groupRows, excludedCount, query.suppressionThreshold)),
    };
  });
  const schemaChanged = paired.some((row) => row.baseline.report.schemaVersionId !== row.comparison.report.schemaVersionId);
  const warnings = [
    ...(schemaChanged ? ["baseline and comparison use different schema versions; normalized subject and metric definitions were required"] : []),
    ...(eligibleComparisonCount < comparisonRows.length ? [`${comparisonRows.length - eligibleComparisonCount} comparison rows had unresolved identity and were excluded`] : []),
    ...(paired.length < eligibleComparisonCount ? [`${eligibleComparisonCount - paired.length} comparison rows had no matching baseline row and were excluded`] : []),
    ...(!canAssignExcludedToGroups && globallyExcluded ? ["excluded rows could not be assigned to baseline-derived groups"] : []),
  ];
  const result: AnalyticsResult = { resultVersion: ANALYTICS_RESULT_VERSION, generatedAt: generatedAt as AnalyticsResult["generatedAt"], query, groups, warnings };
  const resultValidation = validateAnalyticsResult(result);
  if (!resultValidation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_RESULT", message: resultValidation.issues.map((item) => item.message).join(", ") }]);
  return result;
}
