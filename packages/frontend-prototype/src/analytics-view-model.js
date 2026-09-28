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
