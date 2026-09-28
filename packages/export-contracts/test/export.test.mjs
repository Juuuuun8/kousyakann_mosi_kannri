import assert from "node:assert/strict";
import test from "node:test";

import {
  ML_EXPORT_SCHEMA_VERSION,
  buildMlExport,
  csvCell,
  serializeMlCsv,
  validateMlExportRequest,
  validateMlExportRow,
  validateMlExportRows,
} from "../src/index.ts";
import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";

function row(overrides = {}) {
  return {
    exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION,
    mlId: "ml_synthetic_0001",
    identityStatus: "NEW_CONFIRMED",
    examEventId: "kawai.ct.2026.round-2",
    locationId: "loc.synthetic.1",
    subjectDefinitionId: "subject.synthetic.01",
    metricDefinitionId: "metric.raw-score",
    score: 61,
    maxScore: 100,
    scoreRate: 0.61,
    deviation: 52.1,
    abilityLevel: "B",
    missingReason: null,
    parserVersion: "kawai-parser@0.1.0",
    payloadFormatVersion: "payload.v1",
    featureAsOf: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

test("ML row contract excludes unresolved identities and forbidden direct columns", () => {
  assert.equal(validateMlExportRow(row()).ok, true);
  assert.equal(validateMlExportRow(row({ identityStatus: "AMBIGUOUS" })).ok, false);
  assert.equal(validateMlExportRow({ ...row(), studentNameKanaRaw: "forbidden" }).ok, false);
});

test("ML export batch enforces stable schema and duplicate protection", () => {
  assert.equal(validateMlExportRows([row()]).ok, true);
  assert.equal(validateMlExportRows([row(), row()]).ok, false);
  assert.equal(validateMlExportRequest({
    actorRole: "ADMIN",
    exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION,
    purpose: "synthetic contract test",
    requestedAt: "2026-09-28T00:00:00Z",
    filter: {},
    rows: [row()],
  }).ok, true);
  assert.equal(validateMlExportRequest({
    actorRole: "INPUT",
    exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION,
    purpose: "not allowed",
    requestedAt: "2026-09-28T00:00:00Z",
    filter: {},
    rows: [],
  }).ok, false);
});

test("ML export request rejects open-ended, duplicate, and reversed filters", () => {
  const base = {
    actorRole: "ADMIN",
    exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION,
    purpose: "synthetic contract test",
    requestedAt: "2026-09-28T00:00:00Z",
    rows: [row()],
  };
  assert.equal(validateMlExportRequest({ ...base, filter: { locationIds: ["loc.1"], rawQuery: "forbidden" } }).ok, false);
  assert.equal(validateMlExportRequest({ ...base, filter: { locationIds: ["loc.1", "loc.1"] } }).ok, false);
  assert.equal(validateMlExportRequest({ ...base, filter: { importedAtFrom: "2026-09-29T00:00:00Z", importedAtTo: "2026-09-28T00:00:00Z" } }).ok, false);
  assert.equal(validateMlExportRequest({ ...base, filter: { locationIds: [] } }).ok, false);
  assert.equal(validateMlExportRequest({ ...base, filter: {}, arbitrary: true }).ok, false);
});

test("CSV has fixed safe columns and blocks formula-like strings", () => {
  assert.equal(csvCell("=BAD()"), '"\'=BAD()"');
  assert.equal(csvCell("-2"), '"\'-2"');
  assert.equal(csvCell(-2), '"-2"');
  const csv = serializeMlCsv([row({ parserVersion: "safe-parser" })]);
  assert.match(csv, /^"ExportSchemaVersion"/);
  assert.match(csv, /"ML_ID"/);
  assert.doesNotMatch(csv, /StudentName|studentNameKanaRaw|PersonID/);
  assert.equal(csv.endsWith("\r\n"), true);
});

test("CSV serializer refuses an invalid row before producing output", () => {
  assert.throws(() => serializeMlCsv([row({ mlId: "=BAD()" })]), /invalid ML export rows/);
});

test("ML builder exports only ACTIVE confirmed identities with deterministic pseudonyms", async () => {
  const dataset = makeSyntheticDataset({ reportCount: 3, subjectsPerReport: 2 });
  dataset.reports[1].status = "SUPERSEDED";
  dataset.reports[2].identityStatus = "AMBIGUOUS";
  const key = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
  const input = { actorRole: "ADMIN", actorId: "actor.synthetic", auditId: "audit.synthetic.1", purpose: "合成ML検証", requestedAt: "2026-09-29T00:00:00Z", filter: {}, dataset, pseudonymKey: key };
  const first = await buildMlExport(input);
  const second = await buildMlExport(input);
  assert.equal(first.request.rows.length, 2);
  assert.deepEqual(first.request.rows, second.request.rows);
  assert.ok(first.request.rows.every((item) => item.mlId.startsWith("ml_") && !JSON.stringify(item).includes(dataset.reports[0].personId)));
  assert.equal(first.audit.rowCount, 2);
  assert.doesNotMatch(JSON.stringify(first.audit), /studentName|scoreRate|deviation/u);
});

test("ML builder enforces ADMIN hierarchy, filters, and pseudonym key strength", async () => {
  const dataset = makeSyntheticDataset({ reportCount: 1, subjectsPerReport: 2 });
  const base = { actorRole: "AUTH_MANAGER", actorId: "actor.synthetic", auditId: "audit.synthetic.2", purpose: "合成ML検証", requestedAt: "2026-09-29T00:00:00Z", filter: { subjectDefinitionIds: [dataset.subjectScores[0].subjectDefinitionId] }, dataset, pseudonymKey: new Uint8Array(32) };
  const built = await buildMlExport(base);
  assert.equal(built.request.rows.length, 1);
  await assert.rejects(() => buildMlExport({ ...base, pseudonymKey: new Uint8Array(8) }), /at least 32/u);
});
