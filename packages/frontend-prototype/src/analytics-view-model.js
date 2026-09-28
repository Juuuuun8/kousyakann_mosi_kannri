const subjectLabels = {
  "subject.synthetic.english": "英語",
  "subject.synthetic.math": "数学",
  "subject.synthetic.japanese": "国語",
};

function metric(group, metricId) {
  return group.metrics.find((candidate) => candidate.metricId === metricId) ?? null;
}

function percentage(value, digits = 1) {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function decimal(value, suffix = "", digits = 1) {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function display(metricValue, format) {
  if (!metricValue) return "—";
  if (metricValue.suppressed) return `抑制（n=${metricValue.denominator ?? 0}）`;
  return format(metricValue.value);
}

function metricSuffix(metricValue) {
  return metricValue?.unit === "deviation" ? "（偏差値）" : metricValue?.unit === "score" ? "点" : "";
}

export function subjectTableModel(result) {
  return result.groups.map((group) => {
    const distribution = metric(group, "score_rate_distribution");
    const mean = metric(group, "score_rate_mean");
    const nationalGap = metric(group, "national_gap_mean");
    const standardDeviation = metric(group, "score_standard_deviation");
    return {
      subject: subjectLabels[group.group.subjectDefinitionId] ?? "未登録科目",
      sampleCount: group.group.sampleCount,
      mean: display(mean, (value) => percentage(value)),
      median: distribution?.suppressed ? "抑制" : percentage(distribution?.quantiles?.median ?? null),
      interquartileRange: distribution?.suppressed ? "抑制" : `${percentage(distribution?.quantiles?.p25 ?? null)}–${percentage(distribution?.quantiles?.p75 ?? null)}`,
      nationalGap: display(nationalGap, (value) => decimal(value, "点")),
      standardDeviation: display(standardDeviation, (value) => value.toFixed(1)),
      missingCount: group.group.missingCounts.reduce((sum, item) => sum + item.count, 0),
      suppressed: group.metrics.some((item) => item.suppressed && item.suppressionReason === "SMALL_GROUP"),
    };
  });
}

export function targetSummaryModel(result) {
  const group = result.groups[0];
  if (!group) return { sampleCount: 0, judgements: [], borderGap: "—", quartiles: "—", suppressed: false };
  const judgements = metric(group, "target_judgement_distribution");
  const borderGap = metric(group, "target_border_gap");
  const distribution = metric(group, "target_border_gap_distribution");
  return {
    sampleCount: group.group.sampleCount,
    judgements: judgements?.suppressed ? [] : judgements?.points.map((point) => ({ label: point.key.replace("judgement.", ""), count: point.value ?? 0, denominator: point.denominator ?? 0 })) ?? [],
    borderGap: display(borderGap, (value) => decimal(value, metricSuffix(borderGap))),
    quartiles: distribution?.suppressed ? "抑制" : `${decimal(distribution?.quantiles?.p25 ?? null, metricSuffix(distribution))}〜${decimal(distribution?.quantiles?.p75 ?? null, metricSuffix(distribution))}`,
    suppressed: group.metrics.some((item) => item.suppressed),
  };
}

export function comparisonSummaryModel(result) {
  const group = result.groups[0];
  if (!group) return { comparableCount: 0, excludedCount: 0, scoreRateChange: "—", nationalGapChange: "—", deviationChange: "—", changeQuartiles: "—", baselineBands: [], suppressed: true };
  const comparable = metric(group, "comparable_person_count");
  const scoreRateChange = metric(group, "change_from_previous_event");
  const nationalGapChange = metric(group, "national_gap_rate_change_mean");
  const deviationChange = metric(group, "deviation_change_mean");
  const distribution = metric(group, "change_distribution");
  const byBand = metric(group, "change_by_baseline_band");
  return {
    comparableCount: comparable?.suppressed ? group.group.sampleCount : comparable?.value ?? group.group.sampleCount,
    excludedCount: group.group.excludedCount,
    scoreRateChange: display(scoreRateChange, (value) => decimal(value, "pt")),
    nationalGapChange: display(nationalGapChange, (value) => decimal(value, "pt")),
    deviationChange: display(deviationChange, (value) => decimal(value)),
    changeQuartiles: distribution?.suppressed ? "抑制" : `${decimal(distribution?.quantiles?.p25 ?? null, "pt")}〜${decimal(distribution?.quantiles?.p75 ?? null, "pt")}`,
    baselineBands: byBand?.suppressed ? [] : byBand?.points.map((point) => ({
      key: point.key,
      sampleCount: point.sampleCount,
      value: point.value === null ? "抑制" : decimal(point.value, "pt"),
    })) ?? [],
    suppressed: group.metrics.some((item) => item.suppressed),
  };
}

export function domainTableModel(result, labels = {}) {
  return result.groups.map((group) => {
    const id = group.group.dimensions.domain ?? "domain.unknown";
    const rate = metric(group, "domain_score_rate_mean");
    const abilityGap = metric(group, "same_ability_gap_mean");
    return {
      id,
      label: labels[id] ?? id,
      sampleCount: group.group.sampleCount,
      scoreRate: display(rate, (value) => percentage(value)),
      sameAbilityGap: display(abilityGap, (value) => decimal(value, "点")),
      missingCount: group.group.missingCounts.reduce((sum, item) => sum + item.count, 0),
      suppressed: group.metrics.some((item) => item.suppressed),
    };
  });
}

export function domainTrendModel(result) {
  return result.groups.map((group) => {
    const change = metric(group, "domain_change_from_previous_event");
    return {
      id: group.group.dimensions.domain ?? "domain.unknown",
      comparableCount: group.group.sampleCount,
      excludedCount: group.group.excludedCount,
      change: display(change, (value) => decimal(value, "pt")),
      suppressed: Boolean(change?.suppressed),
    };
  });
}

export function answerCompositionModel(result) {
  const group = result.groups[0];
  if (!group) return { sampleCount: 0, parts: [], suppressed: true };
  const definitions = [
    ["item_correct_rate", "正答", "correct"],
    ["item_wrong_rate", "誤答", "wrong"],
    ["item_partial_rate", "部分点", "partial"],
    ["item_no_answer_rate", "無回答", "blank"],
    ["item_extra_mark_rate", "余分マーク", "extra"],
  ];
  const parts = definitions.map(([metricId, label, className]) => {
    const value = metric(group, metricId);
    return { label, className, rate: value?.suppressed || value?.value === null || value?.value === undefined ? null : value.value, denominator: value?.denominator ?? 0 };
  });
  return { sampleCount: group.group.sampleCount, parts, suppressed: group.metrics.some((item) => item.suppressed) };
}
