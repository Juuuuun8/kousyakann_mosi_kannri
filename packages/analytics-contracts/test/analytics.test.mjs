import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_RESULT_VERSION,
  defaultSuppressionThreshold,
  validateAnalyticsQuery,
  validateAnalyticsResult,
} from "../src/index.ts";

const validQuery = {
  resultVersion: ANALYTICS_RESULT_VERSION,
  actorRole: "ADMIN",
  filter: { examEventIds: ["kawai.ct.2026.round-2"] },
  groupBy: ["location", "subject"],
  metricIds: ["score_mean", "missing_rate"],
  suppressionThreshold: 5,
};

test("analytics query contract fixes admin, filters, metrics, and suppression", () => {
  assert.equal(validateAnalyticsQuery(validQuery).ok, true);
  assert.equal(defaultSuppressionThreshold(), 5);
  assert.equal(validateAnalyticsQuery({ ...validQuery, actorRole: "INPUT" }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, metricIds: ["not-a-metric"] }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, suppressionThreshold: undefined }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, studentName: "must-not-pass" }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, groupBy: ["location", "location"] }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, filter: { importedAtFrom: "2026-10-01T00:00:00Z", importedAtTo: "2026-09-01T00:00:00Z" } }).ok, false);
  assert.equal(validateAnalyticsQuery({ ...validQuery, filter: { metricDefinitionIds: ["metric.subject.summary"] }, groupBy: ["metric_definition"] }).ok, true);
});

test("analytics result contract requires suppression metadata", () => {
  const result = {
    resultVersion: ANALYTICS_RESULT_VERSION,
    generatedAt: "2026-09-28T00:00:00Z",
    query: validQuery,
    groups: [{
      group: {
        groupKey: "loc.synthetic.1",
        dimensions: { location: "loc.synthetic.1", subject: "subject.synthetic.01" },
        subjectDefinitionId: "subject.synthetic.01",
        sampleCount: 12,
        excludedCount: 1,
        missingCounts: [],
      },
      metrics: [
        { metricId: "score_mean", displayType: "scalar", value: 61.5, unit: "score", denominator: 12, quantiles: null, points: [], suppressed: false, suppressionReason: null },
        { metricId: "missing_rate", displayType: "scalar", value: null, unit: "rate", denominator: 3, quantiles: null, points: [], suppressed: true, suppressionReason: "SMALL_GROUP" },
      ],
    }],
    warnings: [],
  };
  assert.equal(validateAnalyticsResult(result).ok, true);
  const invalid = structuredClone(result);
  invalid.groups[0].metrics[1].suppressionReason = null;
  assert.equal(validateAnalyticsResult(invalid).ok, false);
  const leakedIdentifier = structuredClone(result);
  leakedIdentifier.groups[0].group.dimensions.studentName = "must-not-pass";
  assert.equal(validateAnalyticsResult(leakedIdentifier).ok, false);
  const extraMetric = structuredClone(result);
  extraMetric.groups[0].metrics.push({ ...extraMetric.groups[0].metrics[0], metricId: "deviation_mean" });
  assert.equal(validateAnalyticsResult(extraMetric).ok, false);
});

test("analytics result supports evidence-rich distributions and blocks suppressed leakage", () => {
  const result = {
    resultVersion: ANALYTICS_RESULT_VERSION,
    generatedAt: "2026-09-28T00:00:00Z",
    query: { ...validQuery, groupBy: ["overall"], metricIds: ["score_rate_distribution"] },
    groups: [{
      group: { groupKey: "overall", dimensions: {}, subjectDefinitionId: null, sampleCount: 120, excludedCount: 8, missingCounts: [] },
      metrics: [{
        metricId: "score_rate_distribution",
        displayType: "distribution",
        value: null,
        unit: "rate",
        denominator: 120,
        quantiles: { minimum: 0.12, p25: 0.48, median: 0.63, p75: 0.76, maximum: 0.98 },
        points: [{ key: "band.60-70", seriesKey: null, value: 31, denominator: 120, sampleCount: 31, missingCount: 0 }],
        suppressed: false,
        suppressionReason: null,
      }],
    }],
    warnings: [],
  };
  assert.equal(validateAnalyticsResult(result).ok, true);
  const leaked = structuredClone(result);
  leaked.groups[0].metrics[0].suppressed = true;
  leaked.groups[0].metrics[0].suppressionReason = "SMALL_GROUP";
  assert.equal(validateAnalyticsResult(leaked).ok, false);
});
