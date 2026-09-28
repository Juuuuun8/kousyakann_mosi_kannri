import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import { activeReports, buildSheetWritePlan, commitPreparedRegistration, emptyStorageState, prepareRegistration, selectDataFile } from "../src/index.ts";

function input(overrides = {}) {
  const data = makeSyntheticDataset({ reportCount: 1, subjectsPerReport: 1, itemsPerSubject: 50 });
  const report = { ...data.reports[0], ...overrides };
  return {
    report,
    subjectScores: data.subjectScores.map((row) => ({ ...row, reportId: report.reportId })),
    payloads: data.payloadBindings.map((binding, index) => ({ payloadId: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, subjectDefinitionId: binding.subjectDefinitionId, payloadFormatVersion: "payload.v1", payload: binding.payload })),
  };
}

test("registration prepares a PENDING-to-ACTIVE Sheet write plan with verified payload chunks", async () => {
  const prepared = await prepareRegistration(input(), 700);
  assert.ok(prepared.payloadRecords.length > prepared.report.payloadCount);
  assert.deepEqual(buildSheetWritePlan(prepared).map((step) => step.operation), ["APPEND_PENDING_REPORT", "APPEND_SUBJECT_SCORES", "APPEND_PAYLOAD_CHUNKS", "VERIFY_READBACK", "ACTIVATE_REPORT"]);
  const result = commitPreparedRegistration(emptyStorageState(), prepared);
  assert.equal(result.status, "CREATED");
  assert.equal(activeReports(result.state).length, 1);
});

test("exact and semantic duplicates do not mutate storage", async () => {
  const prepared = await prepareRegistration(input());
  const created = commitPreparedRegistration(emptyStorageState(), prepared);
  assert.equal(created.status, "CREATED");
  const exact = commitPreparedRegistration(created.state, { ...prepared, report: { ...prepared.report, reportId: "80000000-0000-4000-8000-000000000099" } });
  assert.equal(exact.status, "DUPLICATE");
  assert.strictEqual(exact.state, created.state);
  const semantic = commitPreparedRegistration(created.state, { ...prepared, report: { ...prepared.report, reportId: "80000000-0000-4000-8000-000000000098", pdfHash: "f".repeat(64) } });
  assert.equal(semantic.status, "SEMANTIC_REVIEW");
  assert.strictEqual(semantic.state, created.state);
});

test("correction supersedes an ACTIVE report without deleting its rows", async () => {
  const first = await prepareRegistration(input());
  const initial = commitPreparedRegistration(emptyStorageState(), first);
  assert.equal(initial.status, "CREATED");
  const correctionInput = input({ reportId: "80000000-0000-4000-8000-000000000090", pdfHash: "e".repeat(64), semanticFingerprint: "d".repeat(64), supersedesReportId: first.report.reportId });
  correctionInput.subjectScores = correctionInput.subjectScores.map((row, index) => ({ ...row, recordId: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }));
  const correction = await prepareRegistration(correctionInput);
  const result = commitPreparedRegistration(initial.state, correction);
  assert.equal(result.status, "CREATED");
  assert.equal(result.state.reports.find((row) => row.reportId === first.report.reportId)?.status, "SUPERSEDED");
  assert.equal(activeReports(result.state)[0].reportId, correction.report.reportId);
  assert.equal(result.state.reports.length, 2);
});

test("preparation fails closed before any state can change", async () => {
  const invalid = input();
  invalid.report = { ...invalid.report, subjectCount: 99 };
  await assert.rejects(() => prepareRegistration(invalid), /subjectCount/);
  const raw = input();
  raw.payloads = [{ payloadId: "80000000-0000-4000-8000-000000000077", subjectDefinitionId: null, payloadFormatVersion: "payload.v1", payload: { v: 1, type: "raw_labels", items: [] } }];
  raw.report = { ...raw.report, payloadCount: 1 };
  await assert.rejects(() => prepareRegistration(raw), /raw label/);
});

test("data-file routing reuses capacity and creates a new archived part before the limit", () => {
  const now = "2026-09-29T00:00:00Z";
  const first = selectDataFile([], 2026, 200, 1000, now);
  assert.equal(first.created, true);
  const reused = selectDataFile(first.entries, 2026, 300, 1000, now);
  assert.equal(reused.created, false);
  assert.equal(reused.entry.estimatedCells, 500);
  const split = selectDataFile(reused.entries, 2026, 600, 1000, now);
  assert.equal(split.created, true);
  assert.equal(split.entry.part, 2);
  assert.equal(split.entries.find((entry) => entry.part === 1)?.status, "ARCHIVED");
});
