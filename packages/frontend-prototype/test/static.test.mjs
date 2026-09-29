import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateAnalyticsResult } from "../../analytics-contracts/src/index.ts";
import { answerCompositionModel, comparisonSummaryModel, domainTableModel, domainTrendModel, subjectTableModel, targetSummaryModel } from "../src/analytics-view-model.js";
import { createDemoModel, createMlDemoRows } from "../src/demo-engine.js";
import { syntheticAnswerResult, syntheticComparisonResult, syntheticDomainComparisonResult, syntheticDomainResult, syntheticSubjectResult, syntheticTargetResult } from "../src/synthetic-analytics-results.js";

const root = new URL("../", import.meta.url);
const text = (file) => readFile(new URL(file, root), "utf8");

test("every synthetic screen result satisfies the runtime analytics contract", () => {
  for (const result of [syntheticSubjectResult, syntheticTargetResult, syntheticComparisonResult, syntheticDomainResult, syntheticDomainComparisonResult, syntheticAnswerResult]) assert.deepEqual(validateAnalyticsResult(result), { ok: true, issues: [] });
});

test("dashboard has plain-language navigation, one filter area, and no developer state simulator", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(app.replace(/^import .*$/gmu, "")));
  for (const token of ["現在地", "比較", "教科・設問", "志望校", "生徒", "登録状況", "ML用出力", "表示するデータ", "条件を元に戻す"]) assert.match(html, new RegExp(token));
  for (const unwanted of ["SHEET SNAPSHOT", "COMMON FILTER", "DEMO STATE PREVIEW", "Ready", "Suppressed"]) assert.doesNotMatch(`${html}\n${app}`, new RegExp(unwanted));
  assert.match(app, /条件に合うデータがありません/u);
  assert.match(app, /少人数のため集計値を表示しません/u);
  assert.match(app, /fetch\("\.\/data\/demo-dataset\.json"/u);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|https?:\/\//u);
});

test("analysis exposes decision evidence without prescribing instruction", async () => {
  const app = await text("src/app.js");
  for (const token of ["注目したい変化", "平均得点率の推移", "中央値", "中央50%", "同じ生徒だけで比較", "全国平均との差", "同学力帯平均との差", "ボーダーまでの差", "正答・誤答・無回答", "登録進捗"]) assert.match(app, new RegExp(token));
  assert.match(app, /次に誰へ何を指導するかは担当者が判断/u);
  assert.doesNotMatch(app, /重点候補|指導対象|推奨指導|指導すべき/u);
});

test("aggregate display code does not reference direct identifiers", async () => {
  const app = await text("src/app.js");
  assert.doesNotMatch(app, /studentNameKanaRaw|ImportedBy|email/i);
});

test("analytics adapters retain evidence and suppression", () => {
  const rows = subjectTableModel(syntheticSubjectResult);
  assert.equal(rows[0].mean, "71.3%");
  assert.equal(rows[0].median, "73.0%");
  const target = targetSummaryModel(syntheticTargetResult);
  assert.equal(target.sampleCount, 106);
  const comparison = comparisonSummaryModel(syntheticComparisonResult);
  assert.equal(comparison.comparableCount, 98);
  assert.equal(comparison.excludedCount, 12);
  const domains = domainTableModel(syntheticDomainResult, { "domain.synthetic.probability": "確率" });
  assert.equal(domains[0].label, "確率");
  assert.equal(domainTrendModel(syntheticDomainComparisonResult)[0].comparableCount, 92);
  assert.equal(answerCompositionModel(syntheticAnswerResult).parts.find((part) => part.label === "余分マーク")?.rate, .01);
});

test("sample login remains local with native fallback", async () => {
  const html = await text("login.html");
  const script = await text("src/login.js");
  assert.match(html, /autocomplete="username"/u);
  assert.match(html, /autocomplete="current-password"/u);
  assert.match(html, /action="\.\/dashboard\.html" method="get"/u);
  assert.match(script, /event\.preventDefault\(\)/u);
  assert.doesNotMatch(`${html}\n${script}`, /localStorage|sessionStorage|indexedDB|fetch\(|console\./u);
});

test("upload prototype keeps PDF local and fails closed", async () => {
  const html = await text("upload.html");
  const script = await text("src/upload.js");
  assert.match(html, /登録校舎/u);
  assert.match(html, /accept="application\/pdf,.pdf"/u);
  assert.match(html, /id="register"[^>]+disabled/u);
  assert.match(script, /file\.arrayBuffer\(\)/u);
  assert.match(script, /crypto\.subtle\.digest\("SHA-256"/u);
  assert.doesNotMatch(script, /fetch\(|FormData|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\./u);
});

test("dashboard has keyboard semantics and restrictive static headers", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  const headers = await text("_headers");
  assert.match(html, /role="tablist"/u);
  assert.match(html, /role="tabpanel"/u);
  assert.match(html, /class="skip-link"/u);
  assert.match(app, /ArrowDown/u);
  assert.match(app, /aria-selected/u);
  for (const token of ["frame-ancestors 'none'", "connect-src 'self'", "X-Content-Type-Options: nosniff", "Cache-Control: no-store"]) assert.match(headers, new RegExp(token));
});

test("ML export requires purpose and explicit handling confirmation", async () => {
  const app = await text("src/app.js");
  assert.match(app, /id="export-purpose"/u);
  assert.match(app, /id="export-confirm"/u);
  assert.match(app, /id="export-button"[^>]+disabled/u);
  assert.match(app, /用途を限定し、適切に保存し、不要になったら削除/u);
});

test("demo v2 supports multiple exams, broad subjects, filters, suppression, and ML rows", async () => {
  const dataset = JSON.parse(await text("data/demo-dataset.json"));
  assert.equal(dataset.meta.datasetVersion, "demo-sheet.v2");
  assert.equal(dataset.students.length, 72);
  assert.equal(dataset.examEvents.length, 5);
  assert.equal(dataset.examDefinitions.length, 2);
  assert.equal(dataset.subjectDefinitions.length, 18);
  assert.equal(dataset.domainDefinitions.length >= 25, true);
  assert.equal(dataset.targets.some((row) => row.preferenceOrder === 3), true);
  assert.equal(dataset.sourceCapabilities.answerMarks, 477);

  const all = createDemoModel(dataset, { suppressionThreshold: 5 });
  assert.equal(all.scope.students, 72);
  assert.equal(all.events.length, 5);
  assert.equal(all.groups.filter((item) => item.kind === "校舎").length, 4);
  assert.equal(all.answers.count > 9000, true);

  const oneLocation = createDemoModel(dataset, { locationId: "loc.sapporo", suppressionThreshold: 5 });
  assert.equal(oneLocation.scope.students, 18);
  const oneSchool = createDemoModel(dataset, { schoolId: "school.1", suppressionThreshold: 10 });
  assert.equal(oneSchool.suppressed, true);
  const commonOnly = createDemoModel(dataset, { definitionId: "kawai.ct", suppressionThreshold: 5 });
  assert.equal(commonOnly.events.length, 3);

  const mlRows = createMlDemoRows(dataset, all);
  assert.equal(mlRows.length, dataset.scores.length);
  assert.equal(mlRows.every((row) => row.ML_ID.startsWith("demo_ml_") && !("PersonID" in row) && !("DisplayLabel" in row)), true);
});
