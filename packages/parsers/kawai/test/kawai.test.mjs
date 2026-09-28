import assert from "node:assert/strict";
import test from "node:test";

import { validatePayloadJson } from "../../../contracts/src/index.ts";
import { runParserPipeline } from "../../core/src/index.ts";
import { KAWAI_EXAM_EVENT_ID, KAWAI_SCHEMA_VERSION_ID, createKawaiSchema, detectKawai } from "../src/index.ts";

function item(text, x, y) {
  return { text, x, y, width: Math.max(4, text.length * 5), height: 8 };
}

function headerItems(candidate = "12345678") {
  return [
    item("00001", 650, 10), item("合成高校", 690, 10),
    item("3年", 650, 20), item("01", 680, 20), item("クラス", 700, 20), item("00001", 740, 20), item("番", 775, 20),
    item("ゴウセイ", 650, 30), item("セイト", 700, 30), item(candidate, 750, 30),
  ];
}

function syntheticKawaiDocument(order = [3, 1, 4, 2], candidate = "12345678") {
  const sections = {
    1: ["1-(1) 成績概況", "2. 成績推移"],
    2: ["3. 設問別成績"],
    3: ["4. 志望校別成績・評価"],
    4: ["5. 正答・誤答 マーク読み取り状況"],
  };
  const pages = {};
  for (const ordinal of [1, 2, 3, 4]) {
    const title = `河合塾 2026年度第2回全統共通テスト模試 個人成績表（${ordinal}／4）`;
    const sectionItems = sections[ordinal].map((text, index) => item(text, 20, 65 + index * 12));
    const scoreItems = ordinal === 1 ? [
      item("英語 リーディング 68/100 58.2 B 56.2 100/2000 55.1 66.9 80/1500 53.9 66.8 4/200", 20, 105),
      item("数学 I A -/100 50.0 C 48.8 500/2000 47.0 52.5 400/1500 47.5 49.9 20/200", 20, 117),
    ] : [];
    const domainItems = ordinal === 2 ? [
      item("英語", 20, 90), item("あなたと同じ学力レベル層との成績比較", 80, 90),
      item("1", 20, 105), item("合成分野", 40, 105), item("6/10", 100, 105), item("5.0", 140, 105), item("5.5", 170, 105), item("6.0", 200, 105), item("0.0", 230, 105), item("○", 260, 105), item("10.0%", 280, 105), item("1", 330, 105), item("6.5", 350, 105), item("0.5", 380, 105),
    ] : [];
    const items = [item(title, 20, 20), ...headerItems(candidate), ...sectionItems, ...scoreItems, ...domainItems];
    pages[ordinal] = { pageNumber: ordinal, text: [title, ...sections[ordinal], ...items.map((entry) => entry.text)].join(" "), items };
  }
  return { pageCount: 4, pages: order.map((ordinal) => pages[ordinal]) };
}

test("four logical pages are detected independent of physical array order", () => {
  const input = syntheticKawaiDocument();
  const result = runParserPipeline(input, createKawaiSchema(), { parserVersion: "kawai-parser@0.2.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REVIEW");
  assert.equal(result.detection.schemaVersionId, KAWAI_SCHEMA_VERSION_ID);
  assert.equal(result.extraction?.payloads.length, 2);
  assert.equal(validatePayloadJson(result.normalization?.payloads[0]).ok, true);
  assert.deepEqual(result.normalization?.payloads[0].items.map((entry) => entry.page), [1, 2, 3, 4]);
  assert.equal(result.normalization?.report?.examCandidateId, "12345678");
  assert.equal(result.normalization?.report?.examEventId, KAWAI_EXAM_EVENT_ID);
  assert.equal(result.normalization?.subjectScores.length, 2);
  assert.equal(result.normalization?.subjectScores[0].score, 68);
  assert.equal(result.normalization?.subjectScores[0].subjectDefinitionId, "subject.english.reading");
  assert.equal(result.normalization?.subjectScores[1].score, null);
  assert.equal(result.normalization?.subjectScores[1].missingReason, "NOT_TAKEN");
  const domain = result.normalization?.payloads.find((payload) => payload.type === "domain_results");
  assert.equal(validatePayloadJson(domain).ok, true);
  assert.equal(domain?.items.length, 1);
  assert.equal(domain?.items[0].sameAbilityDifference, 0);
  assert.equal(domain?.items[0].nextLevelDifference, 0.5);
});

test("unknown, incomplete, and duplicate logical page schemes fail closed", () => {
  const input = syntheticKawaiDocument();
  const withoutReportLabel = { ...input, pages: input.pages.map((page) => ({ ...page, text: page.text.replaceAll("個人成績表", "別帳票") })) };
  assert.equal(detectKawai(withoutReportLabel).status, "NO_MATCH");
  assert.equal(detectKawai({ pageCount: 3, pages: input.pages.slice(0, 3) }).status, "NO_MATCH");
  const duplicate = structuredClone(input);
  duplicate.pages[3].text = duplicate.pages[3].text.replace("（2／4）", "（1／4）");
  assert.equal(detectKawai(duplicate).status, "NO_MATCH");
});

test("vector-only provider logo does not prevent a uniquely identified schema match", () => {
  const input = syntheticKawaiDocument();
  const withoutProviderText = { ...input, pages: input.pages.map((page) => ({ ...page, text: page.text.replaceAll("河合塾", "") })) };
  const detection = detectKawai(withoutProviderText);
  assert.equal(detection.status, "MATCH");
  assert.ok(detection.evidence.some((entry) => entry.label === "exam_family"));
});

test("mixed candidate pages are rejected before normalization", () => {
  const input = syntheticKawaiDocument();
  const mixed = structuredClone(input);
  const pageFour = mixed.pages.find((page) => page.pageNumber === 4);
  pageFour.items = pageFour.items.map((entry) => entry.text === "12345678" ? { ...entry, text: "87654321" } : entry);
  const result = runParserPipeline(mixed, createKawaiSchema(), { parserVersion: "kawai-parser@0.2.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_MIXED_REPORT_IDENTITY"));
});

test("missing subject rows cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noScores = structuredClone(input);
  const pageOne = noScores.pages.find((page) => page.pageNumber === 1);
  pageOne.items = pageOne.items.filter((entry) => !entry.text.includes("68/100") && !entry.text.includes("-/100"));
  const result = runParserPipeline(noScores, createKawaiSchema(), { parserVersion: "kawai-parser@0.2.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_SUBJECT_SCORES_MISSING"));
});

test("missing domain rows cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noDomains = structuredClone(input);
  const pageTwo = noDomains.pages.find((page) => page.pageNumber === 2);
  pageTwo.items = pageTwo.items.filter((entry) => entry.y !== 105);
  const result = runParserPipeline(noDomains, createKawaiSchema(), { parserVersion: "kawai-parser@0.2.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_DOMAIN_RESULTS_MISSING"));
});

test("image-only four-page document is rejected before extraction", () => {
  const imageOnly = { pageCount: 4, pages: [1, 2, 3, 4].map((pageNumber) => ({ pageNumber, text: "", items: [] })) };
  const result = runParserPipeline(imageOnly, createKawaiSchema(), { parserVersion: "kawai-parser@0.2.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.extraction, null);
});
