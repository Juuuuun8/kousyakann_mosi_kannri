import assert from "node:assert/strict";
import test from "node:test";

import { validatePayloadJson } from "../../../contracts/src/index.ts";
import { runParserPipeline } from "../../core/src/index.ts";
import {
  KAWAI_SCHEMA_VERSION_ID,
  createKawaiSchema,
  detectKawai,
} from "../src/index.ts";

function syntheticKawaiDocument(order = [3, 1, 4, 2]) {
  const texts = {
    1: "河合塾 全統共通テスト模試 成績表 基本情報",
    2: "河合塾 全統共通テスト模試 分野別成績",
    3: "河合塾 全統共通テスト模試 志望校判定",
    4: "河合塾 全統共通テスト模試 解答明細",
  };
  return {
    pageCount: 4,
    pages: order.map((pageNumber) => ({ pageNumber, text: texts[pageNumber], items: [] })),
  };
}

test("synthetic four-page Kawai schema matches regardless of page array order", () => {
  const input = syntheticKawaiDocument();
  const result = runParserPipeline(input, createKawaiSchema(), { parserVersion: "kawai-parser@0.1.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "READY");
  assert.equal(result.detection.schemaVersionId, KAWAI_SCHEMA_VERSION_ID);
  assert.equal(result.extraction?.payloads.length, 1);
  assert.equal(validatePayloadJson(result.normalization?.payloads[0]).ok, true);
  assert.deepEqual(result.normalization?.payloads[0].items.map((item) => item.page), [1, 2, 3, 4]);
});

test("unknown or incomplete Kawai scheme fails closed", () => {
  const input = syntheticKawaiDocument().pages.map((page) => ({ ...page, text: page.text.replace("成績表", "別帳票") }));
  const detected = detectKawai({ pageCount: 4, pages: input });
  assert.equal(detected.status, "NO_MATCH");
  const wrongPageCount = syntheticKawaiDocument().pages.slice(0, 3);
  assert.equal(detectKawai({ pageCount: 3, pages: wrongPageCount }).status, "NO_MATCH");
});

test("image-only four-page document is rejected before extraction", () => {
  const imageOnly = { pageCount: 4, pages: [1, 2, 3, 4].map((pageNumber) => ({ pageNumber, text: "", items: [] })) };
  const result = runParserPipeline(imageOnly, createKawaiSchema(), { parserVersion: "kawai-parser@0.1.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.extraction, null);
});
