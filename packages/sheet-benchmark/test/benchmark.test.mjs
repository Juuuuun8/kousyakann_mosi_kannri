import assert from "node:assert/strict";
import test from "node:test";

import { makeSyntheticDataset } from "../../test-fixtures/src/generator.ts";
import { benchmarkSyntheticDataset } from "../src/benchmark.ts";

test("row and JSON layouts are comparable without losing payload items", () => {
  const dataset = makeSyntheticDataset({ reportCount: 10, subjectsPerReport: 3, itemsPerSubject: 100 });
  const result = benchmarkSyntheticDataset(dataset, { jsonMaxChars: 1200 });

  assert.equal(result.payloadCount, dataset.payloadBindings.length);
  assert.ok(result.chunkCount > result.payloadCount);
  assert.equal(result.roundTripValid, true);
  assert.ok(result.jsonForm.logicalCells < result.rowForm.logicalCells);
  assert.ok(result.logicalCellReductionRatio > 0);
  assert.ok(result.jsonForm.textCharacters >= result.rowForm.textCharacters * 0.5);
});

test("benchmark rejects an invalid cell-size setting", () => {
  const dataset = makeSyntheticDataset({ reportCount: 1, subjectsPerReport: 1, itemsPerSubject: 1 });
  assert.throws(() => benchmarkSyntheticDataset(dataset, { jsonMaxChars: 0 }), /jsonMaxChars must be a positive integer/);
});
