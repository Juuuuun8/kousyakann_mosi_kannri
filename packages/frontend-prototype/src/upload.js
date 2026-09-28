const fileInput = document.querySelector("#pdf-file");
const location = document.querySelector("#location");
const fileState = document.querySelector("#file-state");
const typeResult = document.querySelector("#type-result");
const hashResult = document.querySelector("#hash-result");
const locationResult = document.querySelector("#location-result");
const message = document.querySelector("#upload-message");

function clearMemory() {
  fileInput.value = "";
  fileState.textContent = "未選択";
  fileState.className = "status-pill";
  typeResult.textContent = "未確認";
  hashResult.textContent = "未計算";
  message.className = "notice";
  message.querySelector("h3").textContent = "対応帳票を確認します";
  message.querySelector("p").textContent = "初期対象は河合塾・全統共通テスト模試です。未知スキーム、画像のみ、必須ページ不足は推測登録せず停止します。";
}

function hex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }

location.addEventListener("change", () => { locationResult.textContent = location.selectedOptions[0]?.textContent ?? "未選択"; });
document.querySelector("#clear-file").addEventListener("click", clearMemory);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return clearMemory();
  fileState.textContent = "ブラウザ内確認中";
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf || file.size === 0 || file.size > 20 * 1024 * 1024) {
    fileInput.value = "";
    fileState.textContent = "拒否";
    fileState.className = "status-pill danger";
    typeResult.textContent = "非対応";
    message.className = "notice danger";
    message.querySelector("h3").textContent = "PDFを確認できません";
    message.querySelector("p").textContent = "PDF形式、ファイルサイズ、文字レイヤを確認してください。ファイル本体は送信していません。";
    return;
  }
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  fileInput.value = "";
  typeResult.textContent = "PDF形式確認済み";
  hashResult.textContent = `${hex(new Uint8Array(digest)).slice(0, 12)}…（重複確認用）`;
  fileState.textContent = "ファイル確認済み";
  fileState.className = "status-pill warn";
  message.className = "notice warn";
  message.querySelector("h3").textContent = "パーサ接続待ち";
  message.querySelector("p").textContent = "ファイルは送信していません。帳票解析・必須項目検証が未接続のため、登録ボタンは無効のままです。";
});
