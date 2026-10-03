import { createDemoModel, createMlDemoRows, visibleStudents, orderEvents } from "./demo-engine.js";
import { csvCell } from "./csv-utils.js";

const app = document.querySelector("#app");
const navItems = [...document.querySelectorAll("[data-tab]")];
const controls = Object.fromEntries([["definitionId", "definition-filter"], ["period", "period-filter"], ["events", "event-filter"], ["locations", "location-filter"], ["schoolId", "school-filter"], ["grade", "grade-filter"], ["subjectId", "subject-filter"], ["scale", "scale-filter"]].map(([key, id]) => [key, document.getElementById(id)]));
let data, activeTab = "overview", selectedPersonId = null, studentQuery = "", studentSort = "deviation-desc", studentFlag = "all", matrixMeasure = "cohortGap", drill = null, targetQuery = "";
const escapeHtml = (value) => String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v) => finite(v) ? v.toFixed(1) : "—";
const pct = (v) => finite(v) ? `${v.toFixed(1)}%` : "—";
const pt = (v) => finite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}pt` : "—";
const primary = (v) => controls.scale.value === "deviation" ? num(v) : pct(v);
const locationName = (id) => data.locations.find((r) => r.id === id)?.label ?? id;
const schoolName = (id) => data.schools.find((r) => r.id === id)?.label ?? id;
const subjectName = (id) => data.subjectDefinitions.find((r) => r.id === id)?.label ?? id;
const missingName = (reason) => ({ NOT_TAKEN: "未受験", NOT_SUPPORTED_BY_REPORT: "帳票にない項目", NOT_PRINTED: "非掲載", BLANK_IN_REPORT: "帳票空欄", PARSE_FAILED: "解析不能", NO_ELIGIBLE_RECORD: "確定・照合済みの成績なし", NOT_SUPPORTED_OR_MISSING: "非対応または値なし" })[reason] ?? "未取得・不明";
const measures = { cohortGap: "選択中の校舎平均との差（得点率）", nationalGap: "全国平均との差（得点率）", sameAbilityGap: "同学力帯との差（得点率）", blankRate: "無回答率", scoreRate: "得点率" };
const answerLabels = { correct: "正答", partial: "部分点", wrong: "誤答", blank: "無回答", extra: "余分マーク", unknown: "不明" };
const pageCopy = { overview: ["状況をつかむ", "同じ指標の水準・分布・推移を確認します。変化の理由や指導内容は人が判断します。"], compare: ["集団を比べる", "校舎・高校の分布と、教科内の分野を横並びで確認します。"], individual: ["生徒を探す", "一覧から選んで、本人の成績・分野・解答・全志望校を確認します。"], targets: ["志望校を確かめる", "全志望順位を確認し、同じ大学・学部・方式の生徒を探します。"], registration: ["登録・取込状況", "確定前・差し替え履歴・帳票の取得項目を確認します。"], ml: ["ML用出力", "直接識別子を除いた仮名化CSVを作成します。"] };
function notice(title, body, tone = "info") { return `<div class="notice ${tone}" role="status"><span aria-hidden="true">i</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div></div>`; }
function metric(label, value, note) { return `<article class="metric-card"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`; }
function card(title, body, note = "", id = "") { return `<section class="card" ${id ? `id="${id}"` : ""}><div class="section-heading"><h2>${escapeHtml(title)}</h2></div>${note ? `<p class="footnote panel-context">${escapeHtml(note)}</p>` : ""}${body}</section>`; }
function table(headers, rows, cls = "") { return `<div class="table-wrap ${cls}"><table><thead><tr>${headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; }
const buttonPerson = (id, label) => `<button type="button" class="student-link" data-person-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
function checkedLocations() { return [...controls.locations.querySelectorAll("input:checked")].map((r) => r.value); }
function currentFilters() {
  let events = orderEvents(data.examEvents.filter((r) => r.definitionId === controls.definitionId.value));
  if (controls.period.value === "latest-3") events = events.slice(-3);
  if (controls.period.value === "latest") events = events.slice(-1);
  if (controls.period.value === "custom") { const ids = new Set([...controls.events.querySelectorAll("input:checked")].map((r) => r.value)); events = events.filter((r) => ids.has(r.id)); }
  return { definitionId: controls.definitionId.value, eventIds: events.map((r) => r.id), locationIds: checkedLocations(), schoolId: controls.schoolId.value, grade: controls.grade.value, subjectId: controls.subjectId.value, scale: controls.scale.value, personId: selectedPersonId, matrixMeasure, suppressionThreshold: 5 };
}
const latestLabel = (m) => m.events.at(-1)?.label ?? "模試回未選択";
const panelContext = (m) => `${latestLabel(m)}／${m.selectedMetric?.label ?? "指標未選択"}／${m.filters.scale === "deviation" ? "偏差値" : "得点率"}`;
function changeSummary(m) {
  const c = m.comparison;
  const label = c.events.map((r) => r.label).join(" → ");
  if (c.reason) return notice("前回との比較は表示できません", `${c.reason}。比較可能 ${c.comparableCount}人・比較不能 ${c.excludedCount}人。`);
  return `<p class="footnote">${escapeHtml(label)}／同一人物・同一定義 ${c.comparableCount}人、比較不能 ${c.excludedCount}人。±${c.changeBandThreshold}ptはデモの表示区分で、指導判断ではありません。</p><div class="metric-grid three">${metric(`上昇（${c.changeBandThreshold}pt以上）`, `${c.improved}人`, `平均変化 ${pt(c.change.mean)}`)}${metric("ほぼ横ばい", `${c.unchanged}人`, `±${c.changeBandThreshold}pt未満`)}${metric(`低下（${c.changeBandThreshold}pt以上）`, `${c.declined}人`, "難度・構成の違いから原因は断定できません")}</div>`;
}

function trendChart(rows, { person = false, secondary = null, primaryLabel = "同一生徒の平均", secondaryLabel = "各回の平均" } = {}) {
  if (!rows.length) return notice("表示できる推移がありません", "模試回を選択してください。");
  const series = rows.map((r) => person ? r.value : r.rate.mean);
  const peer = secondary ?? (person ? rows.map((r) => r.peerValue) : []);
  const x = (i) => rows.length === 1 ? 420 : 60 + i / (rows.length - 1) * 690;
  const valid = [...series, ...peer].filter(finite);
  const lower = Math.min(0, Math.floor(Math.min(...valid, 0) / 20) * 20), upper = Math.max(100, Math.ceil(Math.max(...valid, 100) / 20) * 20);
  const y = (v) => 195 - (v - lower) / (upper - lower) * 165;
  const segments = (values, cls) => { let previous = null; const result = []; values.forEach((v, i) => { if (!finite(v)) { previous = null; return; } if (previous !== null) result.push(`<line x1="${x(previous)}" y1="${y(values[previous])}" x2="${x(i)}" y2="${y(v)}" class="${cls}"/>`); previous = i; }); return result.join(""); };
  const ticks = Array.from({ length: 6 }, (_, i) => lower + i * (upper - lower) / 5);
  const chart = `<div class="chart-scroll"><svg class="wide-chart" viewBox="0 0 800 265" role="img" aria-label="${escapeHtml(primaryLabel)}の推移、${controls.scale.value === "deviation" ? "偏差値" : "得点率0～100%"}">${ticks.map((v) => `<line x1="55" y1="${y(v)}" x2="760" y2="${y(v)}" class="chart-grid"/><text x="45" y="${y(v) + 5}" text-anchor="end">${controls.scale.value === "deviation" ? Math.round(v) : `${Math.round(v)}%`}</text>`).join("")}${segments(peer, "peer-line")}${segments(series, "trend-line")}${rows.map((r, i) => `<text x="${x(i)}" y="233" text-anchor="middle">${escapeHtml(r.shortLabel)}</text>${finite(series[i]) ? `<circle cx="${x(i)}" cy="${y(series[i])}" r="4"><title>${escapeHtml(r.label)} ${primary(series[i])}</title></circle>` : `<text x="${x(i)}" y="215" text-anchor="middle">値なし</text>`}`).join("")}</svg></div><div class="chart-legend"><span>${escapeHtml(primaryLabel)}</span>${peer.length ? `<span class="peer-key">${escapeHtml(secondaryLabel)}</span>` : ""}</div>`;
  const rowsHtml = rows.map((r, i) => `<tr><td>${escapeHtml(r.label)}</td><td>${primary(series[i])}</td><td>${person ? "本人" : `${r.participants}人`}</td>${peer.length ? `<td>${primary(peer[i])}</td>` : ""}</tr>`).join("");
  return `${chart}<details class="chart-table"><summary>グラフの数値を確認</summary>${table(["模試", primaryLabel, "有効人数", ...(peer.length ? [secondaryLabel] : [])], rowsHtml)}</details><p class="footnote">値なし・少人数の点は接続しません。${upper !== 100 || lower !== 0 ? `縦軸は${lower}～${upper}に拡張しています。` : "縦軸は0～100で固定です。"}</p>`;
}
function subjectCards(m) {
  return `<div class="subject-grid">${m.subjects.map((s) => `<button type="button" class="subject-card${s.id === m.filters.subjectId ? " selected-row" : ""}" data-open-tab="compare" data-subject="${s.id}"><span>${escapeHtml(s.label)}${s.aggregate ? "<small>帳票掲載総合</small>" : ""}</span><strong>${primary(s.primary.mean)}</strong><small>有効 ${s.sampleCount}人／全国平均との差（得点率） ${pt(s.nationalGap)}（基準あり ${s.nationalCount}人）</small></button>`).join("")}</div>`;
}
function overview(m) {
  const facts = [...m.subjects].filter((s) => !s.aggregate && finite(s.nationalGap)).sort((a, b) => a.nationalGap - b.nationalGap).slice(0, 2).map((s) => `<li><div><strong>${escapeHtml(s.label)}：全国平均との差（得点率） ${pt(s.nationalGap)}</strong><p>最新選択回・基準あり${s.nationalCount}人。原因は自動判定していません。</p></div><button type="button" data-open-tab="compare" data-subject="${s.id}">分野を見る</button></li>`).join("");
  const totals = `<div class="metric-grid">${metric("対象生徒", `${m.scope.students}人`, `最新回の有効成績 ${m.scope.latestRate.count}人`)}${metric(`${m.selectedMetric.label} 平均`, primary(m.scope.latestRate.mean), `中央値 ${primary(m.scope.latestRate.median)}／有効 ${m.scope.latestRate.count}人`)}${metric("前回と比較可能", `${m.comparison.comparableCount}人`, `比較不能 ${m.comparison.excludedCount}人`)}${metric("登録済みPDF", `${m.registration.active}件`, `確認中 ${m.registration.pending}件`)}</div>`;
  return `${card("同一指標の推移", trendChart(m.fixedEventSummary, { secondary: m.eventSummary.map((r) => r.rate.mean) }), `実線：全選択回に値のある同一生徒${m.fixedCount}人／点線：各回の有効者平均（人数が変わります）`)}${totals}${card("前回からの変化", changeSummary(m), "選択した直近2回を比較")}${card("注目したい事実", facts ? `<ul class="insight-list">${facts}</ul>` : notice("比較基準のある成績がありません", "全国平均との差を推測して計算しません。"), latestLabel(m))}<details class="card"><summary>他の教科・帳票掲載総合も見る</summary>${subjectCards(m)}</details>`;
}
function boxPlot(group, lower = 0, upper = 100) {
  if (group.suppressed || !group.count) return `<span class="suppressed-note">${group.count ? "有効5人未満" : "有効成績なし"}</span>`;
  const x = (v) => 20 + (v - lower) / (upper - lower) * 580;
  return `<svg class="distribution-chart" viewBox="0 0 640 90" role="img" aria-label="${escapeHtml(group.label)}の中央値・中央50%・個人分布"><line x1="${x(group.minimum)}" y1="22" x2="${x(group.maximum)}" y2="22" class="whisker-line"/><rect x="${x(group.p25)}" y="12" width="${x(group.p75) - x(group.p25)}" height="20" class="quartile-box"/><line x1="${x(group.median)}" y1="10" x2="${x(group.median)}" y2="34" class="median-line"/>${group.values.map((p, i) => `<circle cx="${x(p.value)}" cy="${45 + i % 3 * 7}" r="4" tabindex="0" role="button" aria-label="${escapeHtml(data.students.find((s) => s.personId === p.personId)?.displayLabel)} ${primary(p.value)}の詳細" data-person-id="${p.personId}"><title>${primary(p.value)}・クリックで本人へ</title></circle>`).join("")}${Array.from({ length: 6 }, (_, i) => lower + i * (upper - lower) / 5).map((v) => `<text x="${x(v)}" y="83" text-anchor="middle">${controls.scale.value === "deviation" ? v : `${v}%`}</text>`).join("")}</svg>`;
}
function groupTable(m, kind) {
  const values = m.groups.flatMap((g) => g.values.map((r) => r.value));
  const lower = Math.min(0, Math.floor(Math.min(...values, 0) / 20) * 20), upper = Math.max(100, Math.ceil(Math.max(...values, 100) / 20) * 20);
  return table([kind, "有効／対象", "平均", "中央値", "中央50%", "同じ目盛で分布を比較（点から本人へ）"], m.groups.filter((g) => g.kind === kind).map((g) => `<tr><th scope="row">${escapeHtml(g.label)}</th><td>${g.count}／${g.memberCount}人<small>除外 ${g.excludedCount}人</small></td><td>${primary(g.mean)}</td><td>${primary(g.median)}</td><td>${primary(g.p25)}～${primary(g.p75)}</td><td class="distribution-cell">${boxPlot(g, lower, upper)}</td></tr>`).join(""));
}
function campusDomainMatrix(m) {
  const matrix = m.locationDomains;
  const picker = `<label class="inline-control">マスに表示する値<select id="matrix-measure">${Object.entries(measures).map(([id, label]) => `<option value="${id}"${id === matrixMeasure ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
  const rows = matrix.rows.map((d) => `<tr><th scope="row">${escapeHtml(d.label)}</th>${d.cells.map((cell) => { const gapMode = matrixMeasure.endsWith("Gap"), color = !finite(cell.value) ? "transparent" : gapMode ? `rgba(${cell.value < 0 ? "185,70,50" : "25,100,160"},${.08 + Math.min(1, Math.abs(cell.value) / 12) * .3})` : `rgba(25,100,160,${.08 + Math.min(1, cell.value / 100) * .25})`; const value = gapMode ? pt(cell.value) : pct(cell.value); return `<td><button class="matrix-cell" type="button" data-location-drill="${cell.locationId}" data-domain-drill="${d.id}" style="background:${color}" ${!finite(cell.value) ? "disabled" : ""}><strong>${value}</strong><small>有効 ${cell.count}人${cell.suppressed ? "・5人未満" : ""}</small><small>${finite(cell.value) ? "生徒を見る →" : "基準または成績なし"}</small></button></td>`; }).join("")}</tr>`).join("");
  return `${picker}${table(["分野", ...matrix.locations.map((l) => l.label)], rows, "matrix-table")}<p class="footnote">${escapeHtml(measures[matrixMeasure])}。差の青は基準以上、赤は基準未満。色だけで優劣を判断しません。マスから校舎・分野の該当生徒へ進み、戻ると同じ比較を表示します。</p>`;
}
function answerBlock(summary) {
  if (!summary.count || summary.suppressed) return notice("解答の内訳を表示できません", summary.suppressed ? "有効5人未満です。" : "この回・教科の解答データがありません。非対応や未取得を0%にしません。");
  return `<div class="answer-stack">${summary.parts.filter((p) => p.count).map((p) => `<span class="${p.key}" style="width:${p.rate * 100}%"><i>${p.rate >= .08 ? `${Math.round(p.rate * 100)}%` : ""}</i></span>`).join("")}</div><div class="answer-legend">${summary.parts.filter((p) => p.count).map((p) => `<span class="${p.key}">${answerLabels[p.key]} ${pct(p.rate * 100)}・${p.count}件</span>`).join("")}</div><p class="footnote">解答${summary.count}件／${summary.participants}人。無回答は事実であり、時間不足や知識不足を断定しません。</p>`;
}
function domainsTable(domains, events) {
  return table(["分野", ...events.map((e) => e.shortLabel), "最新回 全国平均との差（得点率）", "最新回 同学力帯との差（得点率）"], domains.map((d) => `<tr class="${d.id === drill?.domainId ? "selected-row" : ""}"><th scope="row">${escapeHtml(d.label)}</th>${d.byEvent.map((p) => `<td>${pct(p.value)}<small>有効${p.sampleCount}人</small></td>`).join("")}<td>${pt(d.nationalGap)}<small>基準あり${d.nationalCount}人</small></td><td>${pt(d.sameAbilityGap)}<small>基準あり${d.sameAbilityCount}人</small></td></tr>`).join(""));
}
function compare(m) {
  const domains = m.selectedMetric.aggregate ? notice("分野・設問を見るには教科を選択", "画面上部の教科・総合指標から受験科目を選んでください。総合に分野成績を推測して付けません。") : `${card("校舎 × 分野マトリクス", campusDomainMatrix(m), `${latestLabel(m)}／${m.selectedMetric.label}。この回にある分野だけで集計します。`, "domain-matrix")}<div class="overview-grid">${card("分野別得点率の推移", domainsTable(m.domains, m.events), "分野の得点率（%）と最新回の基準差（pt）。非掲載・取得不能・少人数は—。")}${card("解答の内訳", answerBlock(m.answers), latestLabel(m))}</div>${card("分野ごとの解答状況", table(["分野", "正答率", "部分点率", "無回答率", "解答／人数"], m.answers.questions.map((q) => `<tr><th scope="row">${escapeHtml(q.label)}</th><td>${pct(q.correctRate)}</td><td>${pct(q.partialRate)}</td><td>${pct(q.blankRate)}</td><td>${q.count}件／${q.personCount}人</td></tr>`).join("")), "デモの設問番号・解答は架空です。異なる模試回の設問を同じ設問として合算しません。")}`;
  return `${domains}${card("中央値とばらつき", groupTable(m, "校舎"), `${panelContext(m)}。箱は中央50%、線は最小～最大、点は個人。二極化や指導効果は断定しません。`)}<details class="card"><summary>高校ごとの比較を開く</summary><p class="footnote">${escapeHtml(panelContext(m))}</p>${groupTable(m, "高校")}</details>${card("前回からの変化", changeSummary(m))}<details class="card"><summary>他の科目へ切り替える</summary>${subjectCards(m)}</details>`;
}

function judgementChip(value) { return `<span class="judgement-chip ${["A", "B", "C", "D", "E"].includes(value) ? value.toLowerCase() : ""}">${escapeHtml(value ?? "—")}</span>`; }
const gapUnitLabel = (unit) => ({ SCORE_RATE_PT: "得点率差pt", SCORE_POINT: "得点差（点）", DEVIATION_PT: "偏差値差" })[unit] ?? "単位未取得・非対応";
function gapValue(row) {
  if (!finite(row.borderGap)) return "—";
  if (row.borderGapUnit === "SCORE_RATE_PT") return pt(row.borderGap);
  if (row.borderGapUnit === "SCORE_POINT") return `${row.borderGap > 0 ? "+" : ""}${num(row.borderGap)}点`;
  if (row.borderGapUnit === "DEVIATION_PT") return `${row.borderGap > 0 ? "+" : ""}${num(row.borderGap)}（偏差値）`;
  return "単位未取得・非対応";
}
function targets(m) {
  const t = m.targets;
  if (!t.sampleCount || t.suppressed) return notice("志望校判定を表示できません", `${latestLabel(m)}に対象情報がない、または有効5人未満です。過去回の志望を最新回として補完しません。`);
  const groups = t.groups.filter((g) => !targetQuery || `${g.targetLabel} ${g.schedule}`.includes(targetQuery));
  const groupRows = groups.map((g, i) => `<tr><th scope="row">${escapeHtml(g.targetLabel)}<small>${escapeHtml(g.program)}／${escapeHtml(g.schedule)}／${gapUnitLabel(g.borderGapUnit)}</small></th><td>${g.studentCount}人</td><td>${g.preferenceOrders.map((r) => `第${r}`).join("・")}</td><td>${g.suppressed ? "5人未満" : `${g.aToC}／${g.count}件`}</td><td>${gapValue(g)}<small>基準差あり ${g.borderCount}人</small></td><td><button type="button" class="link-button" data-target-drill="${t.groups.indexOf(g)}">生徒を見る</button></td></tr>`).join("");
  return `<p class="footnote panel-context">${escapeHtml(latestLabel(m))}時点。判定は帳票掲載値で、合格や安全校を保証しません。</p><div class="metric-grid three">${metric("志望情報のある生徒", `${t.studentCount}人`, `全順位 ${t.sampleCount}件`)}${metric("A～C判定の志望あり", `${t.hasAToC}人`, "全登録順位のいずれか")}${metric(t.rule.labels.targets, `${t.allConfiguredJudgement}人`, "第1～第3が揃っている場合のみ。対応は人が判断")}</div><div class="judgement-grid">${t.counts.map((r) => `<article class="judgement"><span>${escapeHtml(r.label)}判定</span><strong>${r.count}件</strong><small>${pct(r.count / t.sampleCount * 100)}</small></article>`).join("")}</div>${card("全志望順位の判定構成", table(["志望順位", "件数", "A", "B", "C", "D", "E", "不明"], t.byPreference.map((p) => `<tr><th scope="row">第${p.order}志望</th><td>${p.count}件</td>${p.counts.map((r) => `<td>${r.count}</td>`).join("")}</tr>`).join("")), "第1～第3志望の判定構成も、他の登録順位と同時に確認できます。")}${card("大学・学部・方式を混同しない比較", `<label class="inline-control">志望先の一覧を絞る<input id="target-search" type="search" placeholder="大学・学部・方式" value="${escapeHtml(targetQuery)}"></label>${table(["志望先・方式・単位", "生徒数", "志望順位", "A～C／全志望", "平均ボーダー差", "本人へ"], groupRows)}${!groups.length ? notice("一致する志望先がありません", "検索語を変更してください。") : ""}`, "同一大学・学部・学科・方式・単位でのみ集計。異なる方式のボーダー差は平均しません。")}${notice("判定だけで結論を出さない", "次に誰へ何を指導するかは担当者が判断します。全落ちや原因を自動判定しません。")}`;
}
function individual(m) {
  const list = visibleStudents(m.studentList, { query: studentQuery, sort: studentSort, flag: studentFlag, personIds: drill?.personIds, names: (r) => [r.displayLabel, r.grade, r.judgement, locationName(r.locationId), schoolName(r.schoolId), ...r.targetLabels] });
  const selected = list.some((r) => r.personId === selectedPersonId) ? m.individual : null;
  if (!selected) selectedPersonId = null;
  const listRows = list.map((r) => `<tr class="${selected?.person.personId === r.personId ? "selected-row" : ""}"><td>${buttonPerson(r.personId, r.displayLabel)}<small>${escapeHtml(r.grade)}</small></td><td>${escapeHtml(locationName(r.locationId))}</td><td>${escapeHtml(schoolName(r.schoolId))}</td><td>${num(r.deviation)}</td><td>${pct(r.scoreRate)}</td><td>${pt(r.change)}</td><td>${judgementChip(r.judgement)}</td><td>${escapeHtml(r.missingReason ? missingName(r.missingReason) : "値あり")}${r.followUpFlags.map((flag) => `<small class="fact-chip">${escapeHtml(m.dataQuality.followUpRules.labels[flag])}</small>`).join("")}</td></tr>`).join("");
  const toolbar = `<div class="student-toolbar"><label>生徒を検索<input id="student-search" type="search" placeholder="氏名・校舎・高校・志望校" value="${escapeHtml(studentQuery)}"></label><label>確認条件<select id="student-flag">${[["all", "すべて表示"], ["decline", m.dataQuality.followUpRules.labels.decline], ["targets", m.dataQuality.followUpRules.labels.targets]].map(([id, label]) => `<option value="${id}"${id === studentFlag ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><label>並び順<select id="student-sort">${[["deviation-desc", "偏差値が高い順"], ["change-asc", "前回比が低い順"], ["change-desc", "前回比が高い順"], ["name-asc", "氏名順"]].map(([id, label]) => `<option value="${id}"${id === studentSort ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>`;
  const back = drill ? `<div class="drill-context"><strong>${escapeHtml(drill.label)}</strong><p>比較基準・模試・校舎条件は元のままです。該当者だけを一覧に表示しています。</p><button type="button" class="primary-button" id="back-to-comparison">元の比較に戻る</button><button type="button" class="link-button" id="clear-drill">絞り込みを解除</button></div>` : "";
  const listCard = card(`生徒一覧（${list.length}／${drill?.personIds.length ?? m.studentList.length}人）`, `${toolbar}<p class="footnote">前回比は${escapeHtml(m.comparison.events.map((e) => e.label).join(" → "))}の${m.filters.scale === "deviation" ? "偏差値差" : "得点率差"}。欠損は並び順によらず末尾。確認条件の低下は得点率5ptを基準にしたデモ設定です。</p>${table(["生徒", "校舎", "高校", `${m.selectedMetric.label}偏差値`, "得点率", "前回比", "第1志望", "データ・確認条件"], listRows, "student-table")}${!list.length ? notice("条件に合う生徒がいません", "検索語や確認条件を変更してください。無関係な生徒の詳細は表示しません。") : ""}`, panelContext(m));
  if (!selected) return `${back}${listCard}${list.length ? notice("一覧の生徒名を押すと詳細を表示します", "成績順に並べ替えたり、氏名・高校・志望校で検索できます。") : ""}`;
  const detail = selected;
  const targetsRows = detail.targets.map((r) => `<tr><th scope="row">第${r.preferenceOrder}志望</th><td>${escapeHtml(r.targetLabel)}<small>${escapeHtml(r.schedule)}</small></td><td>${judgementChip(r.judgement)}</td><td>${gapValue(r)}</td><td>${r.rank ?? "—"}／${r.population ?? "—"}</td></tr>`).join("");
  const answerRows = detail.answers.rows.map((r) => `<tr><td>${escapeHtml(data.domainDefinitions.find((d) => d.id === r.domainId)?.label)}</td><td>${r.majorQuestion}／${r.questionNumber}</td><td>${escapeHtml(answerLabels[r.result] ?? "不明")}</td></tr>`).join("");
  return `${back}${listCard}<section class="selected-person" id="person-detail" tabindex="-1"><div><h2>${escapeHtml(detail.person.displayLabel)}</h2><p>${escapeHtml(locationName(detail.person.locationId))}／${escapeHtml(schoolName(detail.person.schoolId))}／${escapeHtml(detail.person.grade)}</p></div><span>${["RESOLVED", "NEW_CONFIRMED"].includes(detail.person.identityStatus) ? "照合確認済み" : "本人照合未確認・成績は集計しません"}</span></section>${card(`${m.selectedMetric.label}の推移`, trendChart(detail.byEvent, { person: true, primaryLabel: "本人", secondaryLabel: "同じ校舎の平均" }), `${m.selectedDefinition.label}／最新選択回の対象生徒のうち、その回の登録時に本人と同じ校舎だった生徒の平均。5人未満の校舎平均は表示しません。`)}${card("教科バランス", table(["科目", "得点率", "偏差値", "データ状態"], detail.subjects.map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${pct(r.scoreRate)}</td><td>${num(r.deviation)}</td><td>${escapeHtml(r.missingReason ? missingName(r.missingReason) : "値あり")}</td></tr>`).join("")), latestLabel(m))}${!m.selectedMetric.aggregate ? `${card("本人の分野と基準差", domainsTable(detail.domains, m.events), `${subjectName(m.filters.subjectId)}。同学力帯平均は帳票に掲載された本人の基準値です。`)}${card("本人の解答の内訳", `${answerBlock(detail.answers)}${table(["分野", "大問／設問", "解答状態"], answerRows)}`, latestLabel(m))}` : notice("本人の分野・解答を見るには教科を選択", "総合には分野・解答を割り当てません。")}${card("全志望順位の判定と位置", targetsRows ? table(["志望順位", "志望先・方式", "判定", "ボーダー差", "順位／母数"], targetsRows) : notice("この回に志望情報がありません", "過去の志望を最新回として表示しません。"), `${detail.targetEvent?.label ?? "模試未選択"}時点`)}`;
}
function registration(m) {
  const cap = m.dataQuality.sourceCapabilities;
  const profiles = m.dataQuality.capabilityProfiles.filter((p) => m.dataQuality.schemaVersions.includes(p.schemaVersion));
  const labels = { subjectScores: "教科成績", deviation: "偏差値", ranks: "順位・母数", trends: "過去回", domains: "分野", answerMarks: "解答マーク", targets: "志望校" };
  const rows = m.registration.progress.map((r) => `<tr><td>${escapeHtml(data.examEvents.find((e) => e.id === r.eventId)?.label)}</td><td>${escapeHtml(locationName(r.locationId))}</td><td>${r.active}件</td><td>${r.pending}件</td><td>${r.superseded}件</td></tr>`).join("");
  return `${notice("対応範囲", m.dataQuality.supportedScope)}${card("校舎別の登録状況", table(["模試", "校舎", "確定", "確認中", "差し替え履歴"], rows), "PDFだけでは提出予定人数が分からないため、登録完了率は計算しません。")}${card("この帳票で使える分析", profiles.map((p) => `<details><summary>帳票版 ${escapeHtml(p.schemaVersion)}</summary>${table(["情報", "状態"], Object.entries(p.supports).map(([k, v]) => `<tr><th scope="row">${escapeHtml(labels[k] ?? k)}</th><td>${v ? "取得可能（実際の取得値が必要）" : "帳票非対応・分析しない"}</td></tr>`).join(""))}</details>`).join("") || notice("取得可能項目が未確認です", "確認されるまで分析しません。"), "表示回の帳票版ごとに判定。別版で取れない項目は推測で埋めません。")}${card("添付PDF1件で確認した抽出項目", `<div class="metric-grid">${metric("教科・総合", cap.summaryMetrics, "帳票掲載の値")}${metric("分野", cap.domainResults, "分野名・基準値")}${metric("志望校", cap.targets, "全登録順位")}${metric("設問マーク", cap.answerMarks, "実帳票1件の件数")}</div>`, "このデモの人数・成績・模試回・設問番号は架空です。解析器の実帳票検証と公開画面への架空データ読込は別です。")}${card("データの由来", `<div class="provenance-grid">${m.dataQuality.provenance.map((r) => `<article class="provenance"><strong>${escapeHtml(r.label)}</strong><p>${escapeHtml(r.fields)}</p></article>`).join("")}</div>`)}`;
}
function ml(m) {
  const rows = createMlDemoRows(data, m);
  return card("仮名化CSVを作成", `${notice("匿名化とは異なります", "氏名を除いても、継続するML用ID・校舎・学校・成績から人物を推測できる可能性があります。社内の取扱規則に従ってください。")}<p>${rows.length}行。現在の模試回・校舎・教科条件を反映し、確定・照合済みの成績だけを出力します。</p><div class="export-form"><label>利用目的<input id="export-purpose" type="text" maxlength="120" placeholder="例：成績推移モデルの検証"></label><label class="check-row"><input id="export-confirm" type="checkbox">用途を限定し、適切に保存し、不要になったら削除します</label><button id="export-button" class="primary-button" type="button" disabled>架空データのCSVをダウンロード</button><p id="export-status" aria-live="polite">架空データのみ。デモのID対応は固定、本番の仮名IDはサーバー側の秘密鍵で生成します。</p></div>`, panelContext(m));
}
function downloadCsv(m) { const rows = createMlDemoRows(data, m), cols = Object.keys(rows[0] ?? {}), csv = `\uFEFF${[cols, ...rows.map((r) => cols.map((c) => r[c]))].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`, url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = "moshi_ml_demo.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); document.getElementById("export-status").textContent = `${rows.length}行を出力しました。`; }
function render() {
  if (!data) return;
  const m = createDemoModel(data, currentFilters()), [title, description] = pageCopy[activeTab];
  document.getElementById("page-title").textContent = title; document.getElementById("page-description").textContent = description;
  document.getElementById("scope-summary").textContent = `${m.scope.students}人・${checkedLocations().map(locationName).join("／") || "校舎未選択"}・${m.events.length}回`;
  document.getElementById("context-bar").innerHTML = `<strong>現在の表示</strong><span>${escapeHtml(m.selectedDefinition?.label ?? "模試未選択")}</span><span>${escapeHtml(m.events.map((e) => `${e.year}年度 第${e.round}回`).join("・") || "回次未選択")}</span><span>${escapeHtml(m.selectedMetric?.label)}／${m.filters.scale === "deviation" ? "偏差値" : "得点率%"}</span><span>${escapeHtml(checkedLocations().map(locationName).join("／") || "校舎未選択")}</span><span>${escapeHtml(m.filters.schoolId === "all" ? "全高校" : schoolName(m.filters.schoolId))}／${escapeHtml(m.filters.grade === "all" ? "全学年" : m.filters.grade)}</span>`;
  if (!m.events.length || !m.people.length || !m.selectedMetric) { app.innerHTML = notice("条件に合うデータがありません", `模試回・校舎を1つ以上選ぶか、条件を元に戻してください。${m.registration.latestMetadataConflicts ? `最新選択回・全校舎の所属情報競合 ${m.registration.latestMetadataConflicts}人は校舎に割り当てず除外しています。` : ""}`); return; }
  if (m.suppressed && !["individual", "registration", "ml"].includes(activeTab)) { app.innerHTML = notice("少人数のため集計値を表示しません", "対象5人未満です。個人の事実は生徒一覧で確認できます。"); return; }
  const quality = `<details class="quality-bar"><summary>最新選択回：有効${m.scope.latestRate.count}／対象${m.scope.students}人・除外${m.scope.excludedCount}人（理由を見る）</summary><p>${Object.entries(m.scope.missing).map(([r, n]) => `${escapeHtml(missingName(r))} ${n}人`).join("／") || "除外なし"}</p><p>ACTIVE競合 ${m.dataQuality.duplicateReports}件／本人未照合 ${m.dataQuality.unresolvedReports}件。比較条件：同一人物・模試種別・指標定義・満点。基準がない差は—。</p><p>対象は最新選択回の登録時の校舎・高校・学年です。その生徒を過去回まで追跡します。各回の校舎全員を遡った平均ではなく、校舎の指導効果を表しません。</p></details>`;
  const validationQuality = (m.dataQuality.invalidScoreRows || m.registration.latestMetadataConflicts) ? notice("確認が必要なデータを集計から除外", `教科値・定義・重複の検証不一致 ${m.dataQuality.invalidScoreRows}行。最新選択回・全校舎の所属情報競合 ${m.registration.latestMetadataConflicts}人は、校舎・高校・学年に勝手に割り当てていません。`) : "";
  app.innerHTML = `${quality}${validationQuality}${({ overview, compare, individual, targets, registration, ml }[activeTab])(m)}`;
}
function activateTab(tab, scroll = true) { activeTab = tab; navItems.forEach((r) => { const selected = r.dataset.tab === tab; r.classList.toggle("is-active", selected); r.setAttribute("aria-selected", String(selected)); r.tabIndex = selected ? 0 : -1; }); if (["registration", "ml"].includes(tab)) document.querySelector(".admin-nav").open = true; render(); if (scroll) window.scrollTo({ top: 0, behavior: "smooth" }); }
function populateEvents() { controls.events.innerHTML = orderEvents(data.examEvents.filter((e) => e.definitionId === controls.definitionId.value)).map((e) => `<label><input type="checkbox" value="${e.id}" checked><span>${escapeHtml(e.label)}</span></label>`).join(""); }
function populate() {
  data.examDefinitions.forEach((r) => controls.definitionId.add(new Option(r.label, r.id)));
  controls.locations.innerHTML = data.locations.map((r) => `<label><input type="checkbox" value="${r.id}" checked><span>${escapeHtml(r.label)}</span></label>`).join("");
  data.schools.forEach((r) => controls.schoolId.add(new Option(r.label, r.id)));
  data.subjectDefinitions.filter((r) => r.comparisonEligible).forEach((r) => controls.subjectId.add(new Option(`${r.label}${r.aggregate ? "（帳票掲載総合）" : ""}`, r.id)));
  controls.subjectId.value = data.meta.defaultComparisonSubjectId;
  document.getElementById("dataset-version").textContent = `${data.meta.datasetVersion}・${data.students.length}人・${data.examEvents.length}回`;
  populateEvents();
}
function clearDetail() { selectedPersonId = null; drill = null; }
navItems.forEach((r) => r.addEventListener("click", () => { if (r.dataset.tab !== "individual") clearDetail(); activateTab(r.dataset.tab); }));
document.querySelector(".side-nav").addEventListener("keydown", (e) => { if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return; e.preventDefault(); const items = navItems.filter((r) => r.offsetParent !== null), current = Math.max(0, items.indexOf(document.activeElement)), next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); items[next]?.click(); });
Object.values(controls).forEach((control) => control.addEventListener("change", () => {
  if (control === controls.subjectId || control === controls.scale) drill = null;
  else clearDetail();
  if (control === controls.definitionId) populateEvents();
  document.getElementById("event-selection").hidden = controls.period.value !== "custom";
  render();
}));
document.getElementById("select-all-locations").addEventListener("click", () => { controls.locations.querySelectorAll("input").forEach((r) => { r.checked = true; }); clearDetail(); render(); });
document.getElementById("reset-filters").addEventListener("click", () => { controls.definitionId.value = data.examDefinitions[0].id; controls.period.value = "all"; controls.schoolId.value = "all"; controls.grade.value = "all"; controls.subjectId.value = data.meta.defaultComparisonSubjectId; controls.scale.value = "deviation"; controls.locations.querySelectorAll("input").forEach((r) => { r.checked = true; }); populateEvents(); document.getElementById("event-selection").hidden = true; studentQuery = ""; studentFlag = "all"; studentSort = "deviation-desc"; targetQuery = ""; clearDetail(); render(); });
function startDrill(personIds, label, domainId = null) { drill = { personIds, label, domainId, returnTab: activeTab, scroll: window.scrollY, query: studentQuery, sort: studentSort, flag: studentFlag }; studentQuery = ""; studentFlag = "all"; selectedPersonId = null; activateTab("individual"); }
app.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open-tab]"); if (opener) { if (opener.dataset.subject) controls.subjectId.value = opener.dataset.subject; clearDetail(); activateTab(opener.dataset.openTab, false); if (opener.dataset.subject) document.getElementById("domain-matrix")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const person = e.target.closest("[data-person-id]"); if (person) { selectedPersonId = person.dataset.personId; if (activeTab !== "individual") { studentQuery = ""; studentFlag = "all"; activateTab("individual", false); } else render(); const detail = document.getElementById("person-detail"); detail?.focus({ preventScroll: true }); detail?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const cell = e.target.closest("[data-location-drill]"); if (cell) { const m = createDemoModel(data, currentFilters()), domain = m.locationDomains.rows.find((r) => r.id === cell.dataset.domainDrill), value = domain.cells.find((r) => r.locationId === cell.dataset.locationDrill); startDrill(value.personIds, `${locationName(value.locationId)}／${domain.label}／${latestLabel(m)}／${measures[matrixMeasure]} ${matrixMeasure.endsWith("Gap") ? pt(value.value) : pct(value.value)}`, domain.id); return; }
  const target = e.target.closest("[data-target-drill]"); if (target) { const g = createDemoModel(data, currentFilters()).targets.groups[Number(target.dataset.targetDrill)]; startDrill(g.personIds, `${g.targetLabel}／${g.schedule}`); return; }
  if (e.target.id === "back-to-comparison" && drill) { const saved = drill; studentQuery = saved.query; studentSort = saved.sort; studentFlag = saved.flag; clearDetail(); activateTab(saved.returnTab, false); window.scrollTo({ top: saved.scroll }); }
  if (e.target.id === "clear-drill") { clearDetail(); render(); }
  if (e.target.id === "export-button") downloadCsv(createDemoModel(data, currentFilters()));
});
app.addEventListener("keydown", (e) => { if (e.target.matches("circle[data-person-id]") && ["Enter", " "].includes(e.key)) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
app.addEventListener("change", (e) => { if (e.target.id === "matrix-measure") { matrixMeasure = e.target.value; render(); } if (e.target.id === "student-sort") { studentSort = e.target.value; render(); } if (e.target.id === "student-flag") { studentFlag = e.target.value; render(); } if (e.target.id === "export-confirm") document.getElementById("export-button").disabled = !(e.target.checked && document.getElementById("export-purpose").value.trim()); });
app.addEventListener("input", (e) => { if (["student-search", "target-search"].includes(e.target.id)) { const id = e.target.id, cursor = e.target.selectionStart; if (id === "student-search") studentQuery = e.target.value; else targetQuery = e.target.value; render(); const input = document.getElementById(id); input?.focus(); input?.setSelectionRange(cursor, cursor); } if (e.target.id === "export-purpose") document.getElementById("export-button").disabled = !(e.target.value.trim() && document.getElementById("export-confirm").checked); });
app.innerHTML = notice("データを読み込んでいます", "少しお待ちください。");
try { const response = await fetch("./data/demo-dataset.json", { cache: "no-store", credentials: "same-origin" }); if (!response.ok) throw new Error("dataset request failed"); data = await response.json(); populate(); render(); } catch { app.innerHTML = notice("データを読み込めませんでした", "画面を再読み込みしてください。改善しない場合は管理者へ連絡してください。", "danger"); }
