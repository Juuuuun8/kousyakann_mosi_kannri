function scalar(metricId, value, unit, denominator) {
  return { metricId, displayType: "scalar", value, unit, denominator, quantiles: null, points: [], suppressed: false, suppressionReason: null };
}

function subjectGroup(subjectDefinitionId, sampleCount, mean, median, p25, p75, nationalGap, standardDeviation, missingCount) {
  return {
    group: { groupKey: `subject=${subjectDefinitionId}`, dimensions: { subject: subjectDefinitionId }, subjectDefinitionId, sampleCount, excludedCount: missingCount, missingCounts: missingCount ? [{ reason: "NOT_TAKEN", count: missingCount }] : [] },
    metrics: [
      scalar("score_rate_mean", mean, "rate", sampleCount - missingCount),
      { metricId: "score_rate_distribution", displayType: "distribution", value: null, unit: "rate", denominator: sampleCount - missingCount, quantiles: { minimum: p25 - .2, p25, median, p75, maximum: Math.min(1, p75 + .2) }, points: [], suppressed: false, suppressionReason: null },
      scalar("national_gap_mean", nationalGap, "score", sampleCount - missingCount),
      scalar("score_standard_deviation", standardDeviation, "score", sampleCount - missingCount),
    ],
  };
}

export const syntheticSubjectResult = {
  resultVersion: "analytics-result.v1",
  generatedAt: "2026-09-28T00:00:00Z",
  query: { resultVersion: "analytics-result.v1", actorRole: "ADMIN", filter: { examEventIds: ["exam.synthetic.2026.round-2"], metricDefinitionIds: ["metric.synthetic.summary"] }, groupBy: ["subject"], metricIds: ["score_rate_mean", "score_rate_distribution", "national_gap_mean", "score_standard_deviation"], suppressionThreshold: 5 },
  groups: [
    subjectGroup("subject.synthetic.english", 120, .713, .73, .61, .81, 2.8, 14.1, 3),
    subjectGroup("subject.synthetic.math", 116, .589, .604, .45, .72, -3.4, 19.6, 7),
    subjectGroup("subject.synthetic.japanese", 111, .627, .642, .50, .74, -.8, 16.2, 5),
  ],
  warnings: [],
};

export const syntheticTargetResult = {
  resultVersion: "analytics-result.v1",
  generatedAt: "2026-09-28T00:00:00Z",
  query: { resultVersion: "analytics-result.v1", actorRole: "ADMIN", filter: { examEventIds: ["exam.synthetic.2026.round-2"], targetPreferenceOrders: [1] }, groupBy: ["overall"], metricIds: ["target_judgement_distribution", "target_border_gap", "target_border_gap_distribution"], suppressionThreshold: 5 },
  groups: [{
    group: { groupKey: "overall=overall", dimensions: {}, subjectDefinitionId: null, sampleCount: 106, excludedCount: 0, missingCounts: [] },
    metrics: [
      { metricId: "target_judgement_distribution", displayType: "breakdown", value: null, unit: "count", denominator: 106, quantiles: null, points: [
        { key: "judgement.A", seriesKey: null, value: 22, denominator: 106, sampleCount: 22, missingCount: 0 },
        { key: "judgement.B", seriesKey: null, value: 31, denominator: 106, sampleCount: 31, missingCount: 0 },
        { key: "judgement.C", seriesKey: null, value: 29, denominator: 106, sampleCount: 29, missingCount: 0 },
        { key: "judgement.D/E", seriesKey: null, value: 24, denominator: 106, sampleCount: 24, missingCount: 0 },
      ], suppressed: false, suppressionReason: null },
      scalar("target_border_gap", -4, "score", 106),
      { metricId: "target_border_gap_distribution", displayType: "distribution", value: null, unit: "score", denominator: 106, quantiles: { minimum: -54, p25: -18, median: -4, p75: 11, maximum: 43 }, points: [], suppressed: false, suppressionReason: null },
    ],
  }],
  warnings: [],
};

export const syntheticComparisonResult = {
  resultVersion: "analytics-result.v1",
  generatedAt: "2026-09-28T00:00:00Z",
  query: { resultVersion: "analytics-result.v1", actorRole: "ADMIN", filter: { subjectDefinitionIds: ["subject.synthetic.math"], metricDefinitionIds: ["metric.synthetic.summary"] }, comparison: { baseline: { examEventIds: ["exam.synthetic.2026.round-1"] }, comparison: { examEventIds: ["exam.synthetic.2026.round-2"] }, label: "第1回→第2回" }, groupBy: ["overall"], metricIds: ["comparable_person_count", "excluded_rate", "change_from_previous_event", "change_distribution", "change_by_baseline_band", "national_gap_rate_change_mean", "deviation_change_mean"], suppressionThreshold: 5 },
  groups: [{
    group: { groupKey: "overall=overall", dimensions: {}, subjectDefinitionId: null, sampleCount: 98, excludedCount: 12, missingCounts: [] },
    metrics: [
      scalar("comparable_person_count", 98, "count", 110),
      scalar("excluded_rate", 12 / 110, "rate", 110),
      scalar("change_from_previous_event", 3.1, "percentage_point", 98),
      { metricId: "change_distribution", displayType: "distribution", value: null, unit: "percentage_point", denominator: 98, quantiles: { minimum: -31, p25: -2.4, median: 2.8, p75: 8.3, maximum: 35 }, points: [], suppressed: false, suppressionReason: null },
      { metricId: "change_by_baseline_band", displayType: "breakdown", value: null, unit: "percentage_point", denominator: 98, quantiles: null, points: [
        { key: "baseline.lt25", seriesKey: null, value: 6.2, denominator: 12, sampleCount: 12, missingCount: 0 },
        { key: "baseline.25-50", seriesKey: null, value: 4.6, denominator: 31, sampleCount: 31, missingCount: 0 },
        { key: "baseline.50-75", seriesKey: null, value: 2.1, denominator: 39, sampleCount: 39, missingCount: 0 },
        { key: "baseline.gte75", seriesKey: null, value: -1.1, denominator: 16, sampleCount: 16, missingCount: 0 },
      ], suppressed: false, suppressionReason: null },
      scalar("national_gap_rate_change_mean", 1.8, "percentage_point", 98),
      scalar("deviation_change_mean", 1.4, "deviation", 95),
    ],
  }],
  warnings: ["baseline and comparison use different schema versions; normalized subject and metric definitions were required"],
};

export const syntheticDomainResult = {
  resultVersion: "analytics-result.v1",
  generatedAt: "2026-09-28T00:00:00Z",
  query: { resultVersion: "analytics-result.v1", actorRole: "ADMIN", filter: { examEventIds: ["exam.synthetic.2026.round-2"], subjectDefinitionIds: ["subject.synthetic.math"] }, groupBy: ["domain"], metricIds: ["domain_score_rate_mean", "same_ability_gap_mean"], suppressionThreshold: 5 },
  groups: [
    { group: { groupKey: "domain=domain.synthetic.probability", dimensions: { domain: "domain.synthetic.probability" }, subjectDefinitionId: null, sampleCount: 102, excludedCount: 3, missingCounts: [{ reason: "NOT_PRINTED", count: 3 }] }, metrics: [scalar("domain_score_rate_mean", .57, "rate", 99), scalar("same_ability_gap_mean", -1.8, "score", 97)] },
    { group: { groupKey: "domain=domain.synthetic.vectors", dimensions: { domain: "domain.synthetic.vectors" }, subjectDefinitionId: null, sampleCount: 101, excludedCount: 1, missingCounts: [{ reason: "BLANK_ON_REPORT", count: 1 }] }, metrics: [scalar("domain_score_rate_mean", .66, "rate", 100), scalar("same_ability_gap_mean", 2.1, "score", 98)] },
    { group: { groupKey: "domain=domain.synthetic.calculus", dimensions: { domain: "domain.synthetic.calculus" }, subjectDefinitionId: null, sampleCount: 100, excludedCount: 0, missingCounts: [] }, metrics: [scalar("domain_score_rate_mean", .49, "rate", 100), scalar("same_ability_gap_mean", -3.4, "score", 96)] },
  ],
  warnings: [],
};

export const syntheticAnswerResult = {
  resultVersion: "analytics-result.v1",
  generatedAt: "2026-09-28T00:00:00Z",
  query: { resultVersion: "analytics-result.v1", actorRole: "ADMIN", filter: { examEventIds: ["exam.synthetic.2026.round-2"], subjectDefinitionIds: ["subject.synthetic.math"] }, groupBy: ["overall"], metricIds: ["item_correct_rate", "item_wrong_rate", "item_partial_rate", "item_no_answer_rate", "item_extra_mark_rate"], suppressionThreshold: 5 },
  groups: [{ group: { groupKey: "overall=overall", dimensions: {}, subjectDefinitionId: null, sampleCount: 101, excludedCount: 0, missingCounts: [] }, metrics: [
    scalar("item_correct_rate", .42, "rate", 4040),
    scalar("item_wrong_rate", .43, "rate", 4040),
    scalar("item_partial_rate", .09, "rate", 4040),
    scalar("item_no_answer_rate", .05, "rate", 4040),
    scalar("item_extra_mark_rate", .01, "rate", 4040),
  ] }],
  warnings: [],
};
