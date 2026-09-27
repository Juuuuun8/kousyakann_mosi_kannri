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
  assert.equal(validateAnalyticsQuery({ ...validQuery, filter: { importedAtFrom: "2026-10-01T00:00:00Z", importedAtTo: "2026-09-01T00:00:00Z" } }).ok, false);
});

test("analytics result contract requires suppression metadata", () => {
  const result = {
    resultVersion: ANALYTICS_RESULT_VERSION,
    generatedAt: "2026-09-28T00:00:00Z",
    query: validQuery,
    groups: [{
      group: {
        groupKey: "loc.synthetic.1",
        dimensions: { location: "loc.synthetic.1" },
        subjectDefinitionId: null,
        sampleCount: 12,
        excludedCount: 1,
        missingCounts: [],
      },
      metrics: [
        { metricId: "score_mean", value: 61.5, unit: "score", denominator: 12, suppressed: false, suppressionReason: null },
        { metricId: "deviation_mean", value: null, unit: "deviation", denominator: 3, suppressed: true, suppressionReason: "SMALL_GROUP" },
      ],
    }],
    warnings: [],
  };
  assert.equal(validateAnalyticsResult(result).ok, true);
  const invalid = structuredClone(result);
  invalid.groups[0].metrics[1].suppressionReason = null;
  assert.equal(validateAnalyticsResult(invalid).ok, false);
});
