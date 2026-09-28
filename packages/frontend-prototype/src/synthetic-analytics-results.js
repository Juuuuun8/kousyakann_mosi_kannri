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
