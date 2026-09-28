import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import {
  ANALYTICS_RESULT_VERSION,
  AnalyticsExecutionError,
  executeSubjectAnalytics,
  validateAnalyticsResult,
} from "../src/index.ts";

function query(overrides = {}) {
  return {
    resultVersion: ANALYTICS_RESULT_VERSION,
    actorRole: "ADMIN",
    filter: { metricDefinitionIds: ["metric.raw-score"] },
    groupBy: ["location", "subject"],
    metricIds: ["report_count", "score_mean", "score_median", "score_quantiles", "score_rate_distribution", "missing_rate"],
    suppressionThreshold: 2,
    ...overrides,
  };
}

test("subject analytics groups active canonical rows with evidence-rich statistics", () => {
  const dataset = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 2 });
  const result = executeSubjectAnalytics(query(), dataset, "2026-09-28T12:00:00Z");
  assert.equal(validateAnalyticsResult(result).ok, true);
  assert.equal(result.groups.length, 4);
  const group = result.groups.find((entry) => entry.group.dimensions.location === "loc.synthetic.1" && entry.group.subjectDefinitionId === "subject.synthetic.01");
  assert.equal(group?.group.sampleCount, 3);
  assert.equal(group?.group.dimensions.subject, "subject.synthetic.01");
  assert.equal(group?.metrics.find((metric) => metric.metricId === "report_count")?.value, 3);
  assert.equal(group?.metrics.find((metric) => metric.metricId === "score_mean")?.value, 42);
  assert.deepEqual(group?.metrics.find((metric) => metric.metricId === "score_quantiles")?.quantiles, {
    minimum: 40, p25: 41, median: 42, p75: 43, maximum: 44,
  });
  assert.equal(group?.metrics.find((metric) => metric.metricId === "score_rate_distribution")?.points.reduce((sum, point) => sum + (point.value ?? 0), 0), 3);
});

test("small groups expose counts and reasons but suppress every metric value", () => {
  const dataset = makeSyntheticDataset({ reportCount: 3, subjectsPerReport: 1 });
  const result = executeSubjectAnalytics(query({ groupBy: ["location"], suppressionThreshold: 3 }), dataset, "2026-09-28T12:00:00Z");
  assert.equal(result.groups.length, 2);
  const small = result.groups.find((entry) => entry.group.sampleCount === 1);
  assert.ok(small);
  assert.ok(small.metrics.every((metric) => metric.suppressed && metric.suppressionReason === "SMALL_GROUP"));
  assert.ok(small.metrics.every((metric) => metric.value === null && metric.quantiles === null && metric.points.length === 0));
  assert.equal(validateAnalyticsResult(result).ok, true);
});

test("missing reasons remain distinct from zero and affect completeness denominators", () => {
  const base = makeSyntheticDataset({ reportCount: 5, subjectsPerReport: 1 });
  const subjectScores = base.subjectScores.map((score, index) => index === 0 ? {
    ...score,
    score: null,
    scoreRate: null,
    missingReason: "NOT_TAKEN",
  } : score);
  const result = executeSubjectAnalytics(query({ groupBy: ["overall"], metricIds: ["participation_rate", "data_completeness_rate", "missing_rate"] }), { ...base, subjectScores }, "2026-09-28T12:00:00Z");
  assert.equal(result.groups[0].group.missingCounts[0].reason, "NOT_TAKEN");
  assert.equal(result.groups[0].group.missingCounts[0].count, 1);
  assert.equal(result.groups[0].metrics.find((metric) => metric.metricId === "participation_rate")?.value, 0.8);
  assert.equal(result.groups[0].metrics.find((metric) => metric.metricId === "missing_rate")?.value, 0.2);
});

test("mixed metric definitions fail closed unless explicitly separated", () => {
  const base = makeSyntheticDataset({ reportCount: 5, subjectsPerReport: 1 });
  const subjectScores = base.subjectScores.map((score, index) => index === 0 ? { ...score, metricDefinitionId: "metric.converted-score" } : score);
  assert.throws(
    () => executeSubjectAnalytics(query({ filter: {}, groupBy: ["overall"] }), { ...base, subjectScores }, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "MIXED_METRIC_DEFINITIONS"),
  );
  const separated = executeSubjectAnalytics(query({ filter: {}, groupBy: ["metric_definition"], metricIds: ["report_count"] }), { ...base, subjectScores }, "2026-09-28T12:00:00Z");
  assert.equal(separated.groups.length, 2);
});

test("unsupported payload-level analytics never return invented values", () => {
  const dataset = makeSyntheticDataset({ reportCount: 5, subjectsPerReport: 1 });
  assert.throws(
    () => executeSubjectAnalytics(query({ metricIds: ["item_correct_rate"] }), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_METRIC"),
  );
});

test("unsupported target filters and comparisons fail instead of being silently ignored", () => {
  const dataset = makeSyntheticDataset({ reportCount: 5, subjectsPerReport: 1 });
  assert.throws(
    () => executeSubjectAnalytics(query({ filter: { targetPreferenceOrders: [1] } }), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_FILTER"),
  );
  assert.throws(
    () => executeSubjectAnalytics(query({ comparison: { baseline: {}, comparison: {} } }), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_COMPARISON"),
  );
});

test("subject metrics cannot silently combine different subjects", () => {
  const dataset = makeSyntheticDataset({ reportCount: 5, subjectsPerReport: 2 });
  assert.throws(
    () => executeSubjectAnalytics(query({ groupBy: ["overall"], metricIds: ["score_mean"] }), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "MIXED_SUBJECT_DEFINITIONS"),
  );
});
