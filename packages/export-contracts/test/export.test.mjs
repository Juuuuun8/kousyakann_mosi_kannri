import assert from "node:assert/strict";
import test from "node:test";

import {
  ML_EXPORT_SCHEMA_VERSION,
  csvCell,
  serializeMlCsv,
  validateMlExportRequest,
  validateMlExportRow,
  validateMlExportRows,
} from "../src/index.ts";

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
