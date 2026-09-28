import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  validatePayloadJson,
  validatePayloadRecord,
  validateReportRecord,
  validateSubjectScoreRecord,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "schema");
const hash = "0".repeat(64);

const report = {
  reportId: "00000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
  locationId: "loc.synthetic",
  examEventId: "kawai.ct.2026.round-2",
  personId: "00000000-0000-4000-8000-000000000002",
  identityStatus: "NEW_CONFIRMED",
  examCandidateId: "synthetic-candidate-001",
  schoolCodeRaw: "SYNTHETIC-SCHOOL",
  schoolNameRaw: "合成学校",
  gradeRaw: "3",
  classRaw: null,
  localNumberRaw: null,
  studentNameKanaRaw: "テスト セイト",
  schemaVersionId: "kawai.ct.2026.round-2.v1",
  parserVersion: "kawai-parser@0.1.0",
  normalizationVersion: "normalization@0.1.0",
  pdfHash: hash,
  semanticFingerprint: hash,
  pageCount: 4,
  subjectCount: 1,
  payloadCount: 1,
  importedAt: "2026-09-28T00:00:00Z",
  importedBy: "synthetic@example.invalid",
  supersedesReportId: null,
};

const subjectScore = {
  recordId: "00000000-0000-4000-8000-000000000003",
  reportId: report.reportId,
  subjectDefinitionId: "subject.english.reading",
  metricDefinitionId: "metric.raw-score",
  score: 58,
  maxScore: 100,
  scoreRate: 0.58,
  deviation: 52.6,
  abilityLevel: "B",
  nationalAverage: 57,
  nationalRank: 123,
  nationalPopulation: 1000,
  currentStudentAverage: 55.6,
  graduateAverage: 70.4,
  currentRank: 1,
  currentPopulation: 10,
  schoolDeviation: 45.1,
  schoolAverage: 66.8,
  schoolRank: 1,
  schoolPopulation: 20,
  missingReason: null,
  sourceLabelRaw: "英語",
  valueHash: hash,
  schemaVersionId: report.schemaVersionId,
  parserVersion: report.parserVersion,
  normalizationVersion: report.normalizationVersion,
};

const payloadJson = {
  v: 1,
  type: "answer_marks",
  subject: "subject.english.reading",
  items: [
    [1, "1", "○", "CORRECT", "1", null],
    [1, "2", "×", "WRONG", "3", null],
  ],
};

const payload = {
  payloadId: "00000000-0000-4000-8000-000000000004",
  reportId: report.reportId,
  payloadType: "ANSWER_MARKS",
  subjectDefinitionId: "subject.english.reading",
  payloadFormatVersion: "answer_marks.v1",
  chunkIndex: 0,
  chunkCount: 1,
  itemCount: payloadJson.items.length,
  payloadHash: hash,
  chunkHash: hash,
  jsonText: JSON.stringify(payloadJson),
  createdAt: report.importedAt,
};

const targetsPayload = {
  v: 1,
  type: "targets",
  items: [{
    preferenceOrder: 1,
    scheduleRaw: "前期",
    universityRaw: "合成大学",
    facultyRaw: "合成学部",
    departmentMethodRaw: "合成方式",
    universityId: null,
    judgementRaw: "A",
    scoreMetricRaw: "偏差値",
    scoreOrDeviation: 55,
    fullScore: 1000,
    borderScore: 60,
    firstChoiceRank: 1,
    firstChoicePopulation: 10,
    totalRank: 2,
    totalPopulation: 20,
    firstChoiceAverage: 50,
    totalAverage: 51,
    capacity: 20,
    subjectResults: [{ subjectRaw: "英語", subjectDefinitionId: "subject.english.reading", averageDeviation: 54, personalScore: 80, universityAllocation: 100, missingReason: null }],
    evaluationBands: [{ thresholdRaw: "A70〜", judgementRaw: "A", lowerBound: 70, population: 3, missingReason: null }],
    missingReason: null,
  }],
};

test("representative canonical records are valid", () => {
  assert.equal(validateReportRecord(report).ok, true);
  assert.equal(validateSubjectScoreRecord(subjectScore).ok, true);
  assert.equal(validatePayloadJson(payloadJson).ok, true);
  assert.equal(validatePayloadJson(targetsPayload).ok, true);
  assert.equal(validatePayloadRecord(payload).ok, true);
});

test("invalid enums, chunks, and payload tuples fail closed", () => {
  assert.equal(validateReportRecord({ ...report, status: "UNKNOWN" }).ok, false);
  assert.equal(validateSubjectScoreRecord({ ...subjectScore, missingReason: "ZERO" }).ok, false);
  assert.equal(validatePayloadRecord({ ...payload, chunkIndex: 1 }).ok, false);
  assert.equal(validatePayloadRecord({ ...payload, payloadType: "DOMAIN" }).ok, false);
  assert.equal(validatePayloadJson({ ...payloadJson, items: [[1, "1"]] }).ok, false);
  const incompleteDomain = {
    v: 1,
    type: "domain_results",
    subject: "subject.synthetic",
    commentaryRaw: null,
    items: [{ questionNumberRaw: "1", domainRaw: "合成分野" }],
  };
  assert.equal(validatePayloadJson(incompleteDomain).ok, false);
  assert.equal(validatePayloadJson({ ...incompleteDomain, commentaryRaw: 1 }).ok, false);
  assert.equal(validatePayloadJson({ ...targetsPayload, items: [{ ...targetsPayload.items[0], subjectResults: undefined }] }).ok, false);
});

test("payload text has a hard provisional cell guard", () => {
  const oversized = { ...payload, jsonText: "{" + "x".repeat(40000) + "}" };
  const validation = validatePayloadRecord(oversized);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.code === "JSON_TEXT_LENGTH"));
});

test("schema files are JSON and expose closed required contracts", async () => {
  const names = (await readdir(schemaDir)).filter((name) => name.endsWith(".schema.json"));
  assert.deepEqual(names.sort(), [
    "payload-json.schema.json",
    "payload-record.schema.json",
    "report-record.schema.json",
    "subject-score-record.schema.json",
  ]);
  for (const name of names) {
    const schema = JSON.parse(await readFile(join(schemaDir, name), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.ok(schema.$id.includes("kousyakann-mosi-kannri.invalid"));
    assert.ok(schema.title || schema.oneOf);
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.ok(Array.isArray(schema.required));
    }
  }
});

test("contract package has no known sample personal data", async () => {
  const paths = [
    join(here, "..", "package.json"),
    join(here, "..", "tsconfig.json"),
    join(here, "..", "src"),
    join(here, "..", "schema"),
  ];
  const texts = [];
  for (const path of paths) {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    if (entries.length) {
      for (const entry of entries) {
        if (entry.isFile()) texts.push(await readFile(join(path, entry.name), "utf8"));
      }
    } else {
      texts.push(await readFile(path, "utf8"));
    }
  }
  const joined = texts.join("\n");
  const forbiddenTokens = [
    String.fromCodePoint(0x30b5, 0x30a4, 0x30c8, 0x30a6),
    String.fromCodePoint(0x30ab, 0x30ce, 0x30f3),
    ["609", "1448"].join(""),
    ["011", "23"].join(""),
    String.fromCodePoint(0x672d, 0x5e4c, 0x65ed, 0x4e18),
    ["266062", "011", "23"].join(""),
  ];
  for (const forbidden of forbiddenTokens) {
    assert.equal(joined.includes(forbidden), false, `found forbidden sample token: ${forbidden}`);
  }
});
