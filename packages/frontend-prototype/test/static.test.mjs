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

test("dashboard has four purpose-led analysis destinations, one filter area, and no developer state simulator", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(app.replace(/^import .*$/gmu, "")));
  for (const token of ["状況をつかむ", "集団を比べる", "生徒を探す", "志望校を確かめる", "管理機能", "表示するデータ", "比較する指標", "現在の表示条件", "条件を元に戻す"]) assert.match(html, new RegExp(token));
  for (const unwanted of ["SHEET SNAPSHOT", "COMMON FILTER", "DEMO STATE PREVIEW", "Ready", "Suppressed"]) assert.doesNotMatch(`${html}\n${app}`, new RegExp(unwanted));
  assert.match(app, /条件に合うデータがありません/u);
  assert.match(app, /少人数のため集計値を表示しません/u);
  assert.match(app, /fetch\("\.\/data\/demo-dataset\.json"/u);
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|https?:\/\//u);
});

test("analysis exposes decision evidence without prescribing instruction", async () => {
  const app = await text("src/app.js");
  for (const token of ["注目したい事実", "同一指標の推移", "中央値", "中央50%", "中央値とばらつき", "全国平均との差", "同学力帯との差", "第1～第3志望の判定構成", "解答の内訳", "校舎別の登録状況"]) assert.match(app, new RegExp(token));
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

test("demo v5 uses only attached-PDF-confirmed exam fields and supports safe comparison drill-down", async () => {
  const dataset = JSON.parse(await text("data/demo-dataset.json"));
  const app = await text("src/app.js");
  const generator = await text("../../scripts/generate-demo-dataset.mjs");
  assert.equal(dataset.meta.datasetVersion, "demo-sheet.v5");
  assert.equal(dataset.students.length, 72);
  assert.equal(dataset.examEvents.length, 5);
  assert.equal(dataset.examDefinitions.length, 1);
  assert.equal(dataset.examDefinitions[0].id, "kawai.ct");
  assert.equal(dataset.subjectDefinitions.length, 14);
  assert.equal(dataset.domainDefinitions.length, 50);
  assert.equal(dataset.targets.some((row) => row.preferenceOrder === 3), true);
  assert.equal(dataset.targets.every((row) => row.universityId && row.facultyId && row.programId && row.admissionMethodId && row.targetLabelRaw), true);
  assert.equal(dataset.students.every((row) => row.personId && row.identityStatus === "RESOLVED" && row.identityMethod === "ADMIN_CONFIRMED"), true);
  assert.equal(dataset.meta.defaultComparisonSubjectId, "overall-core");
  assert.equal(dataset.capabilityProfiles[0].supports.domains, true);
  assert.equal(dataset.sourceCapabilities.parserStatus, "READY");
  assert.equal(dataset.sourceCapabilities.detectionStatus, "MATCH");
  assert.equal(dataset.sourceCapabilities.summaryMetrics, 14);
  assert.equal(dataset.sourceCapabilities.domainResults, 50);
  assert.equal(dataset.sourceCapabilities.answerMarks, 477);
  for (const unsupported of ["全統記述", "日本史", "世界史", "倫理", "政治経済", "生物", "地学"]) assert.doesNotMatch(JSON.stringify(dataset), new RegExp(unsupported));
  assert.doesNotMatch(`${app}\n${generator}`, /\.course\b|course:|studentRate/u);
  for (const token of ["校舎 × 分野マトリクス", "中央値とばらつき", "生徒一覧", "student-search", "student-sort", "data-person-id", "data-location-drill", "同じ校舎の平均"]) assert.match(app, new RegExp(token));

  const all = createDemoModel(dataset, { suppressionThreshold: 5 });
  assert.equal(all.scope.students, 72);
  assert.equal(all.events.length, 5);
  assert.equal(all.groups.filter((item) => item.kind === "校舎").length, 4);
  assert.equal(all.selectedMetric.id, "overall-core");
  assert.equal(all.studentList.length, 72);
  assert.equal(all.targets.sampleCount > all.targets.studentCount, true);
  assert.equal(all.targets.byPreference.length, 7);

  const english = createDemoModel(dataset, { subjectId: "english-reading", suppressionThreshold: 5 });
  assert.equal(english.answers.count > 0, true);
  assert.equal(english.locationDomains.locations.length, 4);
  assert.equal(english.locationDomains.rows.length, 8);

  const oneLocation = createDemoModel(dataset, { locationIds: ["loc.sapporo"], suppressionThreshold: 5 });
  assert.equal(oneLocation.scope.students, 18);
  const oneSchool = createDemoModel(dataset, { schoolId: "school.1", suppressionThreshold: 10 });
  assert.equal(oneSchool.suppressed, true);
  const commonOnly = createDemoModel(dataset, { definitionId: "kawai.ct", suppressionThreshold: 5 });
  assert.equal(commonOnly.events.length, 5);
  assert.equal(Object.hasOwn(all.registration.progress[0], "expected"), false);

  const mlRows = createMlDemoRows(dataset, all);
  assert.equal(mlRows.length, dataset.scores.filter((row) => row.subjectId === dataset.meta.defaultComparisonSubjectId).length);
  assert.equal(mlRows.every((row) => row.ML_ID.startsWith("ML-") && !("PersonID" in row) && !("DisplayLabel" in row) && row.MetricDefinitionID), true);
});
