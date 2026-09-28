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
      item("英語 リーディング * 68/100 58.2 B 56.2 100/2000 55.1 66.9 80/1500 53.9 66.8 4/200", 20, 105),
      item("数学 I A -/100 50.0 C 48.8 500/2000 47.0 52.5 400/1500 47.5 49.9 20/200", 20, 117),
      item("共通テスト換算得点", 520, 73), item("私大評価用偏差値", 650, 73),
      item("英語", 520, 90), item("75/100", 580, 90), item("数学1科目", 650, 90), item("56.5", 710, 90),
      item("数学IA", 520, 102), item("-/100", 580, 102), item("国語型", 650, 102), item("54.2", 710, 102),
      item("第1回全統共通テスト模試", 20, 250), item("第2回全統共通テスト模試", 270, 250),
      item("科目", 20, 270), item("得点", 95, 270), item("偏差値", 135, 270), item("レベル", 180, 270),
      item("科目", 270, 270), item("得点", 345, 270), item("偏差値", 385, 270), item("レベル", 430, 270),
      item("英語", 20, 285), item("60", 95, 285), item("55.1", 135, 285), item("B", 180, 285),
      item("数学IA", 20, 297), item("50", 95, 297), item("51.0", 135, 297), item("C", 180, 297),
      item("英語", 270, 285), item("68", 345, 285), item("58.2", 385, 285), item("B", 430, 285),
    ] : [];
    const domainItems = ordinal === 2 ? [
      item("英語", 20, 90), item("あなたと同じ学力レベル層との成績比較", 80, 90),
      item("1", 20, 105), item("合成分野", 40, 105), item("6/10", 100, 105), item("5.0", 140, 105), item("5.5", 170, 105), item("6.0", 200, 105), item("0.0", 230, 105), item("○", 260, 105), item("10.0%", 280, 105), item("1", 330, 105), item("6.5", 350, 105), item("0.5", 380, 105),
      item("合成科目講評一行目", 210, 140), item("合成科目講評二行目。", 210, 148),
      item("理科", 20, 180), item("あなたと同じ学力レベル層との成績比較", 80, 180), item("学力レベル", 210, 230),
    ] : [];
    const targetItems = ordinal === 3 ? [
      item("第1志望", 90, 90), item("第2志望", 230, 90), item("第3志望", 370, 90), item("第4志望", 510, 90), item("第5志望", 650, 90),
      item("第6志望", 90, 430), item("第7志望", 230, 430), item("第8志望", 370, 430), item("第9志望", 510, 430),
      item("前", 35, 105), item("合成大学", 70, 105), item("A", 160, 105),
      item("合成学部", 70, 115), item("合成方式", 70, 125), item("定員(20)", 135, 125),
      item("あなたの偏差値", 35, 140), item("55.0点", 80, 140), item("(1000)", 80, 150),
      item("ボーダーライン", 35, 160), item("70点", 80, 160),
      item("1/10", 45, 178), item("2/20", 90, 178), item("50.0点", 45, 188), item("51.0点", 90, 188),
      item("英語", 35, 215), item("55.0", 55, 215), item("80", 77, 215), item("100", 92, 215), item("A70～", 110, 215), item("3", 132, 215),
      item("未満", 110, 225), item("7", 132, 225),
    ] : [];
    const answerItems = ordinal === 4 ? [
      item("リーディング", 50, 100),
      item("大問番号", 100, 90), item("1", 150, 90),
      item("解答番号", 100, 98), item("1", 150, 98), item("2", 165, 98),
      item("正", 100, 106), item("誤", 108, 106), item("○", 150, 106), item("N", 165, 106),
      item("マーク", 100, 114), item("1", 150, 114), item("2", 165, 114),
    ] : [];
    const items = [item(title, 20, 20), ...headerItems(candidate), ...sectionItems, ...scoreItems, ...domainItems, ...targetItems, ...answerItems];
    pages[ordinal] = { pageNumber: ordinal, text: [title, ...sections[ordinal], ...items.map((entry) => entry.text)].join(" "), items };
  }
  return { pageCount: 4, pages: order.map((ordinal) => pages[ordinal]) };
}

test("four logical pages are detected independent of physical array order", () => {
  const input = syntheticKawaiDocument();
  const result = runParserPipeline(input, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "READY");
  assert.equal(result.detection.schemaVersionId, KAWAI_SCHEMA_VERSION_ID);
  assert.equal(result.extraction?.payloads.length, 4);
  assert.equal(validatePayloadJson(result.normalization?.payloads[0]).ok, true);
  assert.equal(result.normalization?.payloads.some((payload) => payload.type === "raw_labels"), false);
  assert.equal(result.normalization?.report?.examCandidateId, "12345678");
  assert.equal(result.normalization?.report?.examEventId, KAWAI_EXAM_EVENT_ID);
  assert.equal(result.normalization?.subjectScores.length, 6);
  assert.equal(result.normalization?.report?.subjectCount, 6);
  assert.equal(result.normalization?.subjectScores[0].score, 68);
  assert.equal(result.normalization?.subjectScores[0].subjectDefinitionId, "subject.english.reading");
  assert.equal(result.normalization?.subjectScores[0].attentionCodeRaw, "*");
  assert.equal(result.normalization?.subjectScores[1].score, null);
  assert.equal(result.normalization?.subjectScores[1].missingReason, "NOT_TAKEN");
  const converted = result.normalization?.subjectScores.filter((score) => score.metricDefinitionId === "metric.kawai.common-test-converted-score");
  assert.equal(converted?.length, 2);
  assert.equal(converted?.[0].score, 75);
  const privateDeviations = result.normalization?.subjectScores.filter((score) => score.metricDefinitionId === "metric.kawai.private-university-deviation");
  assert.equal(privateDeviations?.length, 2);
  assert.equal(privateDeviations?.[0].deviation, 56.5);
  const trend = result.normalization?.payloads.find((payload) => payload.type === "trend");
  assert.equal(trend?.items.length, 3);
  assert.equal(trend?.items[0].examEventIdRaw, "第1回全統共通テスト模試");
  assert.equal(trend?.items[0].score, 60);
  const domain = result.normalization?.payloads.find((payload) => payload.type === "domain_results");
  assert.equal(validatePayloadJson(domain).ok, true);
  assert.equal(domain?.items.length, 1);
  assert.equal(domain?.commentaryRaw, "合成科目講評一行目\n合成科目講評二行目。");
  assert.equal(domain?.items[0].sameAbilityDifference, 0);
  assert.equal(domain?.items[0].nextLevelDifference, 0.5);
  const targets = result.normalization?.payloads.find((payload) => payload.type === "targets");
  assert.equal(validatePayloadJson(targets).ok, true);
  assert.equal(targets?.items.length, 1);
  assert.equal(targets?.items[0].universityRaw, "合成大学");
  assert.equal(targets?.items[0].firstChoicePopulation, 10);
  assert.equal(targets?.items[0].subjectResults[0].personalScore, 80);
  assert.equal(targets?.items[0].evaluationBands[0].judgementRaw, "A");
  const answerMarks = result.normalization?.payloads.find((payload) => payload.type === "answer_marks");
  assert.equal(validatePayloadJson(answerMarks).ok, true);
  assert.equal(answerMarks?.items.length, 2);
  assert.deepEqual(answerMarks?.items[0], [1, "1", "○", "CORRECT", "1", null]);
  assert.deepEqual(answerMarks?.items[1], [1, "2", "N", "NO_ANSWER", "2", null]);
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
  const result = runParserPipeline(mixed, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_MIXED_REPORT_IDENTITY"));
});

test("missing subject rows cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noScores = structuredClone(input);
  const pageOne = noScores.pages.find((page) => page.pageNumber === 1);
  pageOne.items = pageOne.items.filter((entry) => !entry.text.includes("68/100") && !entry.text.includes("-/100"));
  const result = runParserPipeline(noScores, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_SUBJECT_SCORES_MISSING"));
});

test("missing domain rows cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noDomains = structuredClone(input);
  const pageTwo = noDomains.pages.find((page) => page.pageNumber === 2);
  pageTwo.items = pageTwo.items.filter((entry) => entry.y !== 105);
  const result = runParserPipeline(noDomains, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_DOMAIN_RESULTS_MISSING"));
});

test("missing target slots cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noTargets = structuredClone(input);
  const pageThree = noTargets.pages.find((page) => page.pageNumber === 3);
  pageThree.items = pageThree.items.filter((entry) => !/第\d志望/u.test(entry.text));
  const result = runParserPipeline(noTargets, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_TARGET_SLOTS_MISSING"));
});

test("nine blank target slots are accepted as a legitimate zero-target report", () => {
  const input = syntheticKawaiDocument();
  const blank = structuredClone(input);
  const pageThree = blank.pages.find((page) => page.pageNumber === 3);
  pageThree.items = pageThree.items.filter((entry) => /第\d志望/u.test(entry.text) || entry.y < 90);
  const result = runParserPipeline(blank, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "READY");
  assert.equal(result.normalization?.payloads.find((payload) => payload.type === "targets")?.items.length, 0);
});

test("missing answer marks cannot be registered as a successful parse", () => {
  const input = syntheticKawaiDocument();
  const noAnswers = structuredClone(input);
  const pageFour = noAnswers.pages.find((page) => page.pageNumber === 4);
  pageFour.items = pageFour.items.filter((entry) => ![90, 98, 106, 114].includes(entry.y));
  const result = runParserPipeline(noAnswers, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.ok(result.validation?.issues.some((entry) => entry.code === "KAWAI_ANSWER_MARKS_MISSING"));
});

test("image-only four-page document is rejected before extraction", () => {
  const imageOnly = { pageCount: 4, pages: [1, 2, 3, 4].map((pageNumber) => ({ pageNumber, text: "", items: [] })) };
  const result = runParserPipeline(imageOnly, createKawaiSchema(), { parserVersion: "kawai-parser@0.6.0", normalizationVersion: "normalization@0.1.0" });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.extraction, null);
});
