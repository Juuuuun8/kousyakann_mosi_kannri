import { createDemoModel, createMlDemoRows } from "./demo-engine.js";

const app = document.querySelector("#app");
const navItems = [...document.querySelectorAll("[data-tab]")];
const controls = { definitionId: document.querySelector("#definition-filter"), period: document.querySelector("#period-filter"), locations: document.querySelector("#location-filter"), schoolId: document.querySelector("#school-filter"), grade: document.querySelector("#grade-filter"), subjectId: document.querySelector("#subject-filter") };
let data;
let activeTab = "overview";
let selectedPersonId = null;
let studentQuery = "";
let studentSort = "deviation-desc";
let studentFlag = "all";

const escapeHtml = (value) => String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const pct = (value) => value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
const pt = (value) => value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}pt`;
const num = (value) => value === null || value === undefined ? "—" : Number(value).toFixed(1);
const subjectName = (id) => data.subjectDefinitions.find((item) => item.id === id)?.shortLabel ?? id;
const locationName = (id) => data.locations.find((item) => item.id === id)?.label ?? id;
const schoolName = (id) => data.schools.find((item) => item.id === id)?.label ?? id;

const pageCopy = {
  overview: ["状況をつかむ", "選択した模試・指標について、全校舎の状況と同一生徒の変化を確認します。"],
  compare: ["集団を比べる", "校舎・高校・教科・分野を、同じ模試と同じ指標で比較します。"],
  targets: ["志望校を確かめる", "第1志望だけでなく、第2・第3志望を含む判定と位置を確認します。"],
  individual: ["生徒を探す", "条件で生徒を探し、本人の推移・教科・全志望校を確認します。"],
  registration: ["登録・取込状況", "登録件数、帳票ごとの取得可能項目、データの由来を確認します。"],
  ml: ["ML用出力", "直接識別子を除いた学習用CSVを作成します。"],
};

function notice(title, body, tone = "info") { return `<div class="notice ${tone}" role="status"><span aria-hidden="true">${tone === "danger" ? "!" : "i"}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div></div>`; }
function metric(label, value, note, tone = "") { return `<article class="metric-card ${tone}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`; }
function bar(value, maximum = 100, tone = "") { const width = Math.max(0, Math.min(100, Number(value ?? 0) / maximum * 100)); return `<span class="bar-track"><span class="bar-fill ${tone}" style="width:${width}%"></span></span>`; }

function checkedLocationIds() { return [...controls.locations.querySelectorAll("input:checked")].map((input) => input.value); }
function currentFilters() {
  let events = data.examEvents.filter((event) => controls.definitionId.value === "all" || event.definitionId === controls.definitionId.value);
  if (controls.period.value === "latest-3") events = events.slice(-3);
  if (controls.period.value === "latest") events = events.slice(-1);
  return { definitionId: controls.definitionId.value, eventIds: events.map((event) => event.id), locationIds: checkedLocationIds(), schoolId: controls.schoolId.value, grade: controls.grade.value, subjectId: controls.subjectId.value, personId: selectedPersonId, suppressionThreshold: 5 };
}

function insights(model) {
  const weakSubject = [...model.subjects].filter((item) => item.sampleCount >= 5 && !item.aggregate).sort((a, b) => a.nationalGap - b.nationalGap)[0];
  const weakDomain = [...model.domains].filter((item) => item.sampleCount >= 5).sort((a, b) => a.sameAbilityGap - b.sameAbilityGap)[0];
  const items = [];
  if (weakSubject) items.push(`<li><span class="insight-icon down">↓</span><div><strong>${escapeHtml(weakSubject.label)}：全国平均との差 ${pt(weakSubject.nationalGap)}</strong><p>最新回・${weakSubject.sampleCount}人。原因や対応は自動判定しません。</p></div><button data-open-tab="compare" data-subject="${weakSubject.id}" type="button">分野を見る</button></li>`);
  if (weakDomain) items.push(`<li><span class="insight-icon">◇</span><div><strong>${escapeHtml(weakDomain.label)}：同学力帯との差 ${pt(weakDomain.sameAbilityGap)}</strong><p>同程度の偏差値帯との比較で確認できる事実です。</p></div><button data-open-tab="compare" data-subject="${weakDomain.subjectId}" type="button">校舎で比較</button></li>`);
  if (model.comparison.comparableCount) items.push(`<li><span class="insight-icon up">↗</span><div><strong>前回比${model.comparison.changeBandThreshold}pt以上の上昇が${model.comparison.improved}人</strong><p>同じ生徒・同じ模試形式・同じ指標の直近2回を比較しています。</p></div><button data-open-tab="compare" type="button">分布を見る</button></li>`);
  if (model.registration.pending) items.push(`<li><span class="insight-icon">!</span><div><strong>解析確認中が${model.registration.pending}件</strong><p>確定前の成績は分析に含めません。</p></div><button data-open-tab="registration" type="button">登録状況へ</button></li>`);
  return `<section class="card span-2"><div class="section-heading"><div><p class="overline">まず確認</p><h2>注目したい事実</h2></div><span class="help-text">推薦・指示はしません</span></div><ul class="insight-list">${items.join("")}</ul></section>`;
}

function trendChart(summaries, person = false) {
  const rows = summaries.filter((row) => (person ? row.value !== null : row.participants));
  if (!rows.length) return notice("表示できる推移がありません", "期間または条件を変更してください。", "warn");
  const series = person ? rows.map((row) => row.value) : rows.map((row) => row.rate.mean);
  const peer = person ? rows.map((row) => row.peerValue) : [];
  const values = [...series, ...peer].filter((value) => value !== null);
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  const points = (valuesToMap) => rows.map((row, index) => ({ x: rows.length === 1 ? 50 : 6 + index / (rows.length - 1) * 88, y: 90 - ((valuesToMap[index] - min) / Math.max(1, max - min)) * 74, row, value: valuesToMap[index] }));
  const primary = points(series);
  const peerPoints = person ? points(peer) : [];
  const poly = (items) => items.map((item) => `${item.x},${item.y}`).join(" ");
  return `<div class="line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="得点率の推移"><line x1="4" y1="90" x2="96" y2="90" class="axis"/>${person ? `<polyline points="${poly(peerPoints)}" class="peer-line"/>` : ""}<polyline points="${poly(primary)}" class="trend-line"/>${primary.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.4"><title>${escapeHtml(point.row.label)} ${pct(point.value)}</title></circle>`).join("")}</svg><div class="chart-labels">${primary.map((point) => `<span><strong>${pct(point.value)}</strong><small>${escapeHtml(point.row.shortLabel)}</small>${person ? `<em>校舎 ${pct(point.row.peerValue)}</em>` : `<em>${point.row.participants}人</em>`}</span>`).join("")}</div>${person ? `<div class="chart-legend"><span class="primary-line">本人</span><span class="peer-key">同じ校舎の平均</span></div>` : ""}</div>`;
}

function subjectCards(model, limit = 14) {
  return `<div class="subject-grid">${model.subjects.slice(0, limit).map((row) => `<button class="subject-card" data-open-tab="compare" data-subject="${row.id}" type="button"><span>${escapeHtml(row.label)}${row.aggregate ? `<small>帳票掲載総合</small>` : ""}</span><strong>${pct(row.rate.mean)}</strong>${bar(row.rate.mean)}<small>全国平均との差 <b class="${row.nationalGap >= 0 ? "positive" : "negative"}">${pt(row.nationalGap)}</b>・${row.sampleCount}人</small></button>`).join("")}</div>`;
}

function overview(model) {
  return `<div class="metric-grid">${metric("対象生徒", `${model.scope.students}人`, `${model.events.length}回・同一指標`)}${metric(`${model.selectedMetric.label} 平均`, pct(model.scope.latestRate.mean), `中央値 ${pct(model.scope.latestRate.median)}`)}${metric("前回と比較可能", `${model.comparison.comparableCount}人`, `平均変化 ${pt(model.comparison.change.mean)}`)}${metric("登録済みPDF", `${model.registration.active}件`, `確認中 ${model.registration.pending}件`)}</div><div class="content-grid">${insights(model)}<section class="card span-2"><div class="section-heading"><div><p class="overline">${escapeHtml(model.selectedDefinition.label)}／${escapeHtml(model.selectedMetric.label)}</p><h2>同一指標の推移</h2></div><span class="help-text">異なる模試形式はつなぎません</span></div>${trendChart(model.eventSummary)}</section><section class="card span-2"><div class="section-heading"><div><p class="overline">最新回</p><h2>帳票掲載の教科・総合指標</h2></div><button data-open-tab="compare" type="button" class="link-button">集団・分野まで見る</button></div>${subjectCards(model)}</section></div>`;
}

function boxPlot(group) {
  if (group.suppressed || !group.count) return `<span class="suppressed-note">5人未満</span>`;
  return `<div class="boxplot" aria-label="${escapeHtml(group.label)}の分布"><span class="whisker" style="left:${group.minimum}%;width:${group.maximum - group.minimum}%"></span><span class="box" style="left:${group.p25}%;width:${group.p75 - group.p25}%"></span><span class="median" style="left:${group.median}%"></span><i style="left:${group.minimum}%"></i><i style="left:${group.maximum}%"></i></div>`;
}

function compare(model) {
  const campusGroups = model.groups.filter((group) => group.kind === "校舎");
  const schoolGroups = model.groups.filter((group) => group.kind === "高校");
  const rows = (groups) => groups.map((group) => `<tr><td>${escapeHtml(group.label)}</td><td>${group.memberCount}人</td><td>${group.suppressed ? "—" : pct(group.mean)}</td><td>${group.suppressed ? "—" : pct(group.median)}</td><td>${group.suppressed ? "—" : `${pct(group.p25)}～${pct(group.p75)}`}</td><td class="distribution-cell">${boxPlot(group)}</td></tr>`).join("");
  const total = model.comparison.comparableCount || 1;
  const band = model.comparison.changeBandThreshold;
  return `<div class="metric-grid three">${metric(`上昇（${band}pt以上）`, `${model.comparison.improved}人`, `${Math.round(model.comparison.improved / total * 100)}%`, "positive-card")}${metric("ほぼ横ばい", `${model.comparison.unchanged}人`, `±${band}pt未満`)}${metric(`低下（${band}pt以上）`, `${model.comparison.declined}人`, `${Math.round(model.comparison.declined / total * 100)}%`, "attention-card")}</div><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">${escapeHtml(model.selectedMetric.label)}／校舎別</p><h2>中央値とばらつき</h2></div><span class="help-text">線：最小～最大／箱：中央50%</span></div><div class="table-wrap"><table><thead><tr><th>校舎</th><th>人数</th><th>平均</th><th>中央値</th><th>中央50%</th><th>得点率0～100%</th></tr></thead><tbody>${rows(campusGroups)}</tbody></table></div><p class="footnote">箱の幅は中央50%の散らばりを示します。二極化や原因までは判断できないため、必要に応じて個人分布を確認します。</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">${escapeHtml(model.selectedMetric.label)}／高校別</p><h2>高校ごとの比較</h2></div><span class="help-text">5人未満は非表示</span></div><div class="table-wrap"><table><thead><tr><th>高校</th><th>人数</th><th>平均</th><th>中央値</th><th>中央50%</th><th>分布</th></tr></thead><tbody>${rows(schoolGroups)}</tbody></table></div></section></div>${subjects(model)}`;
}

function campusDomainMatrix(model) {
  const matrix = model.locationDomains;
  if (!matrix.rows.length) return notice("校舎×分野を表示できません", "分野情報のある模試・教科を選んでください。", "warn");
  const rows = matrix.rows.map((row) => `<tr><td><small>${escapeHtml(subjectName(row.subjectId))}</small><strong>${escapeHtml(row.label)}</strong></td>${row.cells.map((cell) => { const intensity = Math.min(1, Math.abs(cell.gap ?? 0) / 10); const color = cell.gap === null ? "transparent" : cell.gap >= 0 ? `rgba(13,110,253,${.08 + intensity * .32})` : `rgba(220,53,69,${.08 + intensity * .28})`; return `<td><button class="matrix-cell" data-location-drill="${cell.locationId}" style="background:${color}" ${cell.value === null ? "disabled" : ""}><strong>${pct(cell.value)}</strong><small>${cell.gap === null ? (cell.suppressed ? "5人未満" : "—") : `全体比 ${pt(cell.gap)}`}</small></button></td>`; }).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table class="matrix-table"><thead><tr><th>教科・分野</th>${matrix.locations.map((location) => `<th>${escapeHtml(location.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><p class="footnote">各マスは選択中の全校舎平均との差です。青は上、赤は下。マスを押すとその校舎だけに絞れます。</p>`;
}

function subjects(model) {
  const domains = [...model.domains].sort((a, b) => a.sameAbilityGap - b.sameAbilityGap);
  const summary = `<section class="card"><div class="section-heading"><div><p class="overline">PDF確認済み${model.subjects.length}項目</p><h2>教科・帳票掲載総合の最新状況</h2></div><span class="help-text">比較したい科目を選択</span></div>${subjectCards(model, 30)}</section>`;
  if (model.selectedMetric.aggregate) return `${summary}<div class="content-grid"><section class="card span-2">${notice("分野・設問を見るには教科を選択", "上の教科カードを選ぶと、同じ画面で校舎×分野、同学力帯差、設問結果へ掘り下げられます。")}</section></div>`;
  const questionRows = model.answers.questions.slice(0, 12).map((row) => `<tr><td>${escapeHtml(subjectName(row.subjectId))}</td><td>${escapeHtml(row.label)}</td><td>${pct(row.correctRate)}</td><td>${pct(row.partialRate)}</td><td>${pct(row.blankRate)}</td><td>${row.count}件</td></tr>`).join("");
  const labels = { correct: "正答", wrong: "誤答", partial: "部分点", blank: "無回答", extra: "余分マーク" };
  return `${summary}<div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">最大の校舎差を一目で</p><h2>校舎 × 分野マトリクス</h2></div><span class="count-chip">${escapeHtml(model.locationDomains.event?.shortLabel)}</span></div>${campusDomainMatrix(model)}</section><section class="card span-2"><div class="section-heading"><div><p class="overline">分野 × 模試</p><h2>分野別得点率の推移</h2></div><span class="help-text">全国差・同学力帯差を分離</span></div>${domains.length ? `<div class="table-wrap"><table class="heat-table"><thead><tr><th>教科・分野</th>${model.events.map((event) => `<th>${escapeHtml(event.shortLabel)}</th>`).join("")}<th>全国差</th><th>同学力帯差</th></tr></thead><tbody>${domains.map((row) => `<tr><td><small>${escapeHtml(subjectName(row.subjectId))}</small><strong>${escapeHtml(row.label)}</strong></td>${row.byEvent.map((point) => `<td><span class="heat-cell" style="--heat:${point.value ?? 0}%">${pct(point.value)}</span></td>`).join("")}<td class="${row.nationalGap >= 0 ? "positive" : "negative"}">${pt(row.nationalGap)}</td><td class="${row.sameAbilityGap >= 0 ? "positive" : "negative"}">${pt(row.sameAbilityGap)}</td></tr>`).join("")}</tbody></table></div>` : notice("分野データがありません", "条件を変更してください。", "warn")}</section><section class="card"><div class="section-heading"><div><p class="overline">設問マーク</p><h2>解答の内訳</h2></div><span class="count-chip">${model.answers.count.toLocaleString()}件</span></div><div class="answer-stack">${model.answers.parts.map((part) => `<span class="${part.key}" style="width:${part.rate * 100}%"><i>${part.rate >= .08 ? `${Math.round(part.rate * 100)}%` : ""}</i></span>`).join("")}</div><div class="answer-legend">${model.answers.parts.map((part) => `<span class="${part.key}">${labels[part.key]} ${Math.round(part.rate * 100)}%</span>`).join("")}</div><p class="footnote">無回答は事実として表示し、時間不足などの原因は断定しません。</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">正答率の低い順</p><h2>設問・分野の事実</h2></div></div>${questionRows ? `<div class="table-wrap"><table><thead><tr><th>教科</th><th>分野</th><th>正答率</th><th>部分点率</th><th>無回答率</th><th>解答数</th></tr></thead><tbody>${questionRows}</tbody></table></div>` : notice("設問データがありません", "期間を変更してください。", "warn")}</section></div>`;
}

function targets(model) {
  if (!model.targets.sampleCount) return notice("志望校判定を表示できません", "志望校情報を含む回を選んでください。", "warn");
  const total = model.targets.sampleCount || 1;
  const preferenceRows = model.targets.byPreference.map((item) => `<tr><td>第${item.order}志望</td><td>${item.count}件</td>${item.counts.map((count) => `<td>${count.count}</td>`).join("")}<td>${pt(item.borderGap.median)}</td></tr>`).join("");
  const groupRows = model.targets.groups.map((group) => `<tr><td><strong>${escapeHtml(group.university)}</strong><small>${escapeHtml(group.faculty)}／${escapeHtml(group.program)}</small></td><td>${group.studentCount}人</td><td>${group.preferenceOrders.map((order) => `第${order}`).join("・")}</td><td>${group.aToC}/${group.count}件</td><td class="${group.borderGap >= 0 ? "positive" : "negative"}">${pt(group.borderGap)}</td></tr>`).join("");
  return `<div class="metric-grid">${metric("対象生徒", `${model.targets.studentCount}人`, `${model.targets.sampleCount}志望を集計`)}${metric("A～C判定の志望あり", `${model.targets.hasAToC}人`, "第1～第3志望のいずれか")}${metric(model.targets.rule.labels.targets, `${model.targets.allConfiguredJudgement}人`, "管理者設定の確認条件")}${metric("全志望のボーダー差", pt(model.targets.borderGap.median), `中央50% ${pt(model.targets.borderGap.p25)}～${pt(model.targets.borderGap.p75)}`)}</div><div class="judgement-grid">${model.targets.counts.map((item) => `<article class="judgement ${item.label.toLowerCase()}"><span>${item.label}判定</span><strong>${item.count}件</strong><small>全${total}志望の${Math.round(item.count / total * 100)}%</small></article>`).join("")}</div><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">志望順位別</p><h2>第1～第3志望の判定構成</h2></div><span class="help-text">同じ生徒を志望順位ごとに表示</span></div><div class="table-wrap"><table><thead><tr><th>志望順位</th><th>件数</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>ボーダー差中央値</th></tr></thead><tbody>${preferenceRows}</tbody></table></div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">正規化した志望先別</p><h2>大学・学部・方式を混同しない比較</h2></div><span class="help-text">原表記も別に保持</span></div><div class="table-wrap"><table><thead><tr><th>大学・学部・方式</th><th>生徒数</th><th>志望順位</th><th>A～C／全判定</th><th>平均ボーダー差</th></tr></thead><tbody>${groupRows}</tbody></table></div></section><section class="card span-2">${notice("判定だけで結論を出さない", "第1志望だけでなく併願候補を含む事実を整理します。次に誰へ何を指導するかは担当者が判断します。確認条件は管理者が変更でき、システムは原因を決めません。")}</section></div>`;
}

function sortedStudents(model) {
  const query = studentQuery.trim().toLowerCase();
  const rows = model.studentList.filter((row) => !query || [row.displayLabel, locationName(row.locationId), schoolName(row.schoolId), ...row.targetLabels, row.grade, row.judgement].some((value) => String(value ?? "").toLowerCase().includes(query))).filter((row) => studentFlag === "all" || row.followUpFlags.includes(studentFlag));
  const [key, direction] = studentSort.split("-");
  const getters = { deviation: (row) => row.deviation ?? -Infinity, change: (row) => row.change ?? -Infinity, name: (row) => row.displayLabel };
  return rows.sort((a, b) => { const av = getters[key](a); const bv = getters[key](b); return typeof av === "string" ? av.localeCompare(bv, "ja") * (direction === "asc" ? 1 : -1) : (av - bv) * (direction === "asc" ? 1 : -1); });
}

function individual(model) {
  const detail = model.individual;
  if (!detail) return notice("表示できる生徒がいません", "条件を変更してください。", "warn");
  selectedPersonId = detail.person.personId;
  const list = sortedStudents(model);
  const listRows = list.map((row) => `<tr class="${row.personId === detail.person.personId ? "selected-row" : ""}"><td><button class="student-link" data-person-id="${row.personId}">${escapeHtml(row.displayLabel)}</button><small>${escapeHtml(row.grade)}</small></td><td>${escapeHtml(locationName(row.locationId))}</td><td>${escapeHtml(schoolName(row.schoolId))}</td><td>${num(row.deviation)}</td><td class="${row.change >= 0 ? "positive" : "negative"}">${pt(row.change)}</td><td>${row.judgement ? `<span class="judgement-chip ${row.judgement.toLowerCase()}">${row.judgement}</span>` : "—"}</td><td>${row.followUpFlags.length ? row.followUpFlags.map((flag) => `<span class="fact-chip">${escapeHtml(model.dataQuality.followUpRules.labels[flag])}</span>`).join("") : "—"}</td></tr>`).join("");
  const targetRows = detail.targets.map((row) => `<tr><td>第${row.preferenceOrder}志望</td><td>${escapeHtml(row.targetLabel)}</td><td><span class="judgement-chip ${row.judgement.toLowerCase()}">${row.judgement}</span></td><td>${pt(row.borderGap)}</td><td>${row.rank}/${row.population}位</td></tr>`).join("");
  return `<section class="card student-list-card"><div class="section-heading"><div><p class="overline">校舎横断</p><h2>生徒一覧</h2></div><span class="count-chip">${list.length}/${model.studentList.length}人</span></div><div class="student-toolbar"><label>生徒を検索<input id="student-search" type="search" value="${escapeHtml(studentQuery)}" placeholder="氏名・校舎・高校・志望校"></label><label>確認条件<select id="student-flag"><option value="all"${studentFlag === "all" ? " selected" : ""}>すべて表示</option><option value="decline"${studentFlag === "decline" ? " selected" : ""}>${escapeHtml(model.dataQuality.followUpRules.labels.decline)}</option><option value="targets"${studentFlag === "targets" ? " selected" : ""}>${escapeHtml(model.dataQuality.followUpRules.labels.targets)}</option></select></label><label>並び順<select id="student-sort"><option value="deviation-desc"${studentSort === "deviation-desc" ? " selected" : ""}>偏差値が高い順</option><option value="change-asc"${studentSort === "change-asc" ? " selected" : ""}>前回比が低い順</option><option value="change-desc"${studentSort === "change-desc" ? " selected" : ""}>前回比が高い順</option><option value="name-asc"${studentSort === "name-asc" ? " selected" : ""}>氏名順</option></select></label></div><p class="footnote">確認条件はデモの管理者設定です。該当しても対応や原因を意味しません。</p><div class="table-wrap student-table"><table><thead><tr><th>生徒</th><th>校舎</th><th>高校</th><th>${escapeHtml(model.selectedMetric.label)}偏差値</th><th>同一指標の前回比</th><th>第1志望</th><th>確認条件</th></tr></thead><tbody>${listRows}</tbody></table></div></section><section class="selected-person"><div><p class="overline">選択中</p><h2>${escapeHtml(detail.person.displayLabel)}</h2></div><div><span>${escapeHtml(locationName(detail.person.locationId))}</span><span>${escapeHtml(schoolName(detail.person.schoolId))}</span><span>${escapeHtml(detail.person.grade)}</span><span>照合確認済み</span></div></section><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">${escapeHtml(model.selectedDefinition.label)}／本人と同じ校舎平均</p><h2>${escapeHtml(model.selectedMetric.label)}の推移</h2></div><span class="help-text">同じ模試形式・同じ指標だけを接続</span></div>${trendChart(detail.byEvent, true)}</section><section class="card span-2"><div class="section-heading"><div><p class="overline">最新回</p><h2>教科バランス</h2></div><span class="help-text">PDF確認済みの受験科目</span></div><div class="student-subjects">${detail.subjects.map((row) => `<div><span>${escapeHtml(row.label)}</span>${bar(row.scoreRate)}<strong>${pct(row.scoreRate)}</strong><small>偏差値 ${num(row.deviation)}</small></div>`).join("")}</div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">全志望順位</p><h2>判定と位置</h2></div></div>${targetRows ? `<div class="table-wrap"><table><thead><tr><th>順位</th><th>志望先</th><th>判定</th><th>ボーダー差</th><th>志望者内</th></tr></thead><tbody>${targetRows}</tbody></table></div>` : notice("志望校判定がありません", "対象回に志望校情報がありません。", "warn")}</section></div>`;
}

function registration(model) {
  const rows = model.registration.progress.map((row) => `<tr><td>${escapeHtml(data.examEvents.find((item) => item.id === row.eventId)?.shortLabel)}</td><td>${escapeHtml(locationName(row.locationId))}</td><td>${row.active}件</td><td>${row.pending ? `<span class="status warning">確認中 ${row.pending}件</span>` : `<span class="status success">確定</span>`}</td><td>${row.superseded ? `${row.superseded}件` : "—"}</td></tr>`).join("");
  const cap = model.dataQuality.sourceCapabilities;
  const profile = model.dataQuality.capabilityProfiles.find((item) => model.dataQuality.schemaVersions.includes(item.schemaVersion));
  const capabilityLabels = { subjectScores: "教科成績", deviation: "偏差値", ranks: "順位・母数", trends: "過去回", domains: "分野", answerMarks: "設問マーク", targets: "志望校" };
  const capabilityRows = Object.entries(profile.supports).map(([key, supported]) => `<tr><td>${escapeHtml(capabilityLabels[key] ?? key)}</td><td><span class="status ${supported ? "success" : "warning"}">${supported ? "取得可能" : "この帳票では非対応"}</span></td></tr>`).join("");
  const provenance = model.dataQuality.provenance.map((row) => `<article class="provenance ${row.source.toLowerCase()}"><span>${escapeHtml(row.source)}</span><strong>${escapeHtml(row.label)}</strong><p>${escapeHtml(row.fields)}</p></article>`).join("");
  return `${notice("対応範囲", model.dataQuality.supportedScope)}<div class="metric-grid">${metric("登録済み", `${model.registration.active}件`, "分析に反映")}${metric("確認中", `${model.registration.pending}件`, "確定まで集計しない", "attention-card")}${metric("差し替え履歴", `${model.registration.superseded}件`, "最新版だけを集計")}${metric("パーサー判定", `${cap.parserStatus} / ${cap.detectionStatus}`, "添付PDFで実行確認")}</div><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">取込件数</p><h2>校舎別の登録状況</h2></div><a class="link-button primary" href="./upload.html">PDFを登録する</a></div><div class="table-wrap"><table><thead><tr><th>模試</th><th>校舎</th><th>登録済み</th><th>状態</th><th>差し替え</th></tr></thead><tbody>${rows}</tbody></table></div><p class="footnote">PDFだけでは未受験者や提出予定人数が分からないため、根拠のない進捗率は表示しません。</p></section><section class="card"><div class="section-heading"><div><p class="overline">SchemaVersionごとに判定</p><h2>この帳票で使える分析</h2></div><span class="count-chip">${escapeHtml(profile.schemaVersion)}</span></div><div class="table-wrap"><table><thead><tr><th>情報</th><th>状態</th></tr></thead><tbody>${capabilityRows}</tbody></table></div><p class="footnote">別模試で取得できない項目は欠損ではなく「非対応」として、その分析自体を表示しません。</p></section><section class="card"><div class="section-heading"><div><p class="overline">添付PDF1件で確認</p><h2>抽出できた件数</h2></div><span class="count-chip">READY / MATCH</span></div><div class="capability-grid compact"><article><strong>${cap.summaryMetrics}</strong><span>教科・総合</span></article><article><strong>${cap.domainResults}</strong><span>分野</span></article><article><strong>${cap.targets}</strong><span>志望校</span></article><article><strong>${cap.answerMarks}</strong><span>設問マーク</span></article></div><p class="footnote">模試回・受験科目により件数は変わります。</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">データの由来</p><h2>PDF・入力・算出を混同しない</h2></div></div><div class="provenance-grid">${provenance}</div></section></div>`;
}

function ml(model) {
  const rows = createMlDemoRows(data, model);
  return `<section class="card narrow-card"><div class="section-heading"><div><p class="overline">将来の機械学習に備える</p><h2>匿名化CSVを作成</h2></div><span class="count-chip">${rows.length.toLocaleString()}行</span></div>${notice("出力する内容", "氏名を含めず、ML用ID、模試回、校舎、高校、指標定義、教科、得点、偏差値、欠損理由を出力します。", "info")}<div class="export-form"><label>利用目的<input id="export-purpose" type="text" maxlength="120" placeholder="例：成績推移モデルの検証"></label><label class="check-row"><input id="export-confirm" type="checkbox">用途を限定し、適切に保存し、不要になったら削除します</label><button id="export-button" class="primary-button" type="button" disabled>架空データのCSVをダウンロード</button><p id="export-status" class="footnote" aria-live="polite">このデモでは架空データだけを出力します。</p></div></section>`;
}

function csvCell(value) { if (value === null || value === undefined) return '""'; const raw = String(value); const safe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; }
function downloadCsv(model) { const rows = createMlDemoRows(data, model); const columns = Object.keys(rows[0] ?? {}); const csv = `\uFEFF${[columns, ...rows.map((row) => columns.map((key) => row[key]))].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "moshi_ml_demo.csv"; link.click(); URL.revokeObjectURL(url); app.querySelector("#export-status").textContent = `${rows.length.toLocaleString()}行を出力しました。`; }

function render() {
  if (!data) { app.innerHTML = notice("データを読み込んでいます", "少しお待ちください。"); return; }
  const model = createDemoModel(data, currentFilters());
  const [title, description] = pageCopy[activeTab];
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-description").textContent = description;
  document.querySelector("#scope-summary").textContent = `${model.scope.students}人・${checkedLocationIds().length}校舎・${model.events.length}回を表示`;
  const eventContext = model.events.length === 1 ? model.events[0].label : `${model.events[0].shortLabel}～${model.events.at(-1).shortLabel}`;
  document.querySelector("#context-bar").innerHTML = `<strong>現在の表示</strong><span>${escapeHtml(model.selectedDefinition.label)}</span><span>${escapeHtml(eventContext)}</span><span>${escapeHtml(model.selectedMetric.label)}</span><span>${checkedLocationIds().length === data.locations.length ? "全校舎" : `${checkedLocationIds().length}校舎を比較`}</span>`;
  if (!checkedLocationIds().length) { app.innerHTML = notice("校舎が選ばれていません", "比較する校舎を1つ以上選んでください。", "warn"); return; }
  if (!model.people.length || !model.events.length) { app.innerHTML = notice("条件に合うデータがありません", "条件を元に戻すか、別の条件を選んでください。", "warn"); return; }
  if (model.suppressed && !["registration", "ml", "individual"].includes(activeTab)) { app.innerHTML = notice("少人数のため集計値を表示しません", "5人未満の集計値は表示しません。", "warn"); return; }
  app.innerHTML = ({ overview, compare, targets, individual, registration, ml }[activeTab] ?? overview)(model);
}

function activateTab(tab) { activeTab = tab; navItems.forEach((item) => { const selected = item.dataset.tab === tab; item.classList.toggle("is-active", selected); item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1; }); if (["registration", "ml"].includes(tab)) document.querySelector(".admin-nav").open = true; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }

function updateSchoolOptions() {
  const selected = new Set(checkedLocationIds());
  [...controls.schoolId.options].forEach((option) => { option.hidden = option.value !== "all" && !selected.has(data.schools.find((school) => school.id === option.value)?.locationId); });
  if (controls.schoolId.selectedOptions[0]?.hidden) controls.schoolId.value = "all";
}

function populate() {
  data.examDefinitions.forEach((item) => controls.definitionId.add(new Option(item.label, item.id)));
  controls.locations.innerHTML = data.locations.map((item) => `<label><input type="checkbox" value="${item.id}" checked><span>${escapeHtml(item.label)}</span></label>`).join("");
  data.schools.forEach((item) => controls.schoolId.add(new Option(item.label, item.id)));
  data.subjectDefinitions.filter((item) => item.comparisonEligible).forEach((item) => controls.subjectId.add(new Option(`${item.label}${item.aggregate ? "（帳票掲載総合）" : ""}`, item.id)));
  controls.definitionId.value = data.examDefinitions[0].id;
  controls.subjectId.value = data.meta.defaultComparisonSubjectId;
  document.querySelector("#dataset-version").textContent = `${data.students.length}人・全統共通テスト模試 ${data.examEvents.length}回`;
}

navItems.forEach((item) => item.addEventListener("click", () => activateTab(item.dataset.tab)));
document.querySelector(".side-nav").addEventListener("keydown", (event) => { if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = Math.max(0, navItems.indexOf(document.activeElement)); const next = event.key === "Home" ? 0 : event.key === "End" ? navItems.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + navItems.length) % navItems.length; navItems[next].focus(); navItems[next].click(); });
[controls.definitionId, controls.period, controls.schoolId, controls.grade, controls.subjectId].forEach((control) => control.addEventListener("change", () => { selectedPersonId = null; render(); }));
controls.locations.addEventListener("change", () => { selectedPersonId = null; updateSchoolOptions(); render(); });
document.querySelector("#select-all-locations").addEventListener("click", () => { controls.locations.querySelectorAll("input").forEach((input) => { input.checked = true; }); updateSchoolOptions(); render(); });
document.querySelector("#reset-filters").addEventListener("click", () => { controls.definitionId.value = data.examDefinitions[0].id; controls.period.value = "all"; controls.schoolId.value = "all"; controls.grade.value = "all"; controls.subjectId.value = data.meta.defaultComparisonSubjectId; controls.locations.querySelectorAll("input").forEach((input) => { input.checked = true; }); selectedPersonId = null; studentQuery = ""; studentSort = "deviation-desc"; studentFlag = "all"; updateSchoolOptions(); render(); });
app.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open-tab]");
  if (opener) { if (opener.dataset.subject) controls.subjectId.value = opener.dataset.subject; activateTab(opener.dataset.openTab); return; }
  const person = event.target.closest("[data-person-id]");
  if (person) { selectedPersonId = person.dataset.personId; render(); document.querySelector(".selected-person")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const location = event.target.closest("[data-location-drill]");
  if (location) { controls.locations.querySelectorAll("input").forEach((input) => { input.checked = input.value === location.dataset.locationDrill; }); updateSchoolOptions(); render(); return; }
  if (event.target.id === "export-button") downloadCsv(createDemoModel(data, currentFilters()));
});
app.addEventListener("change", (event) => {
  if (event.target.id === "student-sort") { studentSort = event.target.value; render(); }
  if (event.target.id === "student-flag") { studentFlag = event.target.value; render(); }
  if (event.target.id === "export-confirm") app.querySelector("#export-button").disabled = !(event.target.checked && app.querySelector("#export-purpose").value.trim());
});
app.addEventListener("input", (event) => {
  if (event.target.id === "student-search") { studentQuery = event.target.value; const cursor = event.target.selectionStart; render(); const input = app.querySelector("#student-search"); input?.focus(); input?.setSelectionRange(cursor, cursor); }
  if (event.target.id === "export-purpose") app.querySelector("#export-button").disabled = !(event.target.value.trim() && app.querySelector("#export-confirm").checked);
});

app.innerHTML = notice("データを読み込んでいます", "少しお待ちください。");
try { const response = await fetch("./data/demo-dataset.json", { cache: "no-store", credentials: "same-origin" }); if (!response.ok) throw new Error("dataset request failed"); data = await response.json(); populate(); render(); } catch { app.innerHTML = notice("データを読み込めませんでした", "画面を再読み込みしてください。改善しない場合は管理者へ連絡してください。", "danger"); }
