import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(file) {
  return readFile(new URL(file, root), "utf8");
}

test("prototype exposes the approved tabs and exception states", async () => {
  const html = await text("index.html");
  const app = await text("src/app.js");
  assert.doesNotThrow(() => new Function(app));
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
  for (const token of ["得点率の分布", "四分位", "同一受験者", "判定遷移", "設問結果の構成", "データ完全率"]) {
    assert.match(app, new RegExp(token));
  }
  assert.doesNotMatch(app, /重点候補|指導対象|推奨指導|指導すべき/);
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
