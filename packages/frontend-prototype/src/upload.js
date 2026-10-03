import { validPdfHeader } from "./upload-validation.js";
const fileInput = document.querySelector("#pdf-file"), location = document.querySelector("#location"), fileState = document.querySelector("#file-state"), typeResult = document.querySelector("#type-result"), hashResult = document.querySelector("#hash-result"), message = document.querySelector("#upload-message");
let generation = 0;
function show(title, body, tone = "") { message.className = `notice ${tone}`; message.querySelector("h3").textContent = title; message.querySelector("p").textContent = body; }
function clearMemory() {
  generation += 1; fileInput.value = ""; fileState.textContent = "未選択"; fileState.className = "status"; typeResult.textContent = "未確認"; hashResult.textContent = "未計算";
  show("登録機能は本番未接続です", "この公開デモでは形式確認のみ行い、成績の解析・送信・登録は行いません。PDF本体を外部へ送信しません。");
}
location.addEventListener("change", () => { document.querySelector("#location-result").textContent = location.value ? location.selectedOptions[0].textContent : "未選択"; });
document.querySelector("#clear-file").addEventListener("click", clearMemory);
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0]; clearMemory(); if (!file) return;
  const current = generation; let buffer;
  fileState.textContent = "ブラウザ内で形式確認中";
  try {
    if (!location.value) throw new Error("先に登録校舎を選んでください。");
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) || file.size < 5 || file.size > 20 * 1024 * 1024) throw new Error("20MB以下のPDFファイルを選んでください。");
    buffer = await file.arrayBuffer();
    if (current !== generation) return;
    if (!validPdfHeader(new Uint8Array(buffer))) throw new Error("PDFの形式を確認できません。拡張子だけを変更したファイルは受け付けません。");
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    if (current !== generation) return;
    typeResult.textContent = "PDFのヘッダーを確認（帳票内容は未解析）";
    hashResult.textContent = `${[...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("").slice(0, 12)}…`;
    fileState.textContent = "形式確認のみ完了"; fileState.className = "status warning";
    show("成績の解析・登録は未接続です", "ファイルは送信していません。PDFヘッダーの確認は、対応帳票・文字レイヤ・ページ構成の検証とは異なります。登録ボタンは無効のままです。", "warn");
  } catch (error) {
    if (current !== generation) return;
    typeResult.textContent = "確認できませんでした"; hashResult.textContent = "未計算"; fileState.textContent = "登録不可"; fileState.className = "status warning";
    show("ファイルを確認できません", `${error instanceof Error && ["先に登録校舎を選んでください。", "20MB以下のPDFファイルを選んでください。", "PDFの形式を確認できません。拡張子だけを変更したファイルは受け付けません。"].includes(error.message) ? error.message : "読込に失敗しました。選び直してください。"} ファイルは送信していません。`, "danger");
  } finally { if (buffer) new Uint8Array(buffer).fill(0); }
});
