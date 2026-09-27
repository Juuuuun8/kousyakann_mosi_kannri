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
  for (const token of ["概要", "校舎・学校比較", "科目・分野", "志望校", "個人詳細", "データ管理", "ML出力"]) assert.match(html, new RegExp(token));
  for (const state of ["loading", "empty", "suppressed", "partial", "schema", "permission"]) assert.match(app, new RegExp(state));
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|fetch\(/);
});

test("prototype has no direct student identifiers in aggregate display code", async () => {
  const app = await text("src/app.js");
  assert.doesNotMatch(app, /studentNameKanaRaw|ImportedBy|email/i);
});
