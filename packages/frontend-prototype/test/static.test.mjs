import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { subjectTableModel, targetSummaryModel } from "../src/analytics-view-model.js";
import { syntheticSubjectResult, syntheticTargetResult } from "../src/synthetic-analytics-results.js";

const root = new URL("../", import.meta.url);

async function text(file) {
  return readFile(new URL(file, root), "utf8");
}

test("prototype exposes the approved tabs and exception states", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  assert.doesNotThrow(() => new Function(app.replace(/^import .*$/gmu, "")));
  for (const token of ["概要", "校舎・学校比較", "科目・分野", "志望校", "個人詳細", "データ管理", "ML出力"]) assert.match(html, new RegExp(token));
  for (const state of ["loading", "empty", "suppressed", "partial", "schema", "permission"]) assert.match(app, new RegExp(state));
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|fetch\(/);
});

test("prototype has no direct student identifiers in aggregate display code", async () => {
  const app = await text("src/app.js");
  assert.doesNotMatch(app, /studentNameKanaRaw|ImportedBy|email/i);
});

test("analysis shows decision evidence without prescribing instruction", async () => {
  const app = await text("src/app.js");
  for (const token of ["得点率の分布", "四分位", "同一受験者", "平均ボーダー差", "母数", "データ完全率"]) {
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
