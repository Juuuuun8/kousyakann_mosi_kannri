import { createDemoModel, createMlDemoRows } from "./demo-engine.js";

const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll("[data-tab]")];
const stateSelect = document.querySelector("#state-select");
const locationFilter = document.querySelector("#location-filter");
const schoolFilter = document.querySelector("#school-filter");
const subjectFilter = document.querySelector("#subject-filter");
const suppressionFilter = document.querySelector("#suppression-filter");
let activeTab = "overview";
let data = null;
let selectedPersonId = null;

function escapeHtml(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
const pct = (value) => value === null ? "—" : `${Number(value).toFixed(1)}%`;
const pt = (value) => value === null ? "—" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(1)}pt`;
const number = (value, digits = 1) => value === null ? "—" : Number(value).toFixed(digits);

const stateCopy = {
  loading: ["notice", "◌", "読み込み中", "架空のSheetスナップショットを読み込んでいます。"],
  empty: ["notice", "∅", "対象データがありません", "校舎、高校、科目の条件を変更してください。"],
  suppressed: ["notice warn", "▧", "小人数群のため値を抑制", "対象人数が設定した閾値未満です。人数だけを表示し、成績値は返しません。"],
  partial: ["notice warn", "△", "一部データのみ", "未受験または帳票欠損が含まれます。除外数と欠損理由を確認してください。"],
  schema: ["notice danger", "!", "帳票スキームが一致しません", "未知Schemaは分析へ含めず、対応版の追加まで登録を停止します。"],
  permission: ["notice danger", "⊘", "権限がありません", "分析とML出力はADMIN専用です。INPUTは登録だけを利用できます。"],
  error: ["notice danger", "!", "デモデータを読み込めません", "再読み込みしても直らない場合は管理者へ連絡してください。"],
};

function notice(state) {
  const [className, icon, title, body] = stateCopy[state];
  return `<div class="${className}"><div class="notice-icon" aria-hidden="true">${icon}</div><div><h3>${title}</h3><p>${body}</p></div></div>`;
}

function metricCard(label, value, note) {
  return `<article class="kpi"><p class="eyebrow">${escapeHtml(label)}</p><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></article>`;
}

function currentFilters() {
  return { locationId: locationFilter.value, schoolId: schoolFilter.value, subjectId: subjectFilter.value, suppressionThreshold: Number(suppressionFilter.value), personId: selectedPersonId };
}

function histogram(model) {
  const max = Math.max(1, ...model.overview.histogram.map((item) => item.count));
  return `<div class="chart" aria-label="得点率分布"><div class="chart-title"><strong>個人総合得点率の分布</strong><span>中央値 ${pct(model.overview.rate.median)} · 四分位 ${pct(model.overview.rate.p25)}–${pct(model.overview.rate.p75)}</span></div><div class="histogram">${model.overview.histogram.map((item) => `<div class="hist-column"><span class="hist-bar" style="height:${Math.max(5, Math.round(item.count / max * 120))}px"></span><span>${item.start}–</span><small>${item.count}人</small></div>`).join("")}</div><p class="chart-note">各生徒の受験科目合計から得点率を計算。未受験科目を0点に変換していません。</p></div>`;
}

function overview(model) {
  const trend = model.comparison;
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SHEET SNAPSHOT</p><h2>全体概要</h2></div><span class="status-pill">架空データから再集計</span></div><div class="kpis">${metricCard("対象生徒", `${model.overview.students}人`, `成績行 ${model.overview.observations}`)}${metricCard("平均 / 中央値", `${pct(model.overview.rate.mean)} / ${pct(model.overview.rate.median)}`, `四分位 ${pct(model.overview.rate.p25)}–${pct(model.overview.rate.p75)}`)}${metricCard("前回比較可能", `${trend.comparableCount}人`, `比較不能 ${trend.excludedCount}人`)}${metricCard("前回からの変化", pt(trend.summary.mean), `中央値 ${pt(trend.summary.median)}`)}</div>${histogram(model)}</section><div class="grid-2"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">COMPARABLE TREND</p><h2>同一受験者の回次推移</h2></div><span class="status-pill">n = ${trend.comparableCount}</span></div><div class="trend-list">${trend.bands.map((band) => `<div class="trend-row"><span>${escapeHtml(band.label)}（n=${band.count}）</span><div class="trend-track"><div class="trend-value" style="margin-left:50%;width:${Math.min(42, Math.abs(band.mean ?? 0) * 4)}%"></div></div><strong>${pt(band.mean)}</strong></div>`).join("")}</div><div class="evidence-note">同一Person、同一科目、前後2回とも値がある生徒だけを比較します。変化の原因は自動判定しません。</div></section><section class="panel"><p class="eyebrow">DATA QUALITY</p><h2>品質サマリ</h2><table class="data-table"><tbody><tr><td>ACTIVE</td><td><span class="status-pill">${model.quality.active}</span></td></tr><tr><td>欠損科目</td><td><span class="status-pill warn">${model.overview.missingCount}</span></td></tr><tr><td>PENDING</td><td>${model.quality.pending}</td></tr><tr><td>SUPERSEDED</td><td>${model.quality.superseded}</td></tr></tbody></table><div class="panel-footer">未受験と0点を区別し、ACTIVEだけを集計します。</div></section></div>`;
}

function groups(model) {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">GROUP COMPARISON</p><h2>校舎・学校比較</h2></div><span class="status-pill">小人数抑制 ${model.filters.suppressionThreshold}人</span></div><table class="data-table"><thead><tr><th>区分</th><th>校舎・高校</th><th>対象人数</th><th>平均</th><th>中央値</th><th>四分位範囲</th></tr></thead><tbody>${model.groups.map((group) => `<tr><td>${group.kind}</td><td>${escapeHtml(group.label)}</td><td>${group.sampleCount}</td><td>${group.suppressed ? "抑制" : pct(group.rate.mean)}</td><td>${group.suppressed ? "抑制" : pct(group.rate.median)}</td><td>${group.suppressed ? "抑制" : `${pct(group.rate.p25)}–${pct(group.rate.p75)}`}</td></tr>`).join("")}</tbody></table><div class="evidence-note">高校別が閾値未満の場合、人数だけを残して成績値を抑制します。校舎間の差だけで評価を確定しません。</div></section>`;
}

function subjects(model) {
  const answerLabels = { correct: "正答", wrong: "誤答", partial: "部分点", blank: "無回答", extra: "余分マーク" };
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SUBJECT / DOMAIN</p><h2>科目・分野の観測値</h2></div><span class="status-pill">架空Sheet再集計</span></div><table class="data-table"><thead><tr><th>科目</th><th>対象 / 欠損</th><th>平均 / 中央値</th><th>四分位範囲</th><th>全国平均との差</th><th>平均偏差値</th></tr></thead><tbody>${model.subjects.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.sampleCount} / ${row.excludedCount}</td><td>${pct(row.rate.mean)} / ${pct(row.rate.median)}</td><td>${pct(row.rate.p25)}–${pct(row.rate.p75)}</td><td>${pt(row.nationalGap)}</td><td>${number(row.deviation)}</td></tr>`).join("")}</tbody></table><div class="grid-2"><div class="chart"><div class="chart-title"><strong>数学Ⅰ・A 分野別</strong><span>前回差と同学力帯差</span></div><table class="data-table"><thead><tr><th>分野</th><th>対象</th><th>得点率</th><th>全国差</th><th>同学力帯差</th><th>前回差</th></tr></thead><tbody>${model.domains.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.sampleCount}</td><td>${pct(row.rate.mean)}</td><td>${pt(row.nationalGap)}</td><td>${pt(row.sameAbilityGap)}</td><td>${pt(row.previousChange)}</td></tr>`).join("")}</tbody></table></div><div class="chart"><div class="chart-title"><strong>数学Ⅰ・A 設問結果構成</strong><span>対象 ${model.answers.sampleCount}人</span></div><div class="stack">${model.answers.parts.map((part) => `<span class="${part.key}" style="width:${(part.rate * 100).toFixed(1)}%"></span>`).join("")}</div><div class="legend">${model.answers.parts.map((part) => `<span>${answerLabels[part.key]} ${(part.rate * 100).toFixed(1)}%</span>`).join("")}</div><p class="chart-note">正答・誤答・部分点・無回答・余分マークを別集計します。</p></div></div></section>`;
}

function targets(model) {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">TARGET SCHOOLS</p><h2>志望校判定・ボーダー差</h2></div><span class="status-pill">第1志望 · ${model.targets.sampleCount}人</span></div><div class="kpis">${model.targets.counts.map((item) => metricCard(`${item.label}判定`, `${item.count}人`, model.targets.sampleCount ? `${(item.count / model.targets.sampleCount * 100).toFixed(1)}%` : "—")).join("")}</div><div class="grid-2"><div class="chart"><div class="chart-title"><strong>ボーダー差</strong><span>得点率ポイント</span></div><div class="kpi-value">${pt(model.targets.borderGap.mean)}</div><p class="chart-note">中央値 ${pt(model.targets.borderGap.median)} · 四分位 ${pt(model.targets.borderGap.p25)}–${pt(model.targets.borderGap.p75)}</p></div><div class="chart"><div class="chart-title"><strong>志望先別人数（架空）</strong><span>名称も架空</span></div><div class="bar-list">${model.targets.targetGroups.map((item) => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${model.targets.sampleCount ? item.count / model.targets.sampleCount * 100 : 0}%"></div></div><strong>${item.count}人</strong></div>`).join("")}</div></div></div></section>`;
}

function individual(model) {
  const detail = model.individual;
  if (!detail) return notice("empty");
  selectedPersonId = detail.person.personId;
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">INDIVIDUAL DETAIL / DEMO</p><h2>個人詳細（架空）</h2></div><label>表示する生徒<select id="person-select">${model.students.map((student) => `<option value="${escapeHtml(student.personId)}"${student.personId === detail.person.personId ? " selected" : ""}>${escapeHtml(student.displayLabel)}</option>`).join("")}</select></label></div><div class="kpis">${metricCard("校舎", data.locations.find((item) => item.id === detail.person.locationId)?.label, "架空校舎")}${metricCard("高校", data.schools.find((item) => item.id === detail.person.schoolId)?.label, detail.person.grade)}${metricCard("今回得点率", pct(detail.byEvent.at(-1).rate), `前回 ${pct(detail.byEvent[0].rate)}`)}${metricCard("今回偏差値", number(detail.byEvent.at(-1).deviation), `前回 ${number(detail.byEvent[0].deviation)}`)}</div><div class="grid-2"><div class="chart"><div class="chart-title"><strong>回次推移</strong><span>受験科目合計</span></div><table class="data-table"><thead><tr><th>回次</th><th>得点率</th><th>平均偏差値</th></tr></thead><tbody>${detail.byEvent.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${pct(item.rate)}</td><td>${number(item.deviation)}</td></tr>`).join("")}</tbody></table></div><div class="chart"><div class="chart-title"><strong>科目バランス</strong><span>得点率</span></div><div class="bar-list">${detail.subjects.map((item) => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${item.rate}%"></div></div><strong>${pct(item.rate)}</strong></div>`).join("")}</div></div></div><div class="evidence-note">事実、比較値、欠損、時系列だけを表示します。次に誰へ何を指導するかは担当者が判断します。</div></section>`;
}

function quality(model) {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">DATA MANAGEMENT</p><h2>データ管理</h2></div><span class="status-pill">demo-sheet.v1</span></div><table class="data-table"><thead><tr><th>状態</th><th>件数</th><th>分析への扱い</th></tr></thead><tbody><tr><td><span class="status-pill">ACTIVE</span></td><td>${model.quality.active}</td><td>集計対象</td></tr><tr><td><span class="status-pill warn">PENDING</span></td><td>${model.quality.pending}</td><td>確定まで除外</td></tr><tr><td><span class="status-pill">SUPERSEDED</span></td><td>${model.quality.superseded}</td><td>最新版のみ採用・履歴保持</td></tr></tbody></table><div class="evidence-note">このデモは同一の架空データセットから画面とGoogleスプレッドシートを生成しています。本番では書込後ハッシュ照合を追加します。</div></section>`;
}

function ml(model) {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ML EXPORT / DEMO</p><h2>ML用CSV</h2></div><span class="status-pill warn">架空データのみ実行可能</span></div><div class="notice warn"><div class="notice-icon" aria-hidden="true">!</div><div><h3>端末ダウンロード</h3><p>直接識別子を除外した固定列CSVを生成します。このデモの全データは架空です。</p></div></div><div class="export-confirm"><label>利用目的<input id="export-purpose" type="text" maxlength="120" placeholder="例：分析モデル検証"></label><label class="check-row"><input id="export-confirm" type="checkbox">用途限定、適切な保存、利用後の削除が必要なことを確認しました</label><p id="export-status" class="privacy-line" aria-live="polite">確認後に${createMlDemoRows(data, model).length}行の架空CSVを生成できます。</p></div><div class="panel-footer"><button id="export-button" class="action" type="button" disabled>架空CSVを生成</button></div></section>`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "\"\"";
  const raw = String(value);
  const safe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadDemoCsv(model) {
  const rows = createMlDemoRows(data, model);
  const columns = Object.keys(rows[0] ?? {});
  const csv = `\uFEFF${[columns, ...rows.map((row) => columns.map((key) => row[key]))].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "moshi_ml_demo.csv";
  link.click();
  URL.revokeObjectURL(url);
  app.querySelector("#export-status").textContent = `${rows.length}行の架空CSVを生成しました。実データは含まれません。`;
}

function render() {
  if (!data) { app.innerHTML = notice("loading"); return; }
  const forcedState = stateSelect.value;
  if (forcedState !== "ready") { app.innerHTML = notice(forcedState); return; }
  const model = createDemoModel(data, currentFilters());
  if (!model.students.length) { app.innerHTML = notice("empty"); return; }
  if (model.suppressed && !["quality", "ml"].includes(activeTab)) { app.innerHTML = notice("suppressed"); return; }
  app.innerHTML = ({ overview, groups, subjects, targets, individual, quality, ml }[activeTab] ?? overview)(model);
}

function populateFilters() {
  for (const item of data.locations) locationFilter.add(new Option(item.label, item.id));
  for (const item of data.schools) schoolFilter.add(new Option(item.label, item.id));
  for (const item of data.subjectDefinitions) subjectFilter.add(new Option(item.label, item.id));
  const activeEvent = data.examEvents.find((item) => item.id === data.meta.activeEventId);
  document.querySelector("#dataset-version").textContent = `${activeEvent.label} · ${data.meta.datasetVersion}`;
  document.querySelector("#data-summary").textContent = `${data.meta.notice} ${data.students.length}人・${data.examEvents.length}回次・${data.subjectDefinitions.length}科目を、校舎・高校・科目で再集計できます。`;
}

tabs.forEach((tab) => tab.addEventListener("click", () => {
  activeTab = tab.dataset.tab;
  tabs.forEach((candidate) => {
    const selected = candidate === tab;
    candidate.classList.toggle("is-active", selected);
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  });
  render();
}));
document.querySelector(".tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
});

for (const control of [locationFilter, schoolFilter, subjectFilter, suppressionFilter, stateSelect]) control.addEventListener("change", () => { selectedPersonId = null; render(); });
app.addEventListener("change", (event) => {
  if (event.target.id === "person-select") { selectedPersonId = event.target.value; render(); }
  if (event.target.id === "export-confirm") {
    const purpose = app.querySelector("#export-purpose");
    app.querySelector("#export-button").disabled = !event.target.checked || !purpose.value.trim();
  }
});
app.addEventListener("input", (event) => {
  if (event.target.id !== "export-purpose") return;
  app.querySelector("#export-button").disabled = !(app.querySelector("#export-confirm")?.checked && event.target.value.trim());
});
app.addEventListener("click", (event) => {
  if (event.target.id === "export-button") downloadDemoCsv(createDemoModel(data, currentFilters()));
});

app.innerHTML = notice("loading");
try {
  const response = await fetch("./data/demo-dataset.json", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("demo dataset request failed");
  data = await response.json();
  populateFilters();
  render();
} catch {
  app.innerHTML = notice("error");
}
