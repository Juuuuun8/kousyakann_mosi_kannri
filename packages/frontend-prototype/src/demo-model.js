// Synthetic-only adapter. Real authorization and aggregation remain server-side.
export const finite = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (values) => { const valid = values.filter(finite); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };
const round = (v) => finite(v) ? Number(v.toFixed(1)) : null;
const diff = (v, ref) => finite(v) && finite(ref) ? v - ref : null;
const confirmed = (status) => ["RESOLVED", "NEW_CONFIRMED"].includes(status);
const key = (...parts) => JSON.stringify(parts);
export function orderEvents(events) {
  return [...events].sort((a, b) => a.examDate && b.examDate ? a.examDate.localeCompare(b.examDate) || a.id.localeCompare(b.id) : (a.year - b.year) || (a.round - b.round) || a.id.localeCompare(b.id));
}
function quantile(values, position) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * position;
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index - Math.floor(index));
}
function stats(values, threshold = 1) {
  const valid = values.filter(finite), visible = valid.length >= threshold ? valid : [];
  return { count: valid.length, suppressed: valid.length > 0 && valid.length < threshold, mean: round(mean(visible)), minimum: round(visible.length ? Math.min(...visible) : null), p25: round(quantile(visible, .25)), median: round(quantile(visible, .5)), p75: round(quantile(visible, .75)), maximum: round(visible.length ? Math.max(...visible) : null) };
}
function uniqueRows(rows, identity) {
  const index = new Map(), duplicates = new Set();
  for (const row of rows) { const id = identity(row); if (index.has(id)) duplicates.add(id); else index.set(id, row); }
  return [...index].filter(([id]) => !duplicates.has(id)).map(([, row]) => row);
}
function context(data, filters) {
  const eventIds = filters.eventIds === undefined ? null : new Set(filters.eventIds);
  const events = orderEvents(data.examEvents.filter((event) => (!eventIds || eventIds.has(event.id)) && event.definitionId === filters.definitionId));
  // Scope uses the latest selected exam's report snapshot, not today's roster.
  const latestReports = data.reports.filter((r) => r.eventId === events.at(-1)?.id && ["ACTIVE", "PENDING"].includes(r.status));
  const latestByPerson = new Map();
  for (const report of latestReports) {
    const versions = latestReports.filter((r) => r.personId === report.personId);
    // Use metadata only if competing versions agree; no arbitrary campus assignment.
    if (versions.every((r) => r.locationId === report.locationId && r.schoolId === report.schoolId && r.grade === report.grade)) latestByPerson.set(report.personId, report);
  }
  const latestMetadataConflicts = new Set(latestReports.filter((r) => !latestByPerson.has(r.personId)).map((r) => r.personId)).size;
  const people = data.students.map((p) => {
    const r = latestByPerson.get(p.personId);
    return r ? { ...p, locationId: r.locationId, schoolId: r.schoolId ?? null, grade: r.grade ?? null, identityStatus: r.identityStatus ?? p.identityStatus } : { ...p, locationId: null, schoolId: null, grade: null };
  }).filter((p) => filters.locationIds.includes(p.locationId) && (filters.schoolId === "all" || p.schoolId === filters.schoolId) && (filters.grade === "all" || p.grade === filters.grade));
  const ids = new Set(people.map((p) => p.personId)), selectedEvents = new Set(events.map((e) => e.id));
  const allReports = data.reports.filter((r) => ids.has(r.personId) && selectedEvents.has(r.eventId));
  const candidates = allReports.filter((r) => r.status === "ACTIVE");
  const unique = uniqueRows(candidates, (r) => key(r.personId, r.eventId));
  const reports = unique.filter((r) => confirmed(r.identityStatus ?? data.students.find((p) => p.personId === r.personId)?.identityStatus));
  const reportIndex = new Map(reports.map((r) => [r.reportId, r])), profiles = new Map(data.capabilityProfiles.map((p) => [p.schemaVersion, p]));
  const supports = (row, capability) => { const r = reportIndex.get(row.reportId); return !!r && r.personId === row.personId && r.eventId === row.eventId && profiles.get(r.schemaVersion)?.examDefinitionId === data.examEvents.find((e) => e.id === r.eventId)?.definitionId && profiles.get(r.schemaVersion)?.supports[capability] === true; };
  const scoreCandidates = data.scores.filter((r) => supports(r, "subjectScores"));
  const scores = uniqueRows(scoreCandidates.filter((r) => {
    const definition = data.subjectDefinitions.find((s) => s.id === r.subjectId);
    return definition && definition.metricDefinitionId === r.metricDefinitionId && definition.maxScore === r.maxScore && (!finite(r.scoreRate) || (r.scoreRate >= 0 && r.scoreRate <= 100));
  }), (r) => key(r.personId, r.eventId, r.subjectId));
  const index = new Map(scores.map((r) => [key(r.personId, r.eventId, r.subjectId), r]));
  const rowFor = (personId, eventId, subjectId) => index.get(key(personId, eventId, subjectId));
  const value = (row) => !row || row.missingReason ? null : filters.scale === "deviation" ? (supports(row, "deviation") && finite(row.deviation) ? row.deviation : null) : (finite(row.scoreRate) && finite(row.maxScore) && row.maxScore > 0 ? row.scoreRate : null);
  const source = (rows, feature, identity) => uniqueRows(rows.filter((r) => supports(r, feature) && !r.missingReason), identity);
  const domains = source(data.domains.filter((r) => (!finite(r.scoreRate) || (r.scoreRate >= 0 && r.scoreRate <= 100)) && data.domainDefinitions.some((d) => d.id === r.domainId && d.subjectId === r.subjectId && d.version === r.domainDefinitionVersion)), "domains", (r) => key(r.personId, r.eventId, r.domainId));
  const targets = source(data.targets, "targets", (r) => key(r.personId, r.eventId, r.preferenceOrder));
  const answers = source(data.answers, "answerMarks", (r) => key(r.personId, r.eventId, r.subjectId, r.majorQuestion, r.questionNumber));
  return { data, filters, events, people, allReports, reports, scores, rowFor, value, supports, domains, targets, answers, latestMetadataConflicts, duplicateReports: candidates.length - unique.length, unresolvedReports: unique.length - reports.length, invalidScoreRows: scoreCandidates.length - scores.length };
}
function compatible(a, b) { return !!a && !!b && a.subjectId === b.subjectId && a.metricDefinitionId === b.metricDefinitionId && finite(a.maxScore) && a.maxScore === b.maxScore; }
function changeFor(c, person, before, after, scoreRate = false) {
  const a = c.rowFor(person.personId, before?.id, c.filters.subjectId), b = c.rowFor(person.personId, after?.id, c.filters.subjectId);
  if (!before || !after || before.definitionId !== after.definitionId || !compatible(a, b) || a.missingReason || b.missingReason) return null;
  return scoreRate ? diff(b.scoreRate, a.scoreRate) : diff(c.value(b), c.value(a));
}
function eventSummary(c, people = c.people) {
  return c.events.map((event) => { const rows = people.map((p) => c.rowFor(p.personId, event.id, c.filters.subjectId)), rate = stats(rows.map(c.value), c.filters.suppressionThreshold); return { ...event, participants: rate.count, excludedCount: people.length - rate.count, rate }; });
}
function subjectSummary(c) {
  return c.data.subjectDefinitions.map((subject) => {
    const rows = c.scores.filter((r) => r.subjectId === subject.id && r.eventId === c.events.at(-1)?.id && !r.missingReason), national = rows.map((r) => diff(r.scoreRate, r.nationalAverageRate));
    return { ...subject, sampleCount: rows.map(c.value).filter(finite).length, rate: stats(rows.map((r) => r.scoreRate), c.filters.suppressionThreshold), deviation: stats(rows.map((r) => c.supports(r, "deviation") ? r.deviation : null), c.filters.suppressionThreshold), primary: stats(rows.map(c.value), c.filters.suppressionThreshold), nationalGap: stats(national, c.filters.suppressionThreshold).mean, nationalCount: national.filter(finite).length };
  });
}
function comparisonSummary(c) {
  const events = c.events.slice(-2), changes = events.length === 2 ? c.people.map((p) => changeFor(c, p, ...events)).filter(finite) : [];
  const band = c.data.followUpRules.changeBandThreshold, enough = changes.length >= c.filters.suppressionThreshold;
  return { events, comparableCount: changes.length, excludedCount: c.people.length - changes.length, changeBandThreshold: band, change: stats(changes, c.filters.suppressionThreshold), improved: enough ? changes.filter((v) => v >= band).length : null, unchanged: enough ? changes.filter((v) => v > -band && v < band).length : null, declined: enough ? changes.filter((v) => v <= -band).length : null, reason: events.length < 2 ? "2回以上の模試を選択してください" : !enough ? `比較可能者が${c.filters.suppressionThreshold}人未満です` : null };
}
function groupSummary(c) {
  const definitions = [...c.data.locations.map((g) => ({ ...g, kind: "校舎", field: "locationId" })), ...c.data.schools.map((g) => ({ ...g, kind: "高校", field: "schoolId" }))];
  return definitions.map((g) => { const members = c.people.filter((p) => p[g.field] === g.id), values = members.map((p) => ({ personId: p.personId, value: c.value(c.rowFor(p.personId, c.events.at(-1)?.id, c.filters.subjectId)) })).filter((v) => finite(v.value)), summary = stats(values.map((v) => v.value), c.filters.suppressionThreshold); return { id: g.id, label: g.label, kind: g.kind, memberCount: members.length, excludedCount: members.length - summary.count, values: summary.suppressed ? [] : values, ...summary }; }).filter((g) => g.memberCount);
}
function domainStats(rows, threshold) {
  const valid = rows.filter((r) => finite(r.scoreRate) && r.scoreRate >= 0 && r.scoreRate <= 100), gap = (field) => stats(valid.map((r) => diff(r.scoreRate, r[field])), threshold);
  return { sampleCount: valid.length, scoreRate: stats(valid.map((r) => r.scoreRate), threshold).mean, nationalGap: gap("nationalAverageRate").mean, nationalCount: gap("nationalAverageRate").count, sameAbilityGap: gap("sameAbilityAverageRate").mean, sameAbilityCount: gap("sameAbilityAverageRate").count };
}
function domainSummary(c, personId = null) {
  const source = c.domains.filter((r) => (!personId || r.personId === personId) && r.subjectId === c.filters.subjectId), threshold = personId ? 1 : c.filters.suppressionThreshold;
  return c.data.domainDefinitions.filter((d) => d.subjectId === c.filters.subjectId).map((d) => { const matching = source.filter((r) => r.domainId === d.id); return { ...d, ...domainStats(matching.filter((r) => r.eventId === c.events.at(-1)?.id), threshold), byEvent: c.events.map((e) => ({ eventId: e.id, ...domainStats(matching.filter((r) => r.eventId === e.id), threshold), value: domainStats(matching.filter((r) => r.eventId === e.id), threshold).scoreRate })) }; });
}
function locationDomainMatrix(c) {
  const event = c.events.at(-1), locations = c.data.locations.filter((l) => c.filters.locationIds.includes(l.id)), people = new Map(c.people.map((p) => [p.personId, p]));
  const source = c.domains.filter((r) => r.eventId === event?.id && r.subjectId === c.filters.subjectId);
  const rows = c.data.domainDefinitions.filter((d) => d.subjectId === c.filters.subjectId).map((d) => {
    const all = source.filter((r) => r.domainId === d.id), overall = stats(all.map((r) => r.scoreRate), c.filters.suppressionThreshold).mean;
    const cells = locations.map((l) => {
      const matching = all.filter((r) => people.get(r.personId)?.locationId === l.id), summary = domainStats(matching, c.filters.suppressionThreshold);
      const values = matching.map((r) => c.filters.matrixMeasure === "nationalGap" ? diff(r.scoreRate, r.nationalAverageRate) : c.filters.matrixMeasure === "sameAbilityGap" ? diff(r.scoreRate, r.sameAbilityAverageRate) : c.filters.matrixMeasure === "cohortGap" ? diff(r.scoreRate, overall) : r.scoreRate);
      const answers = c.answers.filter((r) => r.eventId === event?.id && r.domainId === d.id && people.get(r.personId)?.locationId === l.id), answerPeople = new Set(answers.map((r) => r.personId)).size;
      const measured = c.filters.matrixMeasure === "blankRate" ? { ...stats(Array.from({ length: answerPeople }, () => 1), c.filters.suppressionThreshold), mean: answerPeople >= c.filters.suppressionThreshold ? round(answers.filter((r) => r.result === "blank").length / answers.length * 100) : null } : stats(values, c.filters.suppressionThreshold);
      return { ...summary, locationId: l.id, count: measured.count, value: measured.mean, gap: diff(summary.scoreRate, overall), suppressed: measured.suppressed, personIds: c.filters.matrixMeasure === "blankRate" ? [...new Set(answers.map((r) => r.personId))] : matching.filter((r, i) => finite(values[i])).map((r) => r.personId) };
    }); return { ...d, cells };
  }); return { event, locations, rows, measure: c.filters.matrixMeasure };
}
function answerSummary(c, personId = null) {
  const event = c.events.at(-1), rows = c.answers.filter((r) => r.eventId === event?.id && r.subjectId === c.filters.subjectId && (!personId || r.personId === personId)), participants = new Set(rows.map((r) => r.personId)).size, threshold = personId ? 1 : c.filters.suppressionThreshold;
  const suppressed = participants > 0 && participants < threshold, known = ["correct", "partial", "wrong", "blank", "extra"];
  const parts = [...known, "unknown"].map((result) => { const count = rows.filter((r) => result === "unknown" ? !known.includes(r.result) : r.result === result).length; return { key: result, count, rate: rows.length && !suppressed ? count / rows.length : null }; });
  const questions = c.data.domainDefinitions.filter((d) => d.subjectId === c.filters.subjectId).map((d) => { const matching = rows.filter((r) => r.domainId === d.id), count = new Set(matching.map((r) => r.personId)).size, rate = (result) => matching.length && count >= threshold ? round(matching.filter((r) => r.result === result).length / matching.length * 100) : null; return { ...d, count: matching.length, personCount: count, correctRate: rate("correct"), partialRate: rate("partial"), blankRate: rate("blank") }; });
  return { event, count: rows.length, participants, suppressed, parts, questions, rows: personId ? rows : [] };
}
function targetSummary(c) {
  const event = c.events.at(-1), rows = c.targets.filter((r) => r.eventId === event?.id);
  const countsFor = (matching) => ["A", "B", "C", "D", "E", "不明"].map((label) => ({ label, count: matching.filter((r) => label === "不明" ? !["A", "B", "C", "D", "E"].includes(r.judgement) : r.judgement === label).length }));
  const index = new Map();
  for (const r of rows) { const id = key(r.universityId, r.facultyId, r.programId, r.admissionMethodId, r.borderGapUnit, r.programId && r.admissionMethodId ? null : r.targetLabelRaw); if (!index.has(id)) index.set(id, []); index.get(id).push(r); }
  const groups = [...index.values()].map((matching) => {
    const r = matching[0], target = c.data.targetDefinitions.find((t) => t.programId === r.programId), studentCount = new Set(matching.map((t) => t.personId)).size, enough = studentCount >= c.filters.suppressionThreshold;
    const borderRows = matching.filter((t) => finite(t.borderGap)), borderCount = new Set(borderRows.map((t) => t.personId)).size;
    return { ...target, ...r, count: matching.length, studentCount, suppressed: !enough, preferenceOrders: [...new Set(matching.map((t) => t.preferenceOrder))].sort((a, b) => a - b), aToC: enough ? matching.filter((t) => ["A", "B", "C"].includes(t.judgement)).length : null, borderGap: r.borderGapUnit && borderCount >= c.filters.suppressionThreshold ? round(mean(borderRows.map((t) => t.borderGap))) : null, borderCount, personIds: [...new Set(matching.map((t) => t.personId))] };
  });
  const rule = c.data.followUpRules, studentRows = c.people.map((p) => rows.filter((r) => r.personId === p.personId && rule.targetPreferenceOrders.includes(r.preferenceOrder)));
  const byPreference = [...new Set(rows.map((r) => r.preferenceOrder))].sort((a, b) => a - b).map((order) => { const matching = rows.filter((r) => r.preferenceOrder === order); return { order, count: matching.length, counts: countsFor(matching) }; });
  const studentCount = new Set(rows.map((r) => r.personId)).size;
  return { event, rows, sampleCount: rows.length, studentCount, suppressed: studentCount > 0 && studentCount < c.filters.suppressionThreshold, counts: countsFor(rows), groups, byPreference, allConfiguredJudgement: studentRows.filter((items) => rule.targetPreferenceOrders.every((order) => items.some((r) => r.preferenceOrder === order && rule.targetJudgements.includes(r.judgement)))).length, hasAToC: new Set(rows.filter((r) => ["A", "B", "C"].includes(r.judgement)).map((r) => r.personId)).size, rule };
}
function registrationSummary(c) {
  const progress = c.events.flatMap((e) => c.data.locations.filter((l) => c.filters.locationIds.includes(l.id)).map((l) => { const matching = c.allReports.filter((r) => r.eventId === e.id && r.locationId === l.id); return { eventId: e.id, locationId: l.id, active: matching.filter((r) => r.status === "ACTIVE").length, pending: matching.filter((r) => r.status === "PENDING").length, superseded: matching.filter((r) => r.status === "SUPERSEDED").length }; }));
  return { active: c.allReports.filter((r) => r.status === "ACTIVE").length, pending: c.allReports.filter((r) => r.status === "PENDING").length, superseded: c.allReports.filter((r) => r.status === "SUPERSEDED").length, progress };
}
function studentList(c) {
  const latest = c.events.at(-1), previous = c.events.at(-2);
  return c.people.map((p) => {
    const row = c.rowFor(p.personId, latest?.id, c.filters.subjectId), targets = c.targets.filter((r) => r.personId === p.personId && r.eventId === latest?.id).sort((a, b) => a.preferenceOrder - b.preferenceOrder), change = round(changeFor(c, p, previous, latest)), rule = c.data.followUpRules, flags = [];
    const rateChange = changeFor(c, p, previous, latest, true);
    if (finite(rateChange) && rateChange <= rule.scoreRateDeclineThreshold) flags.push("decline");
    if (rule.targetPreferenceOrders.every((order) => targets.some((r) => r.preferenceOrder === order && rule.targetJudgements.includes(r.judgement)))) flags.push("targets");
    return { ...p, latestRate: round(c.value(row)), scoreRate: row && !row.missingReason ? row.scoreRate : null, change, deviation: row && !row.missingReason && c.supports(row, "deviation") ? row.deviation : null, judgement: targets.find((r) => r.preferenceOrder === 1)?.judgement ?? null, targetLabels: targets.map((r) => r.targetLabel), followUpFlags: flags, missingReason: row?.missingReason ?? (!row ? "NO_ELIGIBLE_RECORD" : c.value(row) === null ? "NOT_SUPPORTED_OR_MISSING" : null) };
  });
}
function individualSummary(c) {
  const person = c.people.find((p) => p.personId === c.filters.personId); if (!person) return null;
  const latest = c.events.at(-1);
  const byEvent = c.events.map((e) => {
    const personalReport = c.reports.find((r) => r.personId === person.personId && r.eventId === e.id);
    const peers = c.people.filter((p) => c.reports.some((r) => r.personId === p.personId && r.eventId === e.id && r.locationId === personalReport?.locationId));
    return { ...e, value: round(c.value(c.rowFor(person.personId, e.id, c.filters.subjectId))), peerValue: stats(peers.map((p) => c.value(c.rowFor(p.personId, e.id, c.filters.subjectId))), c.filters.suppressionThreshold).mean };
  });
  const subjects = c.data.subjectDefinitions.filter((s) => !s.aggregate).map((s) => { const r = c.rowFor(person.personId, latest?.id, s.id); return { ...s, ...r, deviation: r && c.supports(r, "deviation") ? r.deviation : null, missingReason: r?.missingReason ?? (!r ? "NO_ELIGIBLE_RECORD" : null) }; });
  return { person, byEvent, subjects, domains: domainSummary(c, person.personId), answers: answerSummary(c, person.personId), targets: c.targets.filter((r) => r.personId === person.personId && r.eventId === latest?.id).sort((a, b) => a.preferenceOrder - b.preferenceOrder), targetEvent: latest };
}
export function visibleStudents(rows, { query = "", sort = "deviation-desc", flag = "all", names = (r) => [r.displayLabel, r.grade, r.judgement, ...r.targetLabels], personIds = null } = {}) {
  const needle = query.trim().toLocaleLowerCase("ja"), [field, direction] = sort.split("-");
  return rows.filter((r) => (!personIds || personIds.includes(r.personId)) && (!needle || names(r).some((v) => String(v ?? "").toLocaleLowerCase("ja").includes(needle))) && (flag === "all" || r.followUpFlags.includes(flag))).sort((a, b) => {
    const av = field === "name" ? a.displayLabel : a[field], bv = field === "name" ? b.displayLabel : b[field];
    if (av === null || av === undefined) return bv === null || bv === undefined ? a.personId.localeCompare(b.personId) : 1;
    if (bv === null || bv === undefined) return -1;
    return (typeof av === "string" ? av.localeCompare(bv, "ja") : av - bv) * (direction === "asc" ? 1 : -1) || a.personId.localeCompare(b.personId);
  });
}
export function createDemoModel(data, input = {}) {
  const filters = { locationIds: data.locations.map((l) => l.id), schoolId: "all", grade: "all", definitionId: data.examDefinitions[0]?.id, subjectId: data.meta.defaultComparisonSubjectId, scale: "scoreRate", matrixMeasure: "cohortGap", suppressionThreshold: 5, personId: null, ...input }, c = context(data, filters), latest = c.events.at(-1);
  const values = c.people.map((p) => c.value(c.rowFor(p.personId, latest?.id, filters.subjectId)));
  const fixedPeople = c.people.filter((p) => c.events.length && c.events.every((e) => finite(c.value(c.rowFor(p.personId, e.id, filters.subjectId))) && compatible(c.rowFor(p.personId, c.events[0]?.id, filters.subjectId), c.rowFor(p.personId, e.id, filters.subjectId))));
  const missing = {}; c.people.forEach((p) => { const r = c.rowFor(p.personId, latest?.id, filters.subjectId); if (!finite(c.value(r))) { const reason = r?.missingReason ?? (!r ? "NO_ELIGIBLE_RECORD" : "NOT_SUPPORTED_OR_MISSING"); missing[reason] = (missing[reason] ?? 0) + 1; } });
  const registration = registrationSummary(c);
  registration.latestMetadataConflicts = c.latestMetadataConflicts;
  return { filters, events: c.events, people: c.people, selectedMetric: data.subjectDefinitions.find((s) => s.id === filters.subjectId), selectedDefinition: data.examDefinitions.find((d) => d.id === filters.definitionId), scope: { students: c.people.length, observations: c.scores.filter((r) => r.subjectId === filters.subjectId).length, latestRate: stats(values, filters.suppressionThreshold), excludedCount: c.people.length - values.filter(finite).length, missing }, eventSummary: eventSummary(c), fixedEventSummary: eventSummary(c, fixedPeople), fixedCount: fixedPeople.length, subjects: subjectSummary(c), comparison: comparisonSummary(c), groups: groupSummary(c), domains: domainSummary(c), locationDomains: locationDomainMatrix(c), answers: answerSummary(c), targets: targetSummary(c), registration, studentList: studentList(c), individual: individualSummary(c), suppressed: c.people.length > 0 && c.people.length < filters.suppressionThreshold, dataQuality: { invalidScoreRows: c.invalidScoreRows, duplicateReports: c.duplicateReports, unresolvedReports: c.unresolvedReports, schemaVersions: [...new Set(c.allReports.map((r) => r.schemaVersion))], activeReports: registration.active, sourceCapabilities: data.sourceCapabilities, capabilityProfiles: data.capabilityProfiles, followUpRules: data.followUpRules, provenance: data.provenance, supportedScope: data.meta.supportedScope } };
}
export function createMlDemoRows(data, model) {
  const c = context(data, model.filters), ids = new Map([...data.students].sort((a, b) => a.personId.localeCompare(b.personId)).map((p, i) => [p.personId, `ML-${String(i + 1).padStart(5, "0")}`])), reports = new Map(c.reports.map((r) => [r.reportId, r]));
  // Synthetic mapping only; production export-contracts uses secret-keyed HMAC.
  return c.scores.filter((r) => r.subjectId === model.filters.subjectId).map((r) => ({ ExportSchemaVersion: "ml-export.v4-demo", ML_ID: ids.get(r.personId), ExamEventID: r.eventId, LocationID: reports.get(r.reportId).locationId, SchoolID: reports.get(r.reportId).schoolId ?? null, MetricDefinitionID: r.metricDefinitionId, SubjectDefinitionID: r.subjectId, Score: r.score, MaxScore: r.maxScore, ScoreRate: r.scoreRate, Deviation: c.supports(r, "deviation") ? r.deviation : null, AbilityLevel: r.abilityLevel, MissingReason: r.missingReason }));
}
