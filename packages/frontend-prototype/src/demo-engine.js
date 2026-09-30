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
  const valid = values.filter((value) => value !== null && Number.isFinite(value));
  return { count: valid.length, mean: round(mean(valid)), minimum: round(valid.length ? Math.min(...valid) : null), p25: round(quantile(valid, .25)), median: round(quantile(valid, .5)), p75: round(quantile(valid, .75)), maximum: round(valid.length ? Math.max(...valid) : null) };
}

function selectedEvents(data, filters) {
  const ids = filters.eventIds?.length ? new Set(filters.eventIds) : new Set(data.examEvents.map((item) => item.id));
  return data.examEvents.filter((event) => ids.has(event.id) && (filters.definitionId === "all" || event.definitionId === filters.definitionId));
}

function cohort(data, filters) {
  const locationIds = filters.locationIds?.length ? new Set(filters.locationIds) : new Set(data.locations.map((item) => item.id));
  return data.students.filter((student) => locationIds.has(student.locationId) && (filters.schoolId === "all" || student.schoolId === filters.schoolId) && (filters.grade === "all" || student.grade === filters.grade));
}

function studentRate(data, rows) {
  const aggregateIds = new Set(data.subjectDefinitions.filter((item) => item.aggregate).map((item) => item.id));
  const valid = rows.filter((row) => row.score !== null && row.maxScore > 0 && !aggregateIds.has(row.subjectId));
  const total = valid.reduce((sum, row) => sum + row.score, 0);
  const max = valid.reduce((sum, row) => sum + row.maxScore, 0);
  return max ? total / max * 100 : null;
}

function getRows(data, people, events, subjectId = "all") {
  const personIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  return data.scores.filter((row) => personIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
}

function valueForPerson(data, person, event, subjectId) {
  const rows = getRows(data, [person], [event], subjectId);
  return subjectId === "all" ? studentRate(data, rows) : rows.find((row) => row.scoreRate !== null)?.scoreRate ?? null;
}

function eventSummary(data, people, events, subjectId) {
  return events.map((event) => {
    const values = people.map((person) => valueForPerson(data, person, event, subjectId)).filter((value) => value !== null);
    const rows = getRows(data, people, [event], subjectId);
    const deviations = rows.filter((row) => row.deviation !== null && !data.subjectDefinitions.find((item) => item.id === row.subjectId)?.aggregate).map((row) => row.deviation);
    return { ...event, participants: values.length, rate: summarize(values), deviation: summarize(deviations) };
  });
}

function subjectSummary(data, people, events) {
  return data.subjectDefinitions.map((subject) => {
    const rows = getRows(data, people, events, subject.id).filter((row) => row.scoreRate !== null);
    const recentEvent = [...events].reverse().find((event) => rows.some((row) => row.eventId === event.id));
    const recent = rows.filter((row) => row.eventId === recentEvent?.id);
    return { ...subject, sampleCount: recent.length, rate: summarize(recent.map((row) => row.scoreRate)), deviation: summarize(recent.map((row) => row.deviation)), nationalGap: round(mean(recent.map((row) => row.scoreRate - row.nationalAverageRate))), trend: events.map((event) => ({ eventId: event.id, value: round(mean(rows.filter((row) => row.eventId === event.id).map((row) => row.scoreRate))), count: rows.filter((row) => row.eventId === event.id).length })) };
  }).filter((row) => row.sampleCount > 0);
}

function comparisonSummary(data, people, events, subjectId) {
  const comparableEvents = events.filter((event) => event.definitionId === "kawai.ct").slice(-2);
  if (comparableEvents.length < 2) return { events: comparableEvents, comparableCount: 0, excludedCount: people.length, change: summarize([]), improved: 0, unchanged: 0, declined: 0 };
  const changes = [];
  for (const person of people) {
    const before = valueForPerson(data, person, comparableEvents[0], subjectId);
    const after = valueForPerson(data, person, comparableEvents[1], subjectId);
    if (before !== null && after !== null) changes.push(after - before);
  }
  return { events: comparableEvents, comparableCount: changes.length, excludedCount: people.length - changes.length, change: summarize(changes), improved: changes.filter((value) => value >= 3).length, unchanged: changes.filter((value) => value > -3 && value < 3).length, declined: changes.filter((value) => value <= -3).length };
}

function groupSummary(data, people, events, subjectId, threshold) {
  const definitions = [...data.locations.map((item) => ({ ...item, kind: "校舎", member: (person) => person.locationId === item.id })), ...data.schools.map((item) => ({ ...item, kind: "高校", member: (person) => person.schoolId === item.id }))];
  const latest = events.at(-1);
  return definitions.map((group) => {
    const members = people.filter(group.member);
    const values = latest ? members.map((person) => valueForPerson(data, person, latest, subjectId)).filter((value) => value !== null) : [];
    return { id: group.id, label: group.label, kind: group.kind, memberCount: members.length, suppressed: members.length > 0 && members.length < threshold, values: members.length >= threshold ? values : [], ...summarize(values) };
  }).filter((group) => group.memberCount > 0);
}

function domainSummary(data, people, events, subjectId) {
  const peopleIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const rows = data.domains.filter((row) => peopleIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
  return data.domainDefinitions.map((domain) => {
    const matching = rows.filter((row) => row.domainId === domain.id);
    const recentEvent = [...events].reverse().find((event) => matching.some((row) => row.eventId === event.id));
    const recent = matching.filter((row) => row.eventId === recentEvent?.id);
    return { ...domain, sampleCount: recent.length, scoreRate: round(mean(recent.map((row) => row.scoreRate))), nationalGap: round(mean(recent.map((row) => row.scoreRate - row.nationalAverageRate))), sameAbilityGap: round(mean(recent.map((row) => row.scoreRate - row.sameAbilityAverageRate))), nextLevelGap: round(mean(recent.map((row) => row.scoreRate - row.nextLevelAverageRate))), byEvent: events.map((event) => ({ eventId: event.id, value: round(mean(matching.filter((row) => row.eventId === event.id).map((row) => row.scoreRate))) })) };
  }).filter((row) => row.sampleCount > 0);
}

function locationDomainMatrix(data, people, events, subjectId, threshold) {
  const latest = [...events].reverse().find((event) => data.domains.some((row) => row.eventId === event.id));
  if (!latest) return { event: null, locations: [], rows: [] };
  const selectedIds = [...new Set(people.map((person) => person.locationId))];
  const locations = data.locations.filter((item) => selectedIds.includes(item.id));
  const personById = new Map(people.map((person) => [person.personId, person]));
  const source = data.domains.filter((row) => row.eventId === latest.id && personById.has(row.personId) && (subjectId === "all" || row.subjectId === subjectId));
  const rows = data.domainDefinitions.filter((domain) => subjectId === "all" || domain.subjectId === subjectId).map((domain) => {
    const all = source.filter((row) => row.domainId === domain.id);
    const overall = mean(all.map((row) => row.scoreRate));
    const cells = locations.map((location) => {
      const values = all.filter((row) => personById.get(row.personId)?.locationId === location.id).map((row) => row.scoreRate);
      return { locationId: location.id, count: values.length, value: values.length >= threshold ? round(mean(values)) : null, gap: values.length >= threshold && overall !== null ? round(mean(values) - overall) : null, suppressed: values.length > 0 && values.length < threshold };
    });
    return { ...domain, cells };
  }).filter((row) => row.cells.some((cell) => cell.count));
  return { event: latest, locations, rows };
}

function answerSummary(data, people, events, subjectId) {
  const peopleIds = new Set(people.map((item) => item.personId));
  const eventIds = new Set(events.map((item) => item.id));
  const rows = data.answers.filter((row) => peopleIds.has(row.personId) && eventIds.has(row.eventId) && (subjectId === "all" || row.subjectId === subjectId));
  const parts = ["correct", "partial", "wrong", "blank", "extra"].map((key) => ({ key, count: rows.filter((row) => row.result === key).length, rate: rows.length ? rows.filter((row) => row.result === key).length / rows.length : 0 }));
  const questions = data.domainDefinitions.map((domain) => { const matching = rows.filter((row) => row.domainId === domain.id); return { ...domain, count: matching.length, correctRate: matching.length ? matching.filter((row) => row.result === "correct").length / matching.length * 100 : null, partialRate: matching.length ? matching.filter((row) => row.result === "partial").length / matching.length * 100 : null, blankRate: matching.length ? matching.filter((row) => row.result === "blank").length / matching.length * 100 : null }; }).filter((row) => row.count).sort((a, b) => a.correctRate - b.correctRate);
  return { count: rows.length, parts, questions };
}

function targetSummary(data, people, events) {
  const peopleIds = new Set(people.map((item) => item.personId));
  const latestEvent = [...events].reverse().find((event) => data.targets.some((row) => row.eventId === event.id));
  const rows = latestEvent ? data.targets.filter((row) => peopleIds.has(row.personId) && row.eventId === latestEvent.id && row.preferenceOrder === 1) : [];
  const counts = ["A", "B", "C", "D", "E"].map((label) => ({ label, count: rows.filter((row) => row.judgement === label).length }));
  const groups = data.targetDefinitions.map((target) => { const matching = rows.filter((row) => row.targetId === target.id); return { ...target, count: matching.length, aToC: matching.filter((row) => ["A", "B", "C"].includes(row.judgement)).length, borderGap: round(mean(matching.map((row) => row.borderGap))) }; }).filter((group) => group.count);
  return { event: latestEvent, sampleCount: rows.length, counts, borderGap: summarize(rows.map((row) => row.borderGap)), groups };
}

function registrationSummary(data, people, events) {
  const peopleIds = new Set(people.map((person) => person.personId));
  const eventIds = new Set(events.map((event) => event.id));
  const reports = data.reports.filter((row) => peopleIds.has(row.personId) && eventIds.has(row.eventId));
  const progress = events.flatMap((event) => data.locations.filter((location) => people.some((person) => person.locationId === location.id)).map((location) => {
    const matching = reports.filter((row) => row.eventId === event.id && row.locationId === location.id);
    return { eventId: event.id, locationId: location.id, active: matching.filter((row) => row.status === "ACTIVE").length, pending: matching.filter((row) => row.status === "PENDING").length, superseded: matching.filter((row) => row.status === "SUPERSEDED").length };
  }));
  return { active: reports.filter((row) => row.status === "ACTIVE").length, pending: reports.filter((row) => row.status === "PENDING").length, superseded: reports.filter((row) => row.status === "SUPERSEDED").length, progress };
}

function studentList(data, people, events, subjectId) {
  const latest = events.at(-1);
  const previous = events.at(-2);
  if (!latest) return [];
  return people.map((person) => {
    const latestValue = valueForPerson(data, person, latest, subjectId);
    const previousValue = previous ? valueForPerson(data, person, previous, subjectId) : null;
    const overallRow = data.scores.find((row) => row.personId === person.personId && row.eventId === latest.id && row.subjectId === "overall-6-8" && row.deviation !== null);
    const target = data.targets.find((row) => row.personId === person.personId && row.eventId === latest.id && row.preferenceOrder === 1);
    return { ...person, latestRate: round(latestValue), change: latestValue !== null && previousValue !== null ? round(latestValue - previousValue) : null, deviation: overallRow?.deviation ?? null, judgement: target?.judgement ?? null, targetLabel: target?.targetLabel ?? null };
  });
}

function individualSummary(data, people, events, requestedPersonId, subjectId) {
  const person = people.find((item) => item.personId === requestedPersonId) ?? people[0];
  if (!person) return null;
  const peers = people.filter((item) => item.locationId === person.locationId);
  const byEvent = events.map((event) => ({ ...event, value: round(valueForPerson(data, person, event, subjectId)), peerValue: round(mean(peers.map((peer) => valueForPerson(data, peer, event, subjectId)).filter((value) => value !== null))) }));
  const latest = events.at(-1);
  const subjects = latest ? data.subjectDefinitions.filter((item) => !item.aggregate).map((subject) => data.scores.find((row) => row.personId === person.personId && row.eventId === latest.id && row.subjectId === subject.id)).filter(Boolean).map((row) => ({ ...data.subjectDefinitions.find((item) => item.id === row.subjectId), ...row })) : [];
  const targetEvent = [...events].reverse().find((event) => data.targets.some((row) => row.personId === person.personId && row.eventId === event.id));
  const targets = targetEvent ? data.targets.filter((row) => row.personId === person.personId && row.eventId === targetEvent.id).sort((a, b) => a.preferenceOrder - b.preferenceOrder) : [];
  return { person, byEvent, subjects, targets, targetEvent };
}

export function createDemoModel(data, input = {}) {
  const filters = { locationIds: data.locations.map((item) => item.id), schoolId: "all", grade: "all", definitionId: "all", eventIds: [], subjectId: "all", suppressionThreshold: 5, personId: null, ...input };
  const events = selectedEvents(data, filters);
  const people = cohort(data, filters);
  const latest = events.at(-1);
  const rows = getRows(data, people, events, filters.subjectId);
  const latestValues = latest ? people.map((person) => valueForPerson(data, person, latest, filters.subjectId)).filter((value) => value !== null) : [];
  const registration = registrationSummary(data, people, events);
  return { filters, events, people, scope: { students: people.length, observations: rows.length, latestRate: summarize(latestValues) }, eventSummary: eventSummary(data, people, events, filters.subjectId), subjects: subjectSummary(data, people, events), comparison: comparisonSummary(data, people, events, filters.subjectId), groups: groupSummary(data, people, events, filters.subjectId, filters.suppressionThreshold), domains: domainSummary(data, people, events, filters.subjectId), locationDomains: locationDomainMatrix(data, people, events, filters.subjectId, filters.suppressionThreshold), answers: answerSummary(data, people, events, filters.subjectId), targets: targetSummary(data, people, events), registration, studentList: studentList(data, people, events, filters.subjectId), individual: individualSummary(data, people, events, filters.personId, filters.subjectId), suppressed: people.length > 0 && people.length < filters.suppressionThreshold, dataQuality: { schemaVersions: [...new Set(data.reports.map((row) => row.schemaVersion))], activeReports: registration.active, sourceCapabilities: data.sourceCapabilities, provenance: data.provenance, supportedScope: data.meta.supportedScope } };
}

export function createMlDemoRows(data, model) {
  const people = new Map(model.people.map((item, index) => [item.personId, `ML-${String(index + 1).padStart(5, "0")}`]));
  const eventIds = new Set(model.events.map((item) => item.id));
  const personDetails = new Map(model.people.map((item) => [item.personId, item]));
  return data.scores.filter((row) => people.has(row.personId) && eventIds.has(row.eventId) && (model.filters.subjectId === "all" || row.subjectId === model.filters.subjectId)).map((row) => ({ ExportSchemaVersion: "ml-export.v3-demo", ML_ID: people.get(row.personId), ExamEventID: row.eventId, LocationID: personDetails.get(row.personId).locationId, SchoolID: personDetails.get(row.personId).schoolId, MetricDefinitionID: row.metricDefinitionId, SubjectDefinitionID: row.subjectId, Score: row.score, MaxScore: row.maxScore, ScoreRate: row.scoreRate, Deviation: row.deviation, AbilityLevel: row.abilityLevel, MissingReason: row.missingReason }));
}
