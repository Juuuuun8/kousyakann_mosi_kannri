import assert from "node:assert/strict";
import test from "node:test";

import { runParserPipeline, validatePageSet } from "../src/index.ts";

const schemaVersionId = "synthetic.provider.exam.v1";

function document(texts = ["SYNTHETIC 1", "SYNTHETIC 2"]) {
  return {
    pageCount: texts.length,
    pages: texts.map((text, index) => ({ pageNumber: index + 1, text, items: [] })),
  };
}

function schema(overrides = {}) {
  return {
    schemaVersionId,
    detect(input) {
      const matched = input.pages.some((page) => page.text.includes("SYNTHETIC"));
      return matched
        ? { status: "MATCH", schemaVersionId, confidence: 1, evidence: [], issues: [] }
        : { status: "NO_MATCH", schemaVersionId: null, confidence: 0, evidence: [], issues: [] };
    },
    extract(input) {
      return { status: "EXTRACTED", schemaVersionId, fields: [{ key: "page_count", rawValue: String(input.pageCount), pageNumber: null, sourceLabel: null }], payloads: [], evidence: [], issues: [] };
    },
    validate() { return { status: "VALID", issues: [] }; },
    normalize(_input, extraction) {
      return { status: "READY", fields: extraction.fields.map((field) => ({ ...field, normalizedValue: field.rawValue, missingReason: null })), subjectScores: [], report: null, payloads: [], issues: [] };
    },
    ...overrides,
  };
}

test("pipeline keeps four stages independent and returns ready only after validation", () => {
  const result = runParserPipeline(document(), schema(), { parserVersion: "synthetic-parser@1", normalizationVersion: "synthetic-normalization@1" });
  assert.equal(result.status, "READY");
  assert.equal(result.detection.status, "MATCH");
  assert.equal(result.extraction?.status, "EXTRACTED");
  assert.equal(result.validation?.status, "VALID");
});

test("unknown documents fail closed before extraction", () => {
  const result = runParserPipeline(document(["UNRELATED", "TEXT"]), schema(), { parserVersion: "synthetic-parser@1", normalizationVersion: "synthetic-normalization@1" });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.extraction, null);
});

test("invalid validation prevents normalization and registration", () => {
  const result = runParserPipeline(document(), schema({ validate() { return { status: "INVALID", issues: [{ code: "UNKNOWN_LABEL", severity: "FATAL", message: "unknown", pageNumber: 1, field: "x" }] }; } }), { parserVersion: "synthetic-parser@1", normalizationVersion: "synthetic-normalization@1" });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.normalization, null);
});

test("page set validator rejects duplicate, missing, and image-only pages", () => {
  const duplicate = { pageCount: 2, pages: [{ pageNumber: 1, text: "x", items: [] }, { pageNumber: 1, text: "y", items: [] }] };
  const duplicateIssues = validatePageSet(duplicate, { expectedPageCount: 2 });
  assert.ok(duplicateIssues.some((item) => item.code === "DUPLICATE_PAGE"));
  const imageOnly = { pageCount: 2, pages: [{ pageNumber: 1, text: "", items: [] }, { pageNumber: 2, text: "", items: [] }] };
  assert.ok(validatePageSet(imageOnly, { expectedPageCount: 2 }).some((item) => item.code === "NO_TEXT_LAYER"));
});
