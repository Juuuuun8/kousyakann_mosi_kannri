const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 1) => value === null ? null : Number(value.toFixed(digits));

function quantile(values, position) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(values) {
  return {
    count: values.length,
    mean: round(mean(values)),
    minimum: round(values.length ? Math.min(...values) : null),
    p25: round(quantile(values, .25)),
    median: round(quantile(values, .5)),
    p75: round(quantile(values, .75)),
    maximum: round(values.length ? Math.max(...values) : null),
  };
}

function indexBy(items, key = "id") { return new Map(items.map((item) => [item[key], item])); }
function averageStudentRate(scores) {
  const valid = scores.filter((item) => item.score !== null && item.maxScore > 0);
  const score = valid.reduce((sum, item) => sum + item.score, 0);
  const maxScore = valid.reduce((sum, item) => sum + item.maxScore, 0);
  return maxScore ? score / maxScore * 100 : null;
}

function cohort(data, filters) {
  return data.students.filter((student) =>
    (filters.locationId === "all" || student.locationId === filters.locationId) &&
    (filters.schoolId === "all" || student.schoolId === filters.schoolId));
}

function scoreRows(data, students, eventId, subjectId) {
  const people = new Set(students.map((item) => item.personId));
  return data.scores.filter((item) => people.has(item.personId) && item.eventId === eventId && (subjectId === "all" || item.subjectId === subjectId));
}

function studentRates(data, students, eventId, subjectId) {
  const rows = scoreRows(data, students, eventId, subjectId);
  return students.map((student) => ({ personId: student.personId, value: averageStudentRate(rows.filter((item) => item.personId === student.personId)) })).filter((item) => item.value !== null);
}

function histogram(values) {
  const bins = Array.from({ length: 10 }, (_, index) => ({ start: index * 10, count: 0 }));
  for (const value of values) bins[Math.min(9, Math.max(0, Math.floor(value / 10)))].count += 1;
  return bins;
}

function comparison(data, students, subjectId) {
  const current = new Map(studentRates(data, students, data.meta.activeEventId, subjectId).map((item) => [item.personId, item.value]));
  const baseline = new Map(studentRates(data, students, data.meta.baselineEventId, subjectId).map((item) => [item.personId, item.value]));
  const changes = [];
  const bands = [
    { id: "lt50", label: "前回50%未満", min: -Infinity, max: 50, values: [] },
    { id: "50-65", label: "前回50–65%", min: 50, max: 65, values: [] },
    { id: "65-80", label: "前回65–80%", min: 65, max: 80, values: [] },
    { id: "gte80", label: "前回80%以上", min: 80, max: Infinity, values: [] },
  ];
  for (const student of students) {
    const before = baseline.get(student.personId);
    const after = current.get(student.personId);
    if (before === undefined || after === undefined) continue;
    const change = after - before;
    changes.push(change);
    bands.find((band) => before >= band.min && before < band.max).values.push(change);
  }
  return {
    comparableCount: changes.length,
    excludedCount: students.length - changes.length,
    summary: summarize(changes),
    bands: bands.map((band) => ({ id: band.id, label: band.label, count: band.values.length, mean: round(mean(band.values)) })),
  };
}

function subjectSummary(data, students) {
  const subjectMap = indexBy(data.subjectDefinitions);
  const rows = scoreRows(data, students, data.meta.activeEventId, "all");
  return data.subjectDefinitions.map((subject) => {
    const subjectRows = rows.filter((item) => item.subjectId === subject.id);
    const valid = subjectRows.filter((item) => item.scoreRate !== null);
    const rates = valid.map((item) => item.scoreRate * 100);
    return {
      id: subject.id,
      label: subjectMap.get(subject.id).label,
      sampleCount: valid.length,
      excludedCount: subjectRows.length - valid.length,
      rate: summarize(rates),
      nationalGap: round(mean(valid.map((item) => item.scoreRate * 100 - item.nationalAverage))),
      deviation: round(mean(valid.map((item) => item.deviation))),
    };
  });
}

function groupSummary(data, students, filters) {
  const locations = indexBy(data.locations);
  const schools = indexBy(data.schools);
  const groups = [
    ...data.locations.map((item) => ({ kind: "校舎", id: item.id, label: item.label, students: students.filter((student) => student.locationId === item.id) })),
    ...data.schools.map((item) => ({ kind: "高校", id: item.id, label: item.label, students: students.filter((student) => student.schoolId === item.id) })),
  ].filter((item) => item.students.length);
  return groups.map((group) => {
    const rates = studentRates(data, group.students, data.meta.activeEventId, filters.subjectId).map((item) => item.value);
    return { kind: group.kind, id: group.id, label: group.label, sampleCount: rates.length, rate: summarize(rates), suppressed: rates.length < filters.suppressionThreshold };
  });
}

function domainSummary(data, students, filters) {
  const people = new Set(students.map((item) => item.personId));
  const definitions = indexBy(data.domainDefinitions);
  const current = data.domains.filter((item) => people.has(item.personId) && item.eventId === data.meta.activeEventId && (filters.subjectId === "all" || filters.subjectId === item.subjectId));
  const baseline = data.domains.filter((item) => people.has(item.personId) && item.eventId === data.meta.baselineEventId && (filters.subjectId === "all" || filters.subjectId === item.subjectId));
  const baselineMap = new Map(baseline.map((item) => [`${item.personId}|${item.domainId}`, item.scoreRate]));
  return data.domainDefinitions.map((definition) => {
    const rows = current.filter((item) => item.domainId === definition.id && item.scoreRate !== null);
    const rates = rows.map((item) => item.scoreRate * 100);
    const changes = rows.map((item) => {
      const before = baselineMap.get(`${item.personId}|${item.domainId}`);
      return before === undefined ? null : (item.scoreRate - before) * 100;
    }).filter((value) => value !== null);
    return { id: definition.id, label: definitions.get(definition.id).label, sampleCount: rows.length, rate: summarize(rates), nationalGap: round(mean(rows.map((item) => (item.scoreRate - item.nationalAverageRate) * 100))), sameAbilityGap: round(mean(rows.map((item) => (item.scoreRate - item.sameAbilityAverageRate) * 100))), previousChange: round(mean(changes)), comparableCount: changes.length };
  });
}

function targetSummary(data, students) {
  const people = new Set(students.map((item) => item.personId));
  const rows = data.targets.filter((item) => people.has(item.personId));
  const counts = new Map(["A", "B", "C", "D", "E"].map((key) => [key, 0]));
  rows.forEach((item) => counts.set(item.judgement, counts.get(item.judgement) + 1));
  return { sampleCount: rows.length, counts: [...counts].map(([label, count]) => ({ label, count })), borderGap: summarize(rows.map((item) => item.borderGap)), targetGroups: [...new Set(rows.map((item) => item.targetLabel))].map((label) => ({ label, count: rows.filter((item) => item.targetLabel === label).length })) };
}

function answerSummary(data, students) {
  const people = new Set(students.map((item) => item.personId));
  const rows = data.answers.filter((item) => people.has(item.personId));
  const keys = ["correct", "wrong", "partial", "blank", "extra"];
  const total = rows.reduce((sum, row) => sum + keys.reduce((inner, key) => inner + row[key], 0), 0);
  return { sampleCount: rows.length, parts: keys.map((key) => ({ key, count: rows.reduce((sum, row) => sum + row[key], 0), rate: total ? rows.reduce((sum, row) => sum + row[key], 0) / total : 0 })) };
}

function individualSummary(data, students, subjectId, requestedPersonId) {
  const person = students.find((item) => item.personId === requestedPersonId) ?? students[0] ?? null;
  if (!person) return null;
  const subjects = indexBy(data.subjectDefinitions);
  const byEvent = data.examEvents.map((event) => {
    const rows = scoreRows(data, [person], event.id, subjectId);
    return { eventId: event.id, label: event.label, rate: round(averageStudentRate(rows)), deviation: round(mean(rows.filter((item) => item.deviation !== null).map((item) => item.deviation))) };
  });
  const currentRows = scoreRows(data, [person], data.meta.activeEventId, "all").filter((item) => item.scoreRate !== null);
  return { person, byEvent, subjects: currentRows.map((item) => ({ id: item.subjectId, label: subjects.get(item.subjectId).shortLabel, rate: round(item.scoreRate * 100), deviation: item.deviation, abilityLevel: item.abilityLevel })) };
}

export function createDemoModel(data, filters = {}) {
  const normalized = {
    locationId: filters.locationId ?? "all",
    schoolId: filters.schoolId ?? "all",
    subjectId: filters.subjectId ?? "all",
    suppressionThreshold: Number(filters.suppressionThreshold ?? 5),
    personId: filters.personId ?? null,
  };
  const students = cohort(data, normalized);
  const rates = studentRates(data, students, data.meta.activeEventId, normalized.subjectId).map((item) => item.value);
  const activeRows = scoreRows(data, students, data.meta.activeEventId, normalized.subjectId);
  return {
    filters: normalized,
    students,
    suppressed: students.length > 0 && students.length < normalized.suppressionThreshold,
    overview: { students: students.length, observations: activeRows.length, missingCount: activeRows.filter((item) => item.missingReason).length, rate: summarize(rates), histogram: histogram(rates) },
    comparison: comparison(data, students, normalized.subjectId),
    subjects: subjectSummary(data, students),
    groups: groupSummary(data, students, normalized),
    domains: domainSummary(data, students, normalized),
    targets: targetSummary(data, students),
    answers: answerSummary(data, students),
    individual: individualSummary(data, students, normalized.subjectId, normalized.personId),
    quality: { active: data.reports.filter((item) => item.status === "ACTIVE").length, pending: data.reports.filter((item) => item.status === "PENDING").length, superseded: data.reports.filter((item) => item.status === "SUPERSEDED").length },
  };
}

export function createMlDemoRows(data, model) {
  const people = new Map(model.students.map((item, index) => [item.personId, `demo_ml_${String(index + 1).padStart(3, "0")}`]));
  return data.scores.filter((item) => people.has(item.personId) && item.eventId === data.meta.activeEventId && (model.filters.subjectId === "all" || item.subjectId === model.filters.subjectId)).map((item) => ({
    ExportSchemaVersion: "ml-export.v1-demo",
    ML_ID: people.get(item.personId),
    ExamEventID: item.eventId,
    LocationID: item.locationId,
    SubjectDefinitionID: item.subjectId,
    Score: item.score,
    MaxScore: item.maxScore,
    ScoreRate: item.scoreRate,
    Deviation: item.deviation,
    AbilityLevel: item.abilityLevel,
    MissingReason: item.missingReason,
  }));
}
