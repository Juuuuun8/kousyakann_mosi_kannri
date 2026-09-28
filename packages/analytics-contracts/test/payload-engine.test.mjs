import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import {
  ANALYTICS_RESULT_VERSION,
  AnalyticsExecutionError,
  executePayloadAnalytics,
  validateAnalyticsResult,
} from "../src/index.ts";

function query(metricIds, groupBy = ["overall"], suppressionThreshold = 5, filter = {}) {
  return { resultVersion: ANALYTICS_RESULT_VERSION, actorRole: "ADMIN", filter, groupBy, metricIds, suppressionThreshold };
}

test("domain payload analytics preserve domain definitions and evidence denominators", () => {
  const dataset = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1 });
  const result = executePayloadAnalytics(
    query(["domain_score_rate_mean", "domain_score_rate_distribution", "same_ability_gap_mean"], ["domain"]),
    dataset,
    "2026-09-28T12:00:00Z",
  );
  assert.equal(result.groups.length, 8);
  const first = result.groups.find((entry) => entry.group.dimensions.domain === "domain.synthetic.1");
  assert.equal(first?.group.sampleCount, 6);
  assert.ok(Math.abs((first?.metrics.find((metric) => metric.metricId === "domain_score_rate_mean")?.value ?? 0) - 0.4) < 1e-12);
  assert.ok(Math.abs((first?.metrics.find((metric) => metric.metricId === "same_ability_gap_mean")?.value ?? 0) + 0.2) < 1e-12);
  assert.equal(validateAnalyticsResult(result).ok, true);
});

test("answer payload analytics calculate result composition and position breakdown", () => {
  const dataset = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1, itemsPerSubject: 40 });
  const result = executePayloadAnalytics(
    query(["item_correct_rate", "item_wrong_rate", "item_no_answer_rate", "item_result_by_position"]),
    dataset,
    "2026-09-28T12:00:00Z",
  );
  const group = result.groups[0];
  assert.equal(group.group.sampleCount, 6);
  assert.equal(group.metrics.find((metric) => metric.metricId === "item_correct_rate")?.value, 0.65);
  assert.equal(group.metrics.find((metric) => metric.metricId === "item_wrong_rate")?.value, 0.35);
  assert.equal(group.metrics.find((metric) => metric.metricId === "item_no_answer_rate")?.value, 0);
  assert.equal(group.metrics.find((metric) => metric.metricId === "item_result_by_position")?.points.length, 40);
});

function targetPayload(index, scoreMetricRaw = "得点") {
  const judgement = ["A", "B", "C"][index % 3];
  return {
    v: 1,
    type: "targets",
    items: [{
      preferenceOrder: 1,
      scheduleRaw: "前",
      universityRaw: "合成大学",
      facultyRaw: "合成学部",
      departmentMethodRaw: "合成方式",
      universityId: "university.synthetic.1",
      judgementRaw: judgement,
      scoreMetricRaw,
      scoreOrDeviation: 65 + index,
      fullScore: 100,
      borderScore: 70,
      firstChoiceRank: 1,
      firstChoicePopulation: 10,
      totalRank: 2,
      totalPopulation: 20,
      firstChoiceAverage: 60,
      totalAverage: 58,
      capacity: 20,
      subjectResults: [],
      evaluationBands: [],
      missingReason: null,
    }],
  };
}

test("target analytics return judgement and border-gap distributions without names", () => {
  const base = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1 });
  const payloadBindings = base.reports.map((report, index) => ({
    reportId: report.reportId,
    subjectDefinitionId: base.subjectScores[index].subjectDefinitionId,
    payload: targetPayload(index),
  }));
  const result = executePayloadAnalytics(
    query(["target_judgement_distribution", "target_border_gap", "target_border_gap_distribution"], ["target_rank"]),
    { reports: base.reports, payloadBindings },
    "2026-09-28T12:00:00Z",
  );
  const group = result.groups[0];
  assert.deepEqual(group.metrics.find((metric) => metric.metricId === "target_judgement_distribution")?.points.map((point) => point.value), [2, 2, 2]);
  assert.equal(group.metrics.find((metric) => metric.metricId === "target_border_gap")?.value, -2.5);
  assert.equal(JSON.stringify(result).includes("合成大学"), false);
  assert.equal(validateAnalyticsResult(result).ok, true);
});

test("target border gaps preserve deviation units and reject mixed metric definitions", () => {
  const base = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1 });
  const bindings = (metricForIndex) => base.reports.map((report, index) => ({
    reportId: report.reportId,
    subjectDefinitionId: base.subjectScores[index].subjectDefinitionId,
    payload: targetPayload(index, metricForIndex(index)),
  }));
  const deviation = executePayloadAnalytics(
    query(["target_border_gap", "target_border_gap_distribution"]),
    { reports: base.reports, payloadBindings: bindings(() => "偏差値") },
    "2026-09-28T12:00:00Z",
  );
  assert.ok(deviation.groups[0].metrics.every((metric) => metric.unit === "deviation"));
  assert.throws(
    () => executePayloadAnalytics(
      query(["target_border_gap"]),
      { reports: base.reports, payloadBindings: bindings((index) => index % 2 ? "偏差値" : "得点") },
      "2026-09-28T12:00:00Z",
    ),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "MIXED_METRIC_DEFINITIONS"),
  );
});

test("payload engine suppresses small groups and rejects unsafe or mixed requests", () => {
  const dataset = makeSyntheticDataset({ reportCount: 2, subjectsPerReport: 1 });
  const suppressed = executePayloadAnalytics(query(["item_correct_rate", "item_result_by_position"]), dataset, "2026-09-28T12:00:00Z");
  assert.ok(suppressed.groups[0].metrics.every((metric) => metric.suppressed && metric.value === null && metric.points.length === 0));
  assert.throws(
    () => executePayloadAnalytics(query(["item_correct_rate", "domain_score_rate_mean"]), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_METRIC"),
  );
  assert.throws(
    () => executePayloadAnalytics(query(["item_correct_rate"], ["target_school"]), dataset, "2026-09-28T12:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_GROUPING"),
  );
});
