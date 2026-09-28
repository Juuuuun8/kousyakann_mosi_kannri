import type {
  AnswerCorrectnessCode,
  MissingReason,
  PayloadJson,
  ReportRecord,
  SubjectDefinitionId,
  UUID,
} from "../../contracts/src/types.ts";
import { ANALYTICS_RESULT_VERSION } from "./constants.ts";
import { AnalyticsExecutionError, type AnalyticsExecutionIssue } from "./engine.ts";
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
  AnalyticsUnit,
} from "./types.ts";
import { validateAnalyticsQuery, validateAnalyticsResult } from "./validation.ts";

export interface AnalyticsPayloadBinding {
  readonly reportId: UUID;
  readonly subjectDefinitionId: SubjectDefinitionId;
  readonly payload: PayloadJson;
}

export interface PayloadAnalyticsDataset {
  readonly reports: readonly ReportRecord[];
  readonly payloadBindings: readonly AnalyticsPayloadBinding[];
}

type PayloadFamily = "domain" | "answer" | "target";

interface Observation {
  readonly report: ReportRecord;
  readonly subjectDefinitionId: SubjectDefinitionId;
  readonly family: PayloadFamily;
  readonly domainId: string | null;
  readonly majorQuestion: number | null;
  readonly questionRaw: string | null;
  readonly correctness: AnswerCorrectnessCode | null;
  readonly targetUniversityId: string | null;
  readonly targetRank: number | null;
  readonly judgementRaw: string | null;
  readonly scoreRate: number | null;
  readonly sameAbilityGap: number | null;
  readonly borderGap: number | null;
  readonly targetUnit: Extract<AnalyticsUnit, "score" | "deviation"> | null;
  readonly missingReason: MissingReason | null;
}

const METRIC_FAMILY: Readonly<Partial<Record<AnalyticsMetricId, PayloadFamily>>> = {
  domain_score_rate_mean: "domain",
  domain_score_rate_distribution: "domain",
  same_ability_gap_mean: "domain",
  item_correct_rate: "answer",
  item_wrong_rate: "answer",
  item_partial_rate: "answer",
  item_no_answer_rate: "answer",
  item_extra_mark_rate: "answer",
  item_result_by_position: "answer",
  target_judgement_distribution: "target",
  target_border_gap: "target",
  target_border_gap_distribution: "target",
};

const COMMON_GROUPINGS = new Set<AnalyticsGrouping>(["overall", "exam_event", "location", "school", "grade", "subject"]);
const FAMILY_GROUPINGS: Readonly<Record<PayloadFamily, ReadonlySet<AnalyticsGrouping>>> = {
  domain: new Set(["domain"]),
  answer: new Set(["major_question", "question"]),
  target: new Set(["target_school", "target_rank", "judgement"]),
};

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

function observations(binding: AnalyticsPayloadBinding, report: ReportRecord): readonly Observation[] {
  const common = { report, subjectDefinitionId: binding.subjectDefinitionId };
  if (binding.payload.type === "domain_results") return binding.payload.items.map((item) => ({
    ...common, family: "domain", domainId: item.domainId, majorQuestion: null, questionRaw: item.questionNumberRaw,
    correctness: null, targetUniversityId: null, targetRank: null, judgementRaw: null,
    scoreRate: item.score === null || item.maxScore === null || item.maxScore === 0 ? null : item.score / item.maxScore,
    sameAbilityGap: item.sameAbilityDifference, borderGap: null, targetUnit: null, missingReason: item.missingReason,
  }));
  if (binding.payload.type === "answer_marks") return binding.payload.items.map((item) => ({
    ...common, family: "answer", domainId: null, majorQuestion: item[0], questionRaw: item[1], correctness: item[3],
    targetUniversityId: null, targetRank: null, judgementRaw: null, scoreRate: null, sameAbilityGap: null,
    borderGap: null, targetUnit: null, missingReason: item[5],
  }));
  if (binding.payload.type === "targets") return binding.payload.items.map((item) => ({
    ...common, family: "target", domainId: null, majorQuestion: null, questionRaw: null, correctness: null,
    targetUniversityId: item.universityId, targetRank: item.preferenceOrder, judgementRaw: item.judgementRaw,
    scoreRate: null, sameAbilityGap: null,
    borderGap: item.scoreOrDeviation === null || item.borderScore === null ? null : item.scoreOrDeviation - item.borderScore,
    targetUnit: item.scoreMetricRaw?.includes("偏差値") ? "deviation" : item.scoreMetricRaw?.includes("得点") ? "score" : null,
    missingReason: item.missingReason,
  }));
  return [];
}

function observationMatches(item: Observation, filter: AnalyticsFilter): boolean {
  return reportMatches(item.report, filter) && included(filter.subjectDefinitionIds, item.subjectDefinitionId) &&
    included(filter.domainIds, item.domainId ?? "") &&
    included(filter.targetUniversityIds, item.targetUniversityId ?? "") &&
    included(filter.targetPreferenceOrders, item.targetRank ?? 0) &&
    (filter.missingReasons === undefined || (item.missingReason !== null && filter.missingReasons.includes(item.missingReason)));
}

function groupingValue(item: Observation, grouping: AnalyticsGrouping): string {
  switch (grouping) {
    case "overall": return "overall";
    case "exam_event": return item.report.examEventId;
    case "location": return item.report.locationId;
    case "school": return item.report.schoolCodeRaw ?? "school.unknown";
    case "grade": return item.report.gradeRaw ?? "grade.unknown";
    case "subject": return item.subjectDefinitionId;
    case "domain": return item.domainId ?? "domain.unknown";
    case "major_question": return item.majorQuestion === null ? "major.unknown" : `major.${item.majorQuestion}`;
    case "question": return item.questionRaw === null ? "question.unknown" : `question.${item.questionRaw}`;
    case "target_school": return item.targetUniversityId ?? "target.unknown";
    case "target_rank": return item.targetRank === null ? "rank.unknown" : `rank.${item.targetRank}`;
    case "judgement": return item.judgementRaw ?? "judgement.unknown";
    default: return "unsupported";
  }
}

function quantile(sorted: readonly number[], position: number): number {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summary(values: readonly number[]): AnalyticsQuantiles | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { minimum: sorted[0], p25: quantile(sorted, .25), median: quantile(sorted, .5), p75: quantile(sorted, .75), maximum: sorted.at(-1) as number };
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function values(items: readonly Observation[], read: (item: Observation) => number | null): readonly number[] {
  return items.flatMap((item) => {
    const value = read(item);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
}

function suppressed(metricId: AnalyticsMetricId, displayType: AnalyticsMetricValue["displayType"], unit: AnalyticsMetricValue["unit"], denominator: number, reason: "SMALL_GROUP" | "INSUFFICIENT_DATA"): AnalyticsMetricValue {
  return { metricId, displayType, value: null, unit, denominator, quantiles: null, points: [], suppressed: true, suppressionReason: reason };
}

function scalar(metricId: AnalyticsMetricId, value: number | null, unit: AnalyticsMetricValue["unit"], denominator: number, sampleCount: number, threshold: number): AnalyticsMetricValue {
  if (sampleCount < threshold) return suppressed(metricId, "scalar", unit, denominator, "SMALL_GROUP");
  if (value === null) return suppressed(metricId, "scalar", unit, denominator, "INSUFFICIENT_DATA");
  return { metricId, displayType: "scalar", value, unit, denominator, quantiles: null, points: [], suppressed: false, suppressionReason: null };
}

function distribution(metricId: AnalyticsMetricId, input: readonly number[], unit: AnalyticsMetricValue["unit"], sampleCount: number, threshold: number, bands: readonly { key: string; min: number; max: number }[]): AnalyticsMetricValue {
  if (sampleCount < threshold) return suppressed(metricId, "distribution", unit, input.length, "SMALL_GROUP");
  const quantiles = summary(input);
  if (!quantiles) return suppressed(metricId, "distribution", unit, 0, "INSUFFICIENT_DATA");
  const points: AnalyticsPoint[] = bands.map((band) => {
    const count = input.filter((value) => value >= band.min && value < band.max).length;
    return { key: band.key, seriesKey: null, value: count, denominator: input.length, sampleCount: count, missingCount: 0 };
  });
  return { metricId, displayType: "distribution", value: null, unit, denominator: input.length, quantiles, points, suppressed: false, suppressionReason: null };
}

function metric(metricId: AnalyticsMetricId, items: readonly Observation[], sampleCount: number, threshold: number, targetUnit: Extract<AnalyticsUnit, "score" | "deviation"> = "score"): AnalyticsMetricValue {
  if (metricId === "domain_score_rate_mean") {
    const input = values(items, (item) => item.scoreRate);
    return scalar(metricId, average(input), "rate", input.length, sampleCount, threshold);
  }
  if (metricId === "same_ability_gap_mean") {
    const input = values(items, (item) => item.sameAbilityGap);
    return scalar(metricId, average(input), "score", input.length, sampleCount, threshold);
  }
  if (metricId === "domain_score_rate_distribution") return distribution(metricId, values(items, (item) => item.scoreRate), "rate", sampleCount, threshold, [
    { key: "rate.0-20", min: 0, max: .2 }, { key: "rate.20-40", min: .2, max: .4 }, { key: "rate.40-60", min: .4, max: .6 },
    { key: "rate.60-80", min: .6, max: .8 }, { key: "rate.80-100", min: .8, max: Number.POSITIVE_INFINITY },
  ]);
  const correctnessByMetric: Readonly<Partial<Record<AnalyticsMetricId, AnswerCorrectnessCode>>> = {
    item_correct_rate: "CORRECT", item_wrong_rate: "WRONG", item_partial_rate: "PARTIAL",
    item_no_answer_rate: "NO_ANSWER", item_extra_mark_rate: "EXTRA_MARK",
  };
  const correctness = correctnessByMetric[metricId];
  if (correctness) return scalar(metricId, items.length ? items.filter((item) => item.correctness === correctness).length / items.length : null, "rate", items.length, sampleCount, threshold);
  if (metricId === "item_result_by_position") {
    if (sampleCount < threshold) return suppressed(metricId, "breakdown", "count", items.length, "SMALL_GROUP");
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const key = `${item.questionRaw ?? "unknown"}|${item.correctness ?? "UNKNOWN"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const points = [...counts].sort(([a], [b]) => a.localeCompare(b, "ja", { numeric: true })).map(([key, count]) => {
      const [question, code] = key.split("|");
      return { key: `question.${question}`, seriesKey: code, value: count, denominator: sampleCount, sampleCount: count, missingCount: 0 };
    });
    return points.length ? { metricId, displayType: "breakdown", value: null, unit: "count", denominator: items.length, quantiles: null, points, suppressed: false, suppressionReason: null } : suppressed(metricId, "breakdown", "count", 0, "INSUFFICIENT_DATA");
  }
  if (metricId === "target_judgement_distribution") {
    if (sampleCount < threshold) return suppressed(metricId, "breakdown", "count", items.length, "SMALL_GROUP");
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.judgementRaw ?? "UNKNOWN", (counts.get(item.judgementRaw ?? "UNKNOWN") ?? 0) + 1));
    const points = [...counts].sort().map(([key, count]) => ({ key: `judgement.${key}`, seriesKey: null, value: count, denominator: items.length, sampleCount: count, missingCount: 0 }));
    return points.length ? { metricId, displayType: "breakdown", value: null, unit: "count", denominator: items.length, quantiles: null, points, suppressed: false, suppressionReason: null } : suppressed(metricId, "breakdown", "count", 0, "INSUFFICIENT_DATA");
  }
  const gaps = values(items, (item) => item.borderGap);
  if (metricId === "target_border_gap") return scalar(metricId, average(gaps), targetUnit, gaps.length, sampleCount, threshold);
  return distribution(metricId, gaps, targetUnit, sampleCount, threshold, [
    { key: "gap.lt-20", min: Number.NEGATIVE_INFINITY, max: -20 }, { key: "gap.-20-0", min: -20, max: 0 },
    { key: "gap.0-20", min: 0, max: 20 }, { key: "gap.gte20", min: 20, max: Number.POSITIVE_INFINITY },
  ]);
}

export function executePayloadAnalytics(query: AnalyticsQuery, dataset: PayloadAnalyticsDataset, generatedAt: string): AnalyticsResult {
  const validation = validateAnalyticsQuery(query);
  if (!validation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_QUERY", message: validation.issues.map((item) => item.message).join(", ") }]);
  if (query.comparison) throw new AnalyticsExecutionError([{ code: "UNSUPPORTED_COMPARISON", message: "payload comparison execution is not implemented" }]);
  if (query.filter.metricDefinitionIds) throw new AnalyticsExecutionError([{ code: "UNSUPPORTED_FILTER", message: "metricDefinitionIds apply to SubjectScore analytics" }]);
  const families = new Set(query.metricIds.flatMap((id) => METRIC_FAMILY[id] ? [METRIC_FAMILY[id] as PayloadFamily] : []));
  const unknown = query.metricIds.filter((id) => !METRIC_FAMILY[id]);
  const issues: AnalyticsExecutionIssue[] = [];
  if (unknown.length || families.size !== 1) issues.push({ code: "UNSUPPORTED_METRIC", message: "one payload family must be requested per query" });
  const family = [...families][0];
  const unsupportedGroups = query.groupBy.filter((grouping) => !COMMON_GROUPINGS.has(grouping) && !FAMILY_GROUPINGS[family]?.has(grouping));
  if (unsupportedGroups.length) issues.push({ code: "UNSUPPORTED_GROUPING", message: unsupportedGroups.join(", ") });
  if (issues.length) throw new AnalyticsExecutionError(issues);

  const reports = new Map(dataset.reports.filter((report) => report.status === "ACTIVE").map((report) => [report.reportId, report]));
  const items = dataset.payloadBindings.flatMap((binding) => {
    const report = reports.get(binding.reportId);
    return report ? observations(binding, report) : [];
  }).filter((item) => item.family === family && observationMatches(item, query.filter));
  if (new Set(items.map((item) => item.report.schemaVersionId)).size > 1) throw new AnalyticsExecutionError([{ code: "MIXED_SCHEMA_VERSIONS", message: "select one schemaVersionId before payload aggregation" }]);
  if (query.groupBy.includes("target_school") && items.some((item) => item.targetUniversityId === null)) throw new AnalyticsExecutionError([{ code: "UNSUPPORTED_GROUPING", message: "target_school requires normalized universityId for every included item" }]);
  const requestsBorderGap = query.metricIds.some((id) => id === "target_border_gap" || id === "target_border_gap_distribution");
  const gapItems = requestsBorderGap ? items.filter((item) => item.borderGap !== null) : [];
  const targetUnits = new Set(gapItems.flatMap((item) => item.targetUnit ? [item.targetUnit] : []));
  if (gapItems.some((item) => item.targetUnit === null) || targetUnits.size > 1) throw new AnalyticsExecutionError([{ code: "MIXED_METRIC_DEFINITIONS", message: "target border gaps require one recognized score metric (score or deviation)" }]);
  const targetUnit = [...targetUnits][0] ?? "score";

  const grouped = new Map<string, Observation[]>();
  items.forEach((item) => {
    const key = query.groupBy.map((grouping) => `${grouping}=${groupingValue(item, grouping)}`).join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([key, groupItems]) => {
    const first = groupItems[0];
    const dimensions: Partial<Record<AnalyticsDimension, string>> = {};
    query.groupBy.forEach((grouping) => { if (grouping !== "overall") dimensions[grouping as AnalyticsDimension] = groupingValue(first, grouping); });
    const missing = new Map<MissingReason, number>();
    groupItems.forEach((item) => { if (item.missingReason) missing.set(item.missingReason, (missing.get(item.missingReason) ?? 0) + 1); });
    const sampleCount = new Set(groupItems.map((item) => item.report.reportId)).size;
    return {
      group: {
        groupKey: key, dimensions, subjectDefinitionId: query.groupBy.includes("subject") ? first.subjectDefinitionId : null,
        sampleCount, excludedCount: groupItems.filter((item) => item.missingReason !== null).length,
        missingCounts: [...missing].map(([reason, count]) => ({ reason, count })),
      },
      metrics: query.metricIds.map((id) => metric(id, groupItems, sampleCount, query.suppressionThreshold, targetUnit)),
    };
  });
  const result: AnalyticsResult = { resultVersion: ANALYTICS_RESULT_VERSION, generatedAt: generatedAt as AnalyticsResult["generatedAt"], query, groups, warnings: [] };
  const resultValidation = validateAnalyticsResult(result);
  if (!resultValidation.ok) throw new AnalyticsExecutionError([{ code: "INVALID_RESULT", message: resultValidation.issues.map((item) => item.message).join(", ") }]);
  return result;
}
