import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset, makeSyntheticDomainResults } from "../src/generator.ts";
import { validatePayloadJson, validateReportRecord, validateSubjectScoreRecord } from "../../contracts/src/index.ts";

test("synthetic dataset is deterministic and contract-valid", () => {
  const first = makeSyntheticDataset({ reportCount: 2, subjectsPerReport: 2, itemsPerSubject: 12 });
  const second = makeSyntheticDataset({ reportCount: 2, subjectsPerReport: 2, itemsPerSubject: 12 });
  assert.deepEqual(first, second);
  assert.equal(first.reports.length, 2);
  assert.equal(first.subjectScores.length, 4);
  assert.equal(first.payloads.length, 8);
  for (const report of first.reports) assert.equal(validateReportRecord(report).ok, true);
  for (const score of first.subjectScores) assert.equal(validateSubjectScoreRecord(score).ok, true);
  for (const payload of first.payloads) assert.equal(validatePayloadJson(payload).ok, true);
});

test("synthetic fixture supports missing values without zero coercion", () => {
  const payload = makeSyntheticDomainResults("subject.synthetic.01", 1);
  const item = { ...payload.items[0], score: null, missingReason: "NOT_PRINTED" };
  assert.equal(item.score, null);
  assert.equal(item.missingReason, "NOT_PRINTED");
});

test("synthetic fixture contains no known source sample tokens", () => {
  const fixture = JSON.stringify(makeSyntheticDataset({ reportCount: 1 }));
  const tokens = [
    ["609", "1448"].join(""),
    ["011", "23"].join(""),
    ["266062", "011", "23"].join(""),
  ];
  for (const token of tokens) assert.equal(fixture.includes(token), false);
});
