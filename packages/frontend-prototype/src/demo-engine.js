const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 1) => value === null || Number.isNaN(value) ? null : Number(value.toFixed(digits));

function quantile(values, position) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(values) {
  return { count: values.length, mean: round(mean(values)), minimum: round(values.length ? Math.min(...values) : null), p25: round(quantile(values, .25)), median: round(quantile(values, .5)), p75: round(quantile(values, .75)), maximum: round(values.length ? Math.max(...values) : null) };
}

function selectedEvents(data, filters) {
  const ids = filters.eventIds?.length ? new Set(filters.eventIds) : new Set(data.examEvents.map((item) => item.id));
  return data.examEvents.filter((event) => ids.has(event.id) && (filters.definitionId === "all" || event.definitionId === filters.definitionId));
}

function cohort(data, filters) {
  return data.students.filter((student) =>
    (filters.locationId === "all" || student.locationId === filters.locationId) &&
    (filters.schoolId === "all" || student.schoolId === filters.schoolId) &&
    (filters.grade === "all" || student.grade === filters.grade));
}

function studentRate(rows) {
  const valid = rows.filter((row) => row.score !== null && row.maxScore > 0 && !["modern-japanese", "classical-japanese", "kanbun"].includes(row.subjectId));
  const total = valid.reduce((sum, row) => sum + row.score, 0);
  const max = valid.reduce((sum, row) => sum + row.maxScore, 0);
  return max ? total / max * 100 : null;
}

function getRows(data, people, events, subjectId = "all") {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  return data.scores.filter((row) => personIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
}

function eventSummary(data, people, events, subjectId) {
  return events.map((event) => {
    const rows = getRows(data, people, [event], subjectId);
    const byPerson = people.map((person) => {
      const personRows = rows.filter((row) => row.personId === person.personId);
      if (subjectId !== "all") return personRows.find((row) => row.scoreRate !== null)?.scoreRate ?? null;
      return studentRate(personRows);
    }).filter((value) => value !== null);
    const deviations = rows.filter((row) => row.deviation !== null).map((row) => row.deviation);
    return { ...event, participants: byPerson.length, rate: summarize(byPerson), deviation: summarize(deviations) };
  });
}

function subjectSummary(data, people, events) {
  return data.subjectDefinitions.map((subject) => {
    const rows = getRows(data, people, events, subject.id);
    const valid = rows.filter((row) => row.scoreRate !== null);
    const recentEvent = [...events].reverse().find((event) => valid.some((row) => row.eventId === event.id));
    const recent = valid.filter((row) => row.eventId === recentEvent?.id);
    return {
      ...subject,
      sampleCount: recent.length,
      rate: summarize(recent.map((row) => row.scoreRate)),
      deviation: summarize(recent.map((row) => row.deviation).filter((value) => value !== null)),
      nationalGap: round(mean(recent.map((row) => row.scoreRate - row.nationalAverageRate))),
      trend: events.map((event) => ({ eventId: event.id, value: round(mean(valid.filter((row) => row.eventId === event.id).map((row) => row.scoreRate))), count: valid.filter((row) => row.eventId === event.id).length })),
    };
  }).filter((row) => row.sampleCount > 0);
}

function comparisonSummary(data, people, events, subjectId) {
  const comparableEvents = events.filter((event) => event.definitionId === "kawai.ct").slice(-2);
  if (comparableEvents.length < 2) return { events: comparableEvents, comparableCount: 0, excludedCount: people.length, change: summarize([]), improved: 0, unchanged: 0, declined: 0 };
  const [before, after] = comparableEvents;
  const changes = [];
  for (const person of people) {
    const beforeRows = getRows(data, [person], [before], subjectId);
    const afterRows = getRows(data, [person], [after], subjectId);
    const beforeValue = subjectId === "all" ? studentRate(beforeRows) : beforeRows.find((row) => row.scoreRate !== null)?.scoreRate ?? null;
    const afterValue = subjectId === "all" ? studentRate(afterRows) : afterRows.find((row) => row.scoreRate !== null)?.scoreRate ?? null;
    if (beforeValue !== null && afterValue !== null) changes.push(afterValue - beforeValue);
  }
  return { events: comparableEvents, comparableCount: changes.length, excludedCount: people.length - changes.length, change: summarize(changes), improved: changes.filter((value) => value >= 3).length, unchanged: changes.filter((value) => value > -3 && value < 3).length, declined: changes.filter((value) => value <= -3).length };
}

function groupSummary(data, people, events, subjectId, threshold) {
  const definitions = [
    ...data.locations.map((item) => ({ ...item, kind: "校舎", member: (person) => person.locationId === item.id })),
    ...data.schools.map((item) => ({ ...item, kind: "高校", member: (person) => person.schoolId === item.id })),
  ];
  const latest = events.at(-1);
  return definitions.map((group) => {
    const members = people.filter(group.member);
    const values = members.map((person) => {
      const rows = getRows(data, [person], latest ? [latest] : [], subjectId);
      return subjectId === "all" ? studentRate(rows) : rows.find((row) => row.scoreRate !== null)?.scoreRate ?? null;
    }).filter((value) => value !== null);
    return { kind: group.kind, id: group.id, label: group.label, sampleCount: values.length, rate: summarize(values), suppressed: values.length < threshold };
  }).filter((group) => group.sampleCount > 0);
}

function domainSummary(data, people, events, subjectId) {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const rows = data.domains.filter((row) => personIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
  return data.domainDefinitions.map((definition) => {
    const relevant = rows.filter((row) => row.domainId === definition.id);
    const latestEvent = [...events].reverse().find((event) => relevant.some((row) => row.eventId === event.id));
    const latest = relevant.filter((row) => row.eventId === latestEvent?.id);
    return {
      ...definition,
      sampleCount: latest.length,
      rate: summarize(latest.map((row) => row.scoreRate)),
      nationalGap: round(mean(latest.map((row) => row.scoreRate - row.nationalAverageRate))),
      sameAbilityGap: round(mean(latest.map((row) => row.scoreRate - row.sameAbilityAverageRate))),
      higherJudgementGap: round(mean(latest.map((row) => row.scoreRate - row.higherJudgementAverageRate))),
      trend: events.map((event) => ({ eventId: event.id, value: round(mean(relevant.filter((row) => row.eventId === event.id).map((row) => row.scoreRate))) })),
    };
  }).filter((row) => row.sampleCount > 0);
}

function answerSummary(data, people, events, subjectId) {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const rows = data.answers.filter((row) => personIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
  const results = ["correct", "wrong", "partial", "blank", "extra"];
  const parts = results.map((key) => ({ key, count: rows.filter((row) => row.result === key).length, rate: rows.length ? rows.filter((row) => row.result === key).length / rows.length : 0 }));
  const questions = [...new Set(rows.map((row) => `${row.subjectId}|${row.majorQuestion}`))].map((key) => {
    const [rowSubjectId, majorQuestion] = key.split("|");
    const questionRows = rows.filter((row) => row.subjectId === rowSubjectId && String(row.majorQuestion) === majorQuestion);
    return { subjectId: rowSubjectId, majorQuestion: Number(majorQuestion), count: questionRows.length, correctRate: round(questionRows.filter((row) => row.result === "correct").length / questionRows.length * 100), blankRate: round(questionRows.filter((row) => row.result === "blank").length / questionRows.length * 100), partialRate: round(questionRows.filter((row) => row.result === "partial").length / questionRows.length * 100) };
  }).sort((a, b) => a.correctRate - b.correctRate);
  return { count: rows.length, parts, questions };
}

function targetSummary(data, people, events) {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const rows = data.targets.filter((row) => personIds.has(row.personId) && eventIds.has(row.eventId) && row.preferenceOrder === 1);
  const latestEvent = [...events].reverse().find((event) => rows.some((row) => row.eventId === event.id));
  const latest = rows.filter((row) => row.eventId === latestEvent?.id);
  return {
    sampleCount: latest.length,
    counts: ["A", "B", "C", "D", "E"].map((label) => ({ label, count: latest.filter((row) => row.judgement === label).length })),
    borderGap: summarize(latest.map((row) => row.borderGap)),
    groups: [...new Set(latest.map((row) => row.targetLabel))].map((label) => { const groupRows = latest.filter((row) => row.targetLabel === label); return { label, count: groupRows.length, borderGap: round(mean(groupRows.map((row) => row.borderGap))), aToC: groupRows.filter((row) => ["A", "B", "C"].includes(row.judgement)).length }; }).sort((a, b) => b.count - a.count),
  };
}

function registrationSummary(data, people, events) {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const reports = data.reports.filter((row) => (!row.personId || personIds.has(row.personId)) && eventIds.has(row.eventId));
  const progress = data.expectedByEventLocation.filter((row) => eventIds.has(row.eventId) && (row.locationId === "all" || people.some((person) => person.locationId === row.locationId)));
  return { active: reports.filter((row) => row.status === "ACTIVE").length, pending: reports.filter((row) => row.status === "PENDING").length, superseded: reports.filter((row) => row.status === "SUPERSEDED").length, progress };
}

function individualSummary(data, people, events, requestedPersonId) {
  const person = people.find((item) => item.personId === requestedPersonId) ?? people[0] ?? null;
  if (!person) return null;
  const byEvent = eventSummary(data, [person], events, "all");
  const latest = events.at(-1);
  const subjectRows = getRows(data, [person], latest ? [latest] : [], "all").filter((row) => row.scoreRate !== null);
  const targets = data.targets.filter((row) => row.personId === person.personId && row.eventId === latest?.id);
  return { person, byEvent, subjects: subjectRows.map((row) => ({ ...row, label: data.subjectDefinitions.find((item) => item.id === row.subjectId)?.label ?? row.subjectId })).sort((a, b) => b.scoreRate - a.scoreRate), targets };
}

export function createDemoModel(data, input = {}) {
  const filters = { locationId: "all", schoolId: "all", grade: "all", definitionId: "all", eventIds: [], subjectId: "all", suppressionThreshold: 5, personId: null, ...input };
  const people = cohort(data, filters);
  const events = selectedEvents(data, filters);
  const eventIds = new Set(events.map((item) => item.id));
  const activeRows = getRows(data, people, events, filters.subjectId).filter((row) => row.scoreRate !== null);
  const latest = events.at(-1);
  const latestValues = people.map((person) => { const rows = getRows(data, [person], latest ? [latest] : [], filters.subjectId); return filters.subjectId === "all" ? studentRate(rows) : rows.find((row) => row.scoreRate !== null)?.scoreRate ?? null; }).filter((value) => value !== null);
  return {
    filters, people, events,
    scope: { students: people.length, events: events.length, observations: activeRows.length, latest: latest?.label ?? "対象なし", missing: getRows(data, people, events, filters.subjectId).filter((row) => row.missingReason).length, rate: summarize(latestValues) },
    eventSummary: eventSummary(data, people, events, filters.subjectId), subjects: subjectSummary(data, people, events), comparison: comparisonSummary(data, people, events, filters.subjectId), groups: groupSummary(data, people, events, filters.subjectId, filters.suppressionThreshold), domains: domainSummary(data, people, events, filters.subjectId), answers: answerSummary(data, people, events, filters.subjectId), targets: targetSummary(data, people, events), registration: registrationSummary(data, people, events), individual: individualSummary(data, people, events, filters.personId), suppressed: people.length > 0 && people.length < filters.suppressionThreshold,
    dataQuality: { schemaVersions: [...new Set(data.reports.filter((row) => eventIds.has(row.eventId)).map((row) => row.schemaVersion))], sourceCapabilities: data.sourceCapabilities },
  };
}

export function createMlDemoRows(data, model) {
  const people = new Map(model.people.map((item, index) => [item.personId, `demo_ml_${String(index + 1).padStart(3, "0")}`]));
  const personDetails = new Map(model.people.map((item) => [item.personId, item]));
  const eventIds = new Set(model.events.map((item) => item.id));
  return data.scores.filter((row) => people.has(row.personId) && eventIds.has(row.eventId) && (model.filters.subjectId === "all" || row.subjectId === model.filters.subjectId)).map((row) => ({ ExportSchemaVersion: "ml-export.v2-demo", ML_ID: people.get(row.personId), ExamEventID: row.eventId, LocationID: personDetails.get(row.personId).locationId, SchoolID: personDetails.get(row.personId).schoolId, SubjectDefinitionID: row.subjectId, Score: row.score, MaxScore: row.maxScore, ScoreRate: row.scoreRate, Deviation: row.deviation, AbilityLevel: row.abilityLevel, MissingReason: row.missingReason }));
}
