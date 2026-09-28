import type { DomainResultItem, MissingReason, ReportRecord, SubjectDefinitionId } from "../../contracts/src/types.ts";
import { ANALYTICS_RESULT_VERSION } from "./constants.ts";
import { AnalyticsExecutionError, type AnalyticsExecutionIssue } from "./engine.ts";
import type { AnalyticsDimension, AnalyticsFilter, AnalyticsGrouping, AnalyticsMetricId, AnalyticsMetricValue, AnalyticsPoint, AnalyticsQuantiles, AnalyticsQuery, AnalyticsResult } from "./types.ts";
import type { PayloadAnalyticsDataset } from "./payload-engine.ts";
import { validateAnalyticsQuery, validateAnalyticsResult } from "./validation.ts";

interface DomainRow {
  readonly report: ReportRecord;
  readonly subjectDefinitionId: SubjectDefinitionId;
  readonly item: DomainResultItem;
  readonly scoreRate: number | null;
}

interface DomainPair {
  readonly baseline: DomainRow;
  readonly comparison: DomainRow;
  readonly change: number | null;
  readonly baselineBand: string | null;
}

const CONFIRMED_IDENTITIES = new Set(["RESOLVED", "NEW_CONFIRMED"]);
const GROUPINGS = new Set<AnalyticsGrouping>(["overall", "location", "school", "grade", "subject", "domain", "baseline_band"]);
const CURRENT_GROUPINGS = new Set<AnalyticsGrouping>(["overall", "location", "school", "grade", "subject", "domain"]);
const METRICS = new Set<AnalyticsMetricId>(["comparable_person_count", "excluded_rate", "domain_change_from_previous_event", "change_distribution", "change_by_baseline_band"]);

function included<T>(filter: readonly T[] | undefined, value: T): boolean {
  return filter === undefined || filter.includes(value);
}

function reportMatches(report: ReportRecord, filter: AnalyticsFilter): boolean {
  return included(filter.examEventIds, report.examEventId) && included(filter.locationIds, report.locationId) &&
    included(filter.schoolCodes, report.schoolCodeRaw ?? "") && included(filter.gradeRaws, report.gradeRaw ?? "") &&
    included(filter.schemaVersionIds, report.schemaVersionId) &&
    (filter.importedAtFrom === undefined || report.importedAt >= filter.importedAtFrom) &&
    (filter.importedAtTo === undefined || report.importedAt <= filter.importedAtTo);
}

function matches(row: DomainRow, filter: AnalyticsFilter): boolean {
  return reportMatches(row.report, filter) && included(filter.subjectDefinitionIds, row.subjectDefinitionId) &&
    included(filter.domainIds, row.item.domainId ?? "") &&
    (filter.missingReasons === undefined || (row.item.missingReason !== null && filter.missingReasons.includes(row.item.missingReason)));
}

function domainRows(dataset: PayloadAnalyticsDataset): readonly DomainRow[] {
  const reports = new Map(dataset.reports.filter((report) => report.status === "ACTIVE").map((report) => [report.reportId, report]));
  return dataset.payloadBindings.flatMap((binding) => {
    const report = reports.get(binding.reportId);
    if (!report || binding.payload.type !== "domain_results") return [];
    return binding.payload.items.map((item) => ({
      report,
      subjectDefinitionId: binding.subjectDefinitionId,
      item,
      scoreRate: item.score === null || item.maxScore === null || item.maxScore <= 0 ? null : item.score / item.maxScore,
    }));
  });
}

function pairKey(row: DomainRow): string | null {
  if (row.report.personId === null || !CONFIRMED_IDENTITIES.has(row.report.identityStatus) || row.item.domainId === null) return null;
  return `${row.report.personId}|${row.subjectDefinitionId}|${row.item.domainId}`;
}

function uniqueIndex(input: readonly DomainRow[], side: string): ReadonlyMap<string, DomainRow> {
  const index = new Map<string, DomainRow>();
  const duplicates = new Set<string>();
  input.forEach((row) => {
    const key = pairKey(row);
    if (key === null) return;
    if (index.has(key)) duplicates.add(key);
    else index.set(key, row);
  });
  if (duplicates.size) throw new AnalyticsExecutionError([{ code: "DUPLICATE_COMPARISON_KEY", message: `${side} contains duplicate person, subject, and domain rows` }]);
  return index;
}

function baselineBand(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < .25) return "baseline.lt25";
  if (value < .5) return "baseline.25-50";
  if (value < .75) return "baseline.50-75";
  return "baseline.gte75";
}

function pair(baseline: DomainRow, comparison: DomainRow): DomainPair {
  const change = baseline.scoreRate === null || comparison.scoreRate === null ? null : (comparison.scoreRate - baseline.scoreRate) * 100;
  return { baseline, comparison, change, baselineBand: baselineBand(baseline.scoreRate) };
}

function currentGroupValue(row: DomainRow, grouping: AnalyticsGrouping): string | null {
  switch (grouping) {
    case "overall": return "overall";
    case "location": return row.report.locationId;
    case "school": return row.report.schoolCodeRaw ?? "school.unknown";
    case "grade": return row.report.gradeRaw ?? "grade.unknown";
    case "subject": return row.subjectDefinitionId;
    case "domain": return row.item.domainId;
    default: return null;
  }
}

function groupValue(row: DomainPair, grouping: AnalyticsGrouping): string {
  if (grouping === "baseline_band") return row.baselineBand ?? "baseline.unknown";
  return currentGroupValue(row.comparison, grouping) ?? "unsupported";
}

function numeric(input: readonly DomainPair[], read: (row: DomainPair) => number | null): readonly number[] {
  return input.flatMap((row) => {
    const value = read(row);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
}

function mean(input: readonly number[]): number | null {
  return input.length ? input.reduce((sum, value) => sum + value, 0) / input.length : null;
}

function quantile(sorted: readonly number[], position: number): number {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function quantiles(input: readonly number[]): AnalyticsQuantiles | null {
  if (!input.length) return null;
  const sorted = [...input].sort((a, b) => a - b);
  return { minimum: sorted[0], p25: quantile(sorted, .25), median: quantile(sorted, .5), p75: quantile(sorted, .75), maximum: sorted.at(-1) as number };
}

function suppressed(metricId: AnalyticsMetricId, displayType: AnalyticsMetricValue["displayType"], unit: AnalyticsMetricValue["unit"], denominator: number, reason: "SMALL_GROUP" | "INSUFFICIENT_DATA" | "IDENTITY_UNRESOLVED"): AnalyticsMetricValue {
  return { metricId, displayType, value: null, unit, denominator, quantiles: null, points: [], suppressed: true, suppressionReason: reason };
}

function metric(metricId: AnalyticsMetricId, input: readonly DomainPair[], excludedCount: number, threshold: number): AnalyticsMetricValue {
  const sampleCount = new Set(input.map((row) => row.comparison.report.personId)).size;
  if (metricId === "comparable_person_count") return sampleCount < threshold
    ? suppressed(metricId, "scalar", "count", sampleCount + excludedCount, "SMALL_GROUP")
    : { metricId, displayType: "scalar", value: sampleCount, unit: "count", denominator: sampleCount + excludedCount, quantiles: null, points: [], suppressed: false, suppressionReason: null };
  if (metricId === "excluded_rate") {
    const denominator = sampleCount + excludedCount;
    if (sampleCount < threshold) return suppressed(metricId, "scalar", "rate", denominator, sampleCount ? "SMALL_GROUP" : "IDENTITY_UNRESOLVED");
    return denominator ? { metricId, displayType: "scalar", value: excludedCount / denominator, unit: "rate", denominator, quantiles: null, points: [], suppressed: false, suppressionReason: null } : suppressed(metricId, "scalar", "rate", 0, "INSUFFICIENT_DATA");
  }
  const changes = numeric(input, (row) => row.change);
  if (metricId === "domain_change_from_previous_event") {
    if (sampleCount < threshold) return suppressed(metricId, "scalar", "percentage_point", changes.length, "SMALL_GROUP");
    const value = mean(changes);
    return value === null ? suppressed(metricId, "scalar", "percentage_point", 0, "INSUFFICIENT_DATA") : { metricId, displayType: "scalar", value, unit: "percentage_point", denominator: changes.length, quantiles: null, points: [], suppressed: false, suppressionReason: null };
  }
  if (metricId === "change_by_baseline_band") {
    if (sampleCount < threshold) return suppressed(metricId, "breakdown", "percentage_point", changes.length, "SMALL_GROUP");
    const points: AnalyticsPoint[] = ["baseline.lt25", "baseline.25-50", "baseline.50-75", "baseline.gte75"].map((key) => {
      const values = numeric(input.filter((row) => row.baselineBand === key), (row) => row.change);
      return { key, seriesKey: values.length < threshold ? "SMALL_GROUP" : null, value: values.length < threshold ? null : mean(values), denominator: values.length, sampleCount: values.length, missingCount: 0 };
    });
    return points.every((point) => point.value === null) ? suppressed(metricId, "breakdown", "percentage_point", changes.length, "INSUFFICIENT_DATA") : { metricId, displayType: "breakdown", value: null, unit: "percentage_point", denominator: changes.length, quantiles: null, points, suppressed: false, suppressionReason: null };
  }
  if (sampleCount < threshold) return suppressed(metricId, "distribution", "percentage_point", changes.length, "SMALL_GROUP");
  const summary = quantiles(changes);
  if (!summary) return suppressed(metricId, "distribution", "percentage_point", 0, "INSUFFICIENT_DATA");
  const bands = [{ key: "change.lt-20", min: -Infinity, max: -20 }, { key: "change.-20--5", min: -20, max: -5 }, { key: "change.-5-5", min: -5, max: 5 }, { key: "change.5-20", min: 5, max: 20 }, { key: "change.gte20", min: 20, max: Infinity }];
  const points = bands.map(({ key, min, max }) => {
    const count = changes.filter((value) => value >= min && value < max).length;
    return { key, seriesKey: null, value: count, denominator: changes.length, sampleCount: count, missingCount: 0 };
  });
  return { metricId, displayType: "distribution", value: null, unit: "percentage_point", denominator: changes.length, quantiles: summary, points, suppressed: false, suppressionReason: null };
}

function oneEvent(filter: AnalyticsFilter, side: string, issues: AnalyticsExecutionIssue[]): void {
  if (filter.examEventIds?.length !== 1) issues.push({ code: "UNSUPPORTED_COMPARISON", message: `${side} must select exactly one examEventId` });
  if (filter.metricDefinitionIds || filter.targetUniversityIds || filter.targetPreferenceOrders) {
    issues.push({ code: "UNSUPPORTED_FILTER", message: `${side} contains fields that do not apply to domain comparison` });
  }
}

export function executeDomainComparisonAnalytics(query: AnalyticsQuery, dataset: PayloadAnalyticsDataset, generatedAt: string): AnalyticsResult {
  const validation = validateAnalyticsQuery(query);
  if (!validation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_QUERY", message: validation.issues.map((item) => item.message).join(", ") }]);
  const issues: AnalyticsExecutionIssue[] = [];
  if (!query.comparison) issues.push({ code: "UNSUPPORTED_COMPARISON", message: "comparison filters are required" });
  const unsupportedGroups = query.groupBy.filter((grouping) => !GROUPINGS.has(grouping));
  const unsupportedMetrics = query.metricIds.filter((metricId) => !METRICS.has(metricId));
  if (unsupportedGroups.length) issues.push({ code: "UNSUPPORTED_GROUPING", message: unsupportedGroups.join(", ") });
  if (unsupportedMetrics.length) issues.push({ code: "UNSUPPORTED_METRIC", message: unsupportedMetrics.join(", ") });
  if (query.filter.examEventIds || query.filter.metricDefinitionIds || query.filter.targetUniversityIds || query.filter.targetPreferenceOrders) issues.push({ code: "UNSUPPORTED_FILTER", message: "common filter contains fields that do not apply to domain comparison" });
  if (query.comparison) {
    oneEvent(query.comparison.baseline, "baseline", issues);
    oneEvent(query.comparison.comparison, "comparison", issues);
    if (query.comparison.baseline.examEventIds?.[0] === query.comparison.comparison.examEventIds?.[0]) issues.push({ code: "UNSUPPORTED_COMPARISON", message: "baseline and comparison events must differ" });
  }
  if (issues.length || !query.comparison) throw new AnalyticsExecutionError(issues);

  const all = domainRows(dataset).filter((row) => matches(row, query.filter));
  const baselineRows = all.filter((row) => matches(row, query.comparison?.baseline ?? {}));
  const comparisonRows = all.filter((row) => matches(row, query.comparison?.comparison ?? {}));
  const baselineIndex = uniqueIndex(baselineRows, "baseline");
  const comparisonIndex = uniqueIndex(comparisonRows, "comparison");
  const pairs = [...comparisonIndex].flatMap(([key, current]) => {
    const previous = baselineIndex.get(key);
    return previous ? [pair(previous, current)] : [];
  });
  const normalizedCurrent = comparisonRows.filter((row) => row.item.domainId !== null);
  const subjects = new Set(normalizedCurrent.map((row) => row.subjectDefinitionId));
  const domains = new Set(normalizedCurrent.map((row) => row.item.domainId));
  if (subjects.size > 1 && !query.groupBy.includes("subject")) throw new AnalyticsExecutionError([{ code: "MIXED_SUBJECT_DEFINITIONS", message: "select one subjectDefinitionId or group by subject" }]);
  if (domains.size > 1 && !query.groupBy.includes("domain")) throw new AnalyticsExecutionError([{ code: "UNSUPPORTED_GROUPING", message: "select one domainId or group by domain" }]);

  const grouped = new Map<string, DomainPair[]>();
  pairs.forEach((row) => {
    const key = query.groupBy.map((grouping) => `${grouping}=${groupValue(row, grouping)}`).join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  const assignable = query.groupBy.every((grouping) => CURRENT_GROUPINGS.has(grouping));
  const candidates = new Map<string, { count: number; exemplar: DomainRow }>();
  const candidateRows = query.groupBy.includes("domain") ? normalizedCurrent : comparisonRows;
  if (assignable) candidateRows.forEach((row) => {
    const key = query.groupBy.map((grouping) => `${grouping}=${currentGroupValue(row, grouping)}`).join("|");
    const current = candidates.get(key);
    candidates.set(key, { count: (current?.count ?? 0) + 1, exemplar: current?.exemplar ?? row });
  });
  const groupKeys = new Set([...grouped.keys(), ...candidates.keys()]);
  if (!groupKeys.size && query.groupBy.length === 1 && query.groupBy[0] === "overall") groupKeys.add("overall=overall");
  const unnormalizedCount = comparisonRows.filter((row) => row.item.domainId === null).length;
  const globallyExcluded = Math.max(0, comparisonRows.length - pairs.length);
  const groups = [...groupKeys].sort().map((key) => {
    const groupPairs = grouped.get(key) ?? [];
    const first = groupPairs[0];
    const candidate = candidates.get(key);
    const dimensions: Partial<Record<AnalyticsDimension, string>> = {};
    query.groupBy.forEach((grouping) => {
      if (grouping === "overall") return;
      const value = first ? groupValue(first, grouping) : candidate ? currentGroupValue(candidate.exemplar, grouping) : null;
      if (value !== null) dimensions[grouping as AnalyticsDimension] = value;
    });
    const sampleCount = new Set(groupPairs.map((row) => row.comparison.report.personId)).size;
    const excludedCount = candidate ? Math.max(0, candidate.count - groupPairs.length) : query.groupBy.length === 1 && query.groupBy[0] === "overall" ? globallyExcluded : 0;
    const missing = new Map<MissingReason, number>();
    groupPairs.forEach((row) => [row.baseline.item.missingReason, row.comparison.item.missingReason].forEach((reason) => { if (reason) missing.set(reason, (missing.get(reason) ?? 0) + 1); }));
    return {
      group: { groupKey: key, dimensions, subjectDefinitionId: query.groupBy.includes("subject") ? first?.comparison.subjectDefinitionId ?? candidate?.exemplar.subjectDefinitionId ?? null : null, sampleCount, excludedCount, missingCounts: [...missing].sort(([left], [right]) => left.localeCompare(right)).map(([reason, count]) => ({ reason, count })) },
      metrics: query.metricIds.map((metricId) => metric(metricId, groupPairs, excludedCount, query.suppressionThreshold)),
    };
  });
  const eligibleCount = comparisonRows.filter((row) => pairKey(row) !== null).length;
  const warnings = [
    ...(unnormalizedCount ? [`${unnormalizedCount} comparison domain rows lacked normalized domainId and were excluded`] : []),
    ...(eligibleCount > pairs.length ? [`${eligibleCount - pairs.length} normalized comparison domain rows had no matching baseline row`] : []),
    ...(pairs.some((row) => row.baseline.report.schemaVersionId !== row.comparison.report.schemaVersionId) ? ["baseline and comparison use different schema versions; normalized domainId was required"] : []),
    ...(!assignable && globallyExcluded ? ["excluded rows could not be assigned to baseline-derived groups"] : []),
  ];
  const result: AnalyticsResult = { resultVersion: ANALYTICS_RESULT_VERSION, generatedAt: generatedAt as AnalyticsResult["generatedAt"], query, groups, warnings };
  const checked = validateAnalyticsResult(result);
  if (!checked.ok) throw new AnalyticsExecutionError([{ code: "INVALID_RESULT", message: checked.issues.map((item) => item.message).join(", ") }]);
  return result;
}
