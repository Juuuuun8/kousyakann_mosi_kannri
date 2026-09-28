import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import {
  ANALYTICS_RESULT_VERSION,
  AnalyticsExecutionError,
  executeSubjectComparisonAnalytics,
  validateAnalyticsResult,
} from "../src/index.ts";

function comparisonDataset() {
  const current = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1 });
  const baselineReports = current.reports.map((report, index) => ({
    ...report,
    reportId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    examEventId: "kawai.ct.2026.round-1",
    schemaVersionId: "kawai.ct.2026.round-1.v1",
    importedAt: `2026-06-01T00:0${index}:00Z`,
  }));
  const baselineScores = current.subjectScores.map((score, index) => ({
    ...score,
    recordId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    reportId: baselineReports[index].reportId,
    score: (score.score ?? 0) - (index + 1),
    scoreRate: (score.scoreRate ?? 0) - (index + 1) / 100,
    deviation: (score.deviation ?? 0) - 2,
    schemaVersionId: "kawai.ct.2026.round-1.v1",
  }));
  const currentReports = current.reports.map((report, index) => index === 5 ? { ...report, personId: null, identityStatus: "UNRESOLVED" } : report);
  return { reports: [...baselineReports, ...currentReports], subjectScores: [...baselineScores, ...current.subjectScores] };
}

function query(overrides = {}) {
  return {
    resultVersion: ANALYTICS_RESULT_VERSION,
    actorRole: "ADMIN",
    filter: { subjectDefinitionIds: ["subject.synthetic.01"], metricDefinitionIds: ["metric.raw-score"] },
    comparison: {
      baseline: { examEventIds: ["kawai.ct.2026.round-1"] },
      comparison: { examEventIds: ["kawai.ct.2026.round-2"] },
      label: "第1回→第2回",
    },
    groupBy: ["overall"],
    metricIds: [
      "comparable_person_count", "excluded_rate", "change_from_previous_event", "change_distribution",
      "change_by_baseline_band", "national_gap_rate_change_mean", "deviation_change_mean", "deviation_change_distribution",
    ],
    suppressionThreshold: 3,
    ...overrides,
  };
}

test("comparison analytics pair only confirmed identities with the same subject and metric definition", () => {
  const result = executeSubjectComparisonAnalytics(query(), comparisonDataset(), "2026-09-28T13:00:00Z");
  assert.equal(validateAnalyticsResult(result).ok, true);
  const group = result.groups[0];
  assert.equal(group.group.sampleCount, 5);
  assert.equal(group.group.excludedCount, 1);
  assert.equal(group.metrics.find((metric) => metric.metricId === "comparable_person_count")?.value, 5);
  assert.equal(group.metrics.find((metric) => metric.metricId === "excluded_rate")?.value, 1 / 6);
  assert.ok(Math.abs((group.metrics.find((metric) => metric.metricId === "change_from_previous_event")?.value ?? 0) - 3) < 1e-10);
  assert.ok(Math.abs((group.metrics.find((metric) => metric.metricId === "national_gap_rate_change_mean")?.value ?? 0) - 3) < 1e-10);
  assert.equal(group.metrics.find((metric) => metric.metricId === "deviation_change_mean")?.value, 2);
  const changeQuantiles = group.metrics.find((metric) => metric.metricId === "change_distribution")?.quantiles;
  assert.ok(changeQuantiles);
  for (const [key, expected] of Object.entries({ minimum: 1, p25: 2, median: 3, p75: 4, maximum: 5 })) {
    assert.ok(Math.abs(changeQuantiles[key] - expected) < 1e-10);
  }
  assert.match(result.warnings.join(" "), /unresolved identity/);
  assert.match(result.warnings.join(" "), /different schema versions/);
});

test("comparison analytics retain excluded counts inside current-side organization groups", () => {
  const result = executeSubjectComparisonAnalytics(query({ groupBy: ["location"] }), comparisonDataset(), "2026-09-28T13:00:00Z");
  const location2 = result.groups.find((entry) => entry.group.dimensions.location === "loc.synthetic.2");
  assert.equal(location2?.group.sampleCount, 2);
  assert.equal(location2?.group.excludedCount, 1);
  assert.ok(location2?.metrics.every((metric) => metric.suppressed));
});

test("comparison analytics suppress small cohorts and keep values absent", () => {
  const result = executeSubjectComparisonAnalytics(query({ suppressionThreshold: 6 }), comparisonDataset(), "2026-09-28T13:00:00Z");
  assert.ok(result.groups[0].metrics.every((metric) => metric.suppressed));
  assert.ok(result.groups[0].metrics.every((metric) => metric.value === null && metric.quantiles === null && metric.points.length === 0));
});

test("comparison analytics reject duplicate keys, invalid event scopes, and mixed subjects", () => {
  const dataset = comparisonDataset();
  const duplicateReport = { ...dataset.reports[6], reportId: "30000000-0000-4000-8000-000000000001" };
  const duplicateScore = { ...dataset.subjectScores[6], recordId: "40000000-0000-4000-8000-000000000001", reportId: duplicateReport.reportId };
  assert.throws(
    () => executeSubjectComparisonAnalytics(query(), { reports: [...dataset.reports, duplicateReport], subjectScores: [...dataset.subjectScores, duplicateScore] }, "2026-09-28T13:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "DUPLICATE_COMPARISON_KEY"),
  );
  assert.throws(
    () => executeSubjectComparisonAnalytics(query({ comparison: { baseline: {}, comparison: { examEventIds: ["kawai.ct.2026.round-2"] } } }), dataset, "2026-09-28T13:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_COMPARISON"),
  );
  const doubled = comparisonDataset();
  const extraScores = doubled.subjectScores.map((score, index) => ({ ...score, recordId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, subjectDefinitionId: "subject.synthetic.02" }));
  assert.throws(
    () => executeSubjectComparisonAnalytics(query({ filter: { metricDefinitionIds: ["metric.raw-score"] } }), { reports: doubled.reports, subjectScores: [...doubled.subjectScores, ...extraScores] }, "2026-09-28T13:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "MIXED_SUBJECT_DEFINITIONS"),
  );
});

test("comparison analytics return an explicit suppressed overall group when nobody is comparable", () => {
  const dataset = comparisonDataset();
  const reports = dataset.reports.map((report) => report.examEventId === "kawai.ct.2026.round-2" ? { ...report, personId: null, identityStatus: "UNRESOLVED" } : report);
  const result = executeSubjectComparisonAnalytics(query(), { ...dataset, reports }, "2026-09-28T13:00:00Z");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].group.sampleCount, 0);
  assert.equal(result.groups[0].group.excludedCount, 6);
  assert.ok(result.groups[0].metrics.every((metric) => metric.suppressed));
});
