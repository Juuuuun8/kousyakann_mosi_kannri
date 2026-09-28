import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import { ANALYTICS_RESULT_VERSION, AnalyticsExecutionError, executeDomainComparisonAnalytics, validateAnalyticsResult } from "../src/index.ts";

function payload(score, domainId = "domain.synthetic.1") {
  return {
    v: 1,
    type: "domain_results",
    subject: "subject.synthetic.01",
    commentaryRaw: null,
    items: [{
      questionNumberRaw: "1",
      domainRaw: "合成分野",
      domainId,
      score,
      maxScore: 10,
      nationalAverage: 5,
      schoolAverage: 5,
      sameAbilityAverage: 5,
      sameAbilityDifference: score - 5,
      scoreRateDifference: score / 10 - .5,
      evaluationCodeRaw: null,
      nextLevelAverage: 6,
      nextLevelDifference: score - 6,
      commentaryRaw: null,
      missingReason: null,
    }],
  };
}

function dataset() {
  const current = makeSyntheticDataset({ reportCount: 6, subjectsPerReport: 1 });
  const baselineReports = current.reports.map((report, index) => ({
    ...report,
    reportId: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    examEventId: "kawai.ct.2026.round-1",
    schemaVersionId: "kawai.ct.2026.round-1.v1",
  }));
  const subjectDefinitionId = current.subjectScores[0].subjectDefinitionId;
  const baselineBindings = baselineReports.map((report, index) => ({ reportId: report.reportId, subjectDefinitionId, payload: payload(3 + index / 10) }));
  const currentBindings = current.reports.map((report, index) => ({ reportId: report.reportId, subjectDefinitionId, payload: payload(4 + index / 10, index === 5 ? null : "domain.synthetic.1") }));
  return { reports: [...baselineReports, ...current.reports], payloadBindings: [...baselineBindings, ...currentBindings] };
}

function query(overrides = {}) {
  return {
    resultVersion: ANALYTICS_RESULT_VERSION,
    actorRole: "ADMIN",
    filter: { subjectDefinitionIds: ["subject.synthetic.01"] },
    comparison: { baseline: { examEventIds: ["kawai.ct.2026.round-1"] }, comparison: { examEventIds: ["kawai.ct.2026.round-2"] } },
    groupBy: ["overall"],
    metricIds: ["comparable_person_count", "excluded_rate", "domain_change_from_previous_event", "change_distribution", "change_by_baseline_band"],
    suppressionThreshold: 3,
    ...overrides,
  };
}

test("domain comparison uses confirmed people and normalized domain IDs only", () => {
  const result = executeDomainComparisonAnalytics(query(), dataset(), "2026-09-28T14:00:00Z");
  assert.equal(validateAnalyticsResult(result).ok, true);
  const group = result.groups[0];
  assert.equal(group.group.sampleCount, 5);
  assert.equal(group.group.excludedCount, 1);
  assert.ok(Math.abs((group.metrics.find((metric) => metric.metricId === "domain_change_from_previous_event")?.value ?? 0) - 10) < 1e-10);
  assert.equal(group.metrics.find((metric) => metric.metricId === "comparable_person_count")?.value, 5);
  assert.match(result.warnings.join(" "), /lacked normalized domainId/);
  assert.match(result.warnings.join(" "), /different schema versions/);
});

test("domain comparison groups by normalized domain and supports an explicit domain filter", () => {
  const result = executeDomainComparisonAnalytics(query({ filter: { subjectDefinitionIds: ["subject.synthetic.01"], domainIds: ["domain.synthetic.1"] }, groupBy: ["domain"] }), dataset(), "2026-09-28T14:00:00Z");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].group.dimensions.domain, "domain.synthetic.1");
  assert.equal(result.groups[0].group.sampleCount, 5);
});

test("domain comparison suppresses small groups and rejects duplicates or mixed domains", () => {
  const small = executeDomainComparisonAnalytics(query({ suppressionThreshold: 6 }), dataset(), "2026-09-28T14:00:00Z");
  assert.ok(small.groups[0].metrics.every((metric) => metric.suppressed && metric.points.length === 0));

  const duplicate = dataset();
  const duplicatedBinding = { ...duplicate.payloadBindings[6], payload: { ...duplicate.payloadBindings[6].payload, items: [...duplicate.payloadBindings[6].payload.items, duplicate.payloadBindings[6].payload.items[0]] } };
  const duplicateBindings = duplicate.payloadBindings.map((binding, index) => index === 6 ? duplicatedBinding : binding);
  assert.throws(
    () => executeDomainComparisonAnalytics(query(), { reports: duplicate.reports, payloadBindings: duplicateBindings }, "2026-09-28T14:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "DUPLICATE_COMPARISON_KEY"),
  );

  const mixed = dataset();
  const mixedBindings = mixed.payloadBindings.map((binding, index) => index === 7 ? { ...binding, payload: payload(4.1, "domain.synthetic.2") } : binding);
  assert.throws(
    () => executeDomainComparisonAnalytics(query(), { reports: mixed.reports, payloadBindings: mixedBindings }, "2026-09-28T14:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.some((issue) => issue.code === "UNSUPPORTED_GROUPING"),
  );
});

test("domain comparison rejects filters it cannot interpret on either event", () => {
  const invalid = query({
    comparison: {
      baseline: { examEventIds: ["kawai.ct.2026.round-1"], metricDefinitionIds: ["metric.synthetic"] },
      comparison: { examEventIds: ["kawai.ct.2026.round-2"], targetUniversityIds: ["university.synthetic"] },
    },
  });
  assert.throws(
    () => executeDomainComparisonAnalytics(invalid, dataset(), "2026-09-28T14:00:00Z"),
    (error) => error instanceof AnalyticsExecutionError && error.issues.filter((issue) => issue.code === "UNSUPPORTED_FILTER").length === 2,
  );
});
