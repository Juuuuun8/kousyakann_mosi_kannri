import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDemoModel, createMlDemoRows, visibleStudents, orderEvents } from "../src/demo-engine.js";
import { validPdfHeader } from "../src/upload-validation.js";
import { csvCell } from "../src/csv-utils.js";

const baseline = JSON.parse(await readFile(new URL("../data/demo-dataset.json", import.meta.url), "utf8"));
const fixture = () => structuredClone(baseline);
const english = (data, filters = {}) => createDemoModel(data, { subjectId: "english-reading", ...filters });
const latest = baseline.examEvents.at(-1).id;

test("conflicting campus snapshots are visible and never assigned arbitrarily", () => {
  const d = fixture(), original = d.reports.find((r) => r.eventId === latest && r.status === "ACTIVE");
  d.reports.push({ ...original, reportId: "report.synthetic.campus-conflict", locationId: "loc.synthetic.other" });
  const m = english(d);
  assert.equal(m.registration.latestMetadataConflicts, 1);
  assert(!m.people.some((p) => p.personId === original.personId));
});

test("out-of-range score rates cannot feed aggregate or domain matrices", () => {
  const d = fixture(); d.scores.forEach((r) => { r.scoreRate = 101; }); d.domains.forEach((r) => { r.scoreRate = -1; });
  const m = english(d);
  assert.equal(m.scope.latestRate.count, 0); assert(m.dataQuality.invalidScoreRows > 0);
  assert(m.locationDomains.rows.every((r) => r.cells.every((cell) => cell.value === null)));
});

test("CSV preserves signed numeric values while escaping text formulas", () => {
  assert.equal(csvCell(-4.5), '"-4.5"'); assert.equal(csvCell(0), '"0"'); assert.equal(csvCell(null), '""');
  assert.equal(csvCell(" =1+1"), '"\' =1+1"'); assert.equal(csvCell('a"b'), '"a""b"');
});

test("missing national and same-ability references remain missing, never zero", () => {
  const d = fixture(); d.scores.forEach((r) => { r.nationalAverageRate = null; }); d.domains.forEach((r) => { r.nationalAverageRate = null; r.sameAbilityAverageRate = null; });
  const m = english(d, { matrixMeasure: "sameAbilityGap" });
  assert(m.subjects.every((r) => r.nationalGap === null));
  assert(m.domains.every((r) => r.nationalGap === null && r.sameAbilityGap === null && r.sameAbilityCount === 0));
  assert(m.locationDomains.rows.every((r) => r.cells.every((cell) => cell.value === null)));
});
test("zero scores are valid observations, not missing", () => {
  const d = fixture(); d.scores.forEach((r) => { r.scoreRate = 0; r.score = 0; r.deviation = 0; r.missingReason = null; });
  const m = english(d); assert.equal(m.scope.latestRate.mean, 0); assert(m.scope.latestRate.count > 0);
});
for (const n of [1, 2, 3, 4]) test(`effective sample ${n}, not roster size, gates aggregate statistics`, () => {
  const d = fixture(); const campus = "loc.sapporo";
  const kept = d.scores.filter((r) => r.eventId === latest && r.subjectId === "english-reading" && d.students.find((p) => p.personId === r.personId)?.locationId === campus).slice(0, n).map((r) => r.personId);
  d.scores.forEach((r) => { if (r.eventId === latest && r.subjectId === "english-reading" && !kept.includes(r.personId)) { r.scoreRate = null; r.missingReason = "NOT_TAKEN"; } });
  const m = english(d), group = m.groups.find((g) => g.id === campus);
  assert.equal(group.memberCount, 18); assert.equal(group.count, n); assert.equal(group.suppressed, true); assert.equal(group.mean, null); assert.deepEqual(group.values, []);
  assert.equal(m.scope.latestRate.mean, null);
});
test("PENDING and SUPERSEDED reports cannot feed any analysis or ML export", () => {
  const d = fixture(); d.reports.forEach((r) => { r.status = "PENDING"; });
  const m = english(d); assert.equal(m.registration.active, 0); assert.equal(m.scope.latestRate.count, 0); assert.equal(m.scope.latestRate.mean, null);
  assert.equal(m.answers.count, 0); assert.equal(m.targets.sampleCount, 0); assert(m.domains.every((r) => r.sampleCount === 0)); assert.deepEqual(createMlDemoRows(d, m), []);
});
test("unconfirmed identity never produces a cross-exam comparison", () => {
  const d = fixture(); d.reports.forEach((r) => { r.identityStatus = "UNRESOLVED"; });
  const m = english(d); assert.equal(m.comparison.comparableCount, 0); assert.equal(m.scope.latestRate.mean, null); assert.equal(createMlDemoRows(d, m).length, 0);
});
test("report ID ownership is verified, not joined by person and exam alone", () => {
  const d = fixture(); d.scores.forEach((r) => { r.reportId = "report.superseded"; });
  const m = english(d); assert.equal(m.scope.latestRate.count, 0); assert.equal(m.comparison.comparableCount, 0);
});
test("duplicate ACTIVE versions are excluded rather than picked arbitrarily", () => {
  const d = fixture(); const original = d.reports.find((r) => r.eventId === latest && r.status === "ACTIVE");
  d.reports.push({ ...original, reportId: "report.synthetic.conflict" });
  const m = english(d); assert(!createMlDemoRows(d, m).some((r) => r.ExamEventID === latest && r.ML_ID === `ML-${original.personId.split("-").at(-1).padStart(5, "0")}`));
});
test("duplicate subject observations fail closed", () => {
  const d = fixture(); const row = d.scores.find((r) => r.eventId === latest && r.subjectId === "english-reading"); d.scores.push({ ...row, scoreRate: 99 });
  const m = english(d); assert.equal(m.studentList.find((r) => r.personId === row.personId).latestRate, null);
});
test("metric definition and maximum mismatches cannot enter the same series", () => {
  for (const mutate of [(r) => { r.metricDefinitionId = "metric.synthetic.changed.v2"; }, (r) => { r.maxScore = 200; }]) {
    const d = fixture(); d.scores.filter((r) => r.eventId === latest && r.subjectId === "english-reading").forEach(mutate);
    const m = english(d); assert.equal(m.comparison.comparableCount, 0); assert.equal(m.scope.latestRate.mean, null); assert.equal(m.fixedCount, 0);
  }
});
test("all exam data respects capability false and unknown schema", () => {
  for (const missingProfile of [false, true]) {
    const d = fixture(); if (missingProfile) d.capabilityProfiles = []; else Object.keys(d.capabilityProfiles[0].supports).forEach((k) => { d.capabilityProfiles[0].supports[k] = false; });
    const m = english(d); assert.equal(m.scope.latestRate.mean, null); assert.equal(m.targets.sampleCount, 0); assert.equal(m.answers.count, 0); assert(m.domains.every((r) => r.sampleCount === 0));
  }
});
test("deviation capability governs individual and export values too", () => {
  const d = fixture(); d.capabilityProfiles[0].supports.deviation = false;
  const m = english(d, { scale: "deviation", personId: d.students[1].personId });
  assert.equal(m.scope.latestRate.mean, null); assert(m.studentList.every((r) => r.deviation === null)); assert(m.individual.subjects.every((r) => r.deviation === null)); assert(createMlDemoRows(d, m).every((r) => r.Deviation === null));
});
test("domain definition versions cannot silently connect", () => {
  const d = fixture(); d.domains.forEach((r) => { r.domainDefinitionVersion = 99; }); const m = english(d);
  assert(m.domains.every((r) => r.sampleCount === 0)); assert(m.locationDomains.rows.every((r) => r.cells.every((cell) => cell.value === null)));
});
test("event order is chronological even when input is shuffled", () => {
  const d = fixture(); d.examEvents.reverse(); const m = english(d); assert.equal(m.events.at(-1).id, latest);
  assert.deepEqual(m.events.map((r) => r.id), orderEvents(baseline.examEvents).map((r) => r.id));
});
test("empty event and campus selection are empty, not all", () => {
  const d = fixture(); const m = english(d, { eventIds: [], locationIds: [] }); assert.equal(m.events.length, 0); assert.equal(m.people.length, 0); assert.equal(m.targets.sampleCount, 0);
});
test("one event reports an unavailable comparison, not zero changes", () => {
  const m = english(fixture(), { eventIds: [latest] }); assert.equal(m.comparison.improved, null); assert.equal(m.comparison.declined, null); assert.match(m.comparison.reason, /2回/u);
});
test("latest event lacks domains, answers or targets: no historical fallback", () => {
  const d = fixture(); for (const k of ["domains", "targets", "answers"]) d[k] = d[k].filter((r) => r.eventId !== latest);
  const m = english(d, { personId: d.students[1].personId }); assert.equal(m.targets.sampleCount, 0); assert.equal(m.answers.count, 0); assert(m.domains.every((r) => r.sampleCount === 0)); assert.equal(m.individual.targets.length, 0);
});
test("all seven registered preference ranks and unknown judgments survive", () => {
  const d = fixture(); d.targets.filter((r) => r.eventId === latest && r.preferenceOrder === 7).forEach((r) => { r.judgement = "G"; });
  const m = english(d); assert.equal(m.targets.byPreference.length, 7); assert(m.targets.counts.find((r) => r.label === "不明").count > 0); assert(m.targets.rows.some((r) => r.judgement === "G"));
});
test("target grouping separates methods and border units", () => {
  const d = fixture(); const base = english(d).targets.groups;
  d.targets.filter((r) => r.eventId === latest && r.preferenceOrder === 7).forEach((r) => { r.borderGapUnit = "DEVIATION_PT"; });
  const m = english(d); assert(m.targets.groups.length > base.length); assert(!Object.hasOwn(m.targets, "borderGap"));
  assert(m.targets.groups.some((r) => r.schedule === "前期")); assert(m.targets.groups.some((r) => r.schedule === "一般"));
});
test("border gaps need enough actual values, not just target group members", () => {
  const d = fixture(); d.targets.forEach((r) => { r.borderGap = null; }); d.targets.find((r) => r.eventId === latest).borderGap = 8;
  const m = english(d); assert(m.targets.groups.every((r) => r.borderGap === null));
});
test("null changes are last in both sort directions, and zero-search has no auto profile", () => {
  const m = english(fixture()); assert.equal(m.individual, null);
  for (const sort of ["change-asc", "change-desc"]) { const rows = visibleStudents(m.studentList, { sort }); const firstNull = rows.findIndex((r) => r.change === null); if (firstNull !== -1) assert(rows.slice(firstNull).every((r) => r.change === null)); }
  assert.deepEqual(visibleStudents(m.studentList, { query: "synthetic-no-such-person" }), []);
});
test("drill subset does not modify the reference cohort", () => {
  const d = fixture(), m = english(d), cell = m.locationDomains.rows[0].cells[0], original = cell.gap;
  const rows = visibleStudents(m.studentList, { personIds: cell.personIds }); assert(rows.every((r) => cell.personIds.includes(r.personId)));
  assert.equal(m.people.length, 72); assert.equal(m.locationDomains.rows[0].cells[0].gap, original);
});
test("ML identities are stable under subset and input reordering", () => {
  const d = fixture(), full = createMlDemoRows(d, english(d)), subset = createMlDemoRows(d, english(d, { locationIds: ["loc.asahikawa"] }));
  const index = new Map(full.map((r) => [`${r.ExamEventID}|${r.LocationID}|${r.Score}|${r.Deviation}`, r.ML_ID]));
  assert(subset.every((r) => index.get(`${r.ExamEventID}|${r.LocationID}|${r.Score}|${r.Deviation}`) === r.ML_ID));
  d.students.reverse(); assert.deepEqual(createMlDemoRows(d, english(d)).map((r) => r.ML_ID), full.map((r) => r.ML_ID));
});
test("scope and group attribution use report-time affiliation, not edited current roster", () => {
  const d = fixture(), p = d.students[1]; p.locationId = "loc.sapporo"; p.schoolId = "school.1"; p.grade = "高2";
  const m = english(d, { locationIds: ["loc.asahikawa"] }); assert(m.people.some((r) => r.personId === p.personId)); assert.equal(m.people.find((r) => r.personId === p.personId).locationId, "loc.asahikawa");
});
test("PDF header validation does not trust a file extension", () => {
  assert.equal(validPdfHeader(new TextEncoder().encode("%PDF-1.7\n")), true); assert.equal(validPdfHeader(new TextEncoder().encode("not a PDF")), false); assert.equal(validPdfHeader(new Uint8Array()), false);
});
