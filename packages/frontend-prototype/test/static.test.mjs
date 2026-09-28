import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateAnalyticsResult } from "../../analytics-contracts/src/index.ts";
import { answerCompositionModel, comparisonSummaryModel, domainTableModel, domainTrendModel, subjectTableModel, targetSummaryModel } from "../src/analytics-view-model.js";
import { createDemoModel, createMlDemoRows } from "../src/demo-engine.js";
import { syntheticAnswerResult, syntheticComparisonResult, syntheticDomainComparisonResult, syntheticDomainResult, syntheticSubjectResult, syntheticTargetResult } from "../src/synthetic-analytics-results.js";

const root = new URL("../", import.meta.url);

test("every synthetic screen result satisfies the runtime analytics contract", () => {
  for (const result of [syntheticSubjectResult, syntheticTargetResult, syntheticComparisonResult, syntheticDomainResult, syntheticDomainComparisonResult, syntheticAnswerResult]) {
    assert.deepEqual(validateAnalyticsResult(result), { ok: true, issues: [] });
  }
});

async function text(file) {
  return readFile(new URL(file, root), "utf8");
}

test("prototype exposes the approved tabs and exception states", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(app.replace(/^import .*$/gmu, "")));
  for (const token of ["概要", "校舎・学校比較", "科目・分野", "志望校", "個人詳細", "データ管理", "ML出力"]) assert.match(html, new RegExp(token));
  for (const state of ["loading", "empty", "suppressed", "partial", "schema", "permission"]) assert.match(app, new RegExp(state));
  assert.match(app, /fetch\("\.\/data\/demo-dataset\.json"/u);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|https?:\/\//u);
});

test("prototype has no direct student identifiers in aggregate display code", async () => {
  const app = await text("src/app.js");
  assert.doesNotMatch(app, /studentNameKanaRaw|ImportedBy|email/i);
});

test("analysis shows decision evidence without prescribing instruction", async () => {
  const app = await text("src/app.js");
  for (const token of ["得点率の分布", "四分位", "同一受験者", "ボーダー差", "対象生徒", "品質サマリ"]) {
    assert.match(app, new RegExp(token));
  }
  assert.doesNotMatch(app, /重点候補|指導対象|推奨指導|指導すべき/);
});

test("analytics result adapters expose evidence and suppression without direct identifiers", () => {
  const rows = subjectTableModel(syntheticSubjectResult);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].mean, "71.3%");
  assert.equal(rows[0].median, "73.0%");
  assert.equal(rows[0].sampleCount, 120);
  const target = targetSummaryModel(syntheticTargetResult);
  assert.equal(target.sampleCount, 106);
  assert.equal(target.borderGap, "-4.0点");
  assert.equal(JSON.stringify({ rows, target }).includes("studentName"), false);

  const suppressed = structuredClone(syntheticSubjectResult);
  suppressed.groups[0].metrics = suppressed.groups[0].metrics.map((metric) => ({ ...metric, value: null, quantiles: null, points: [], suppressed: true, suppressionReason: "SMALL_GROUP" }));
  assert.match(subjectTableModel(suppressed)[0].mean, /抑制/);
  assert.equal(subjectTableModel(suppressed)[0].median, "抑制");

  const comparison = comparisonSummaryModel(syntheticComparisonResult);
  assert.equal(comparison.comparableCount, 98);
  assert.equal(comparison.excludedCount, 12);
  assert.equal(comparison.scoreRateChange, "+3.1pt");
  assert.equal(comparison.nationalGapChange, "+1.8pt");
  assert.equal(comparison.baselineBands.length, 4);

  const domains = domainTableModel(syntheticDomainResult, { "domain.synthetic.probability": "確率" });
  assert.equal(domains[0].label, "確率");
  assert.equal(domains[0].scoreRate, "57.0%");
  assert.equal(domains[0].missingCount, 3);
  const domainTrends = domainTrendModel(syntheticDomainComparisonResult);
  assert.equal(domainTrends[0].change, "+5.4pt");
  assert.equal(domainTrends[0].comparableCount, 92);
  assert.equal(domainTrends[0].excludedCount, 10);

  const answers = answerCompositionModel(syntheticAnswerResult);
  assert.equal(answers.sampleCount, 101);
  assert.equal(answers.parts.reduce((sum, part) => sum + (part.rate ?? 0), 0), 1);
  assert.equal(answers.parts.find((part) => part.label === "余分マーク")?.rate, .01);
});

test("login prototype does not persist or transmit credentials", async () => {
  const html = await text("login.html");
  const script = await text("src/login.js");
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /平文パスワードを権限管理シートへ保存せず/);
  assert.match(script, /querySelector\("#password"\)\.value = ""/);
  assert.doesNotMatch(`${html}\n${script}`, /localStorage|sessionStorage|indexedDB|fetch\(|console\./);
});

test("upload prototype keeps PDF handling local and fails closed before parser connection", async () => {
  const html = await text("upload.html");
  const script = await text("src/upload.js");
  assert.match(html, /登録校舎/u);
  assert.match(html, /accept="application\/pdf,.pdf"/u);
  assert.match(html, /id="register"[^>]+disabled/u);
  assert.match(script, /file\.arrayBuffer\(\)/u);
  assert.match(script, /crypto\.subtle\.digest\("SHA-256"/u);
  assert.match(script, /fileInput\.value = ""/u);
  assert.doesNotMatch(script, /fetch\(|FormData|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\./u);
  assert.doesNotMatch(html, /id="file-name"/u);
});

test("prototype declares keyboard tab semantics and restrictive static headers", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  const headers = await text("_headers");
  assert.match(html, /role="tablist"/u);
  assert.match(html, /role="tabpanel"/u);
  assert.match(app, /ArrowLeft/u);
  assert.match(app, /aria-selected/u);
  for (const token of ["frame-ancestors 'none'", "connect-src 'self'", "X-Content-Type-Options: nosniff", "Cache-Control: no-store"]) assert.match(headers, new RegExp(token));
});

test("ML export prototype requires purpose and explicit handling confirmation", async () => {
  const app = await text("src/app.js");
  assert.match(app, /id="export-purpose"/u);
  assert.match(app, /id="export-confirm"/u);
  assert.match(app, /id="export-button"[^>]+disabled/u);
  assert.match(app, /用途限定、適切な保存、利用後の削除/u);
});

test("demo sheet snapshot recomputes filters, suppression, missingness, and ML rows", async () => {
  const dataset = JSON.parse(await text("data/demo-dataset.json"));
  const all = createDemoModel(dataset, { suppressionThreshold: 5 });
  assert.equal(all.overview.students, 24);
  assert.equal(all.overview.missingCount, 1);
  assert.equal(all.comparison.comparableCount, 24);
  assert.equal(all.groups.filter((item) => item.kind === "校舎").length, 3);

  const oneLocation = createDemoModel(dataset, { locationId: "loc.sapporo", suppressionThreshold: 5 });
  assert.equal(oneLocation.overview.students, 8);
  const oneSchool = createDemoModel(dataset, { schoolId: "school.north", suppressionThreshold: 5 });
  assert.equal(oneSchool.overview.students, 4);
  assert.equal(oneSchool.suppressed, true);

  const mlRows = createMlDemoRows(dataset, all);
  assert.equal(mlRows.length, 168);
  assert.equal(mlRows.every((row) => row.ML_ID.startsWith("demo_ml_") && !("PersonID" in row) && !("DisplayLabel" in row)), true);
});
