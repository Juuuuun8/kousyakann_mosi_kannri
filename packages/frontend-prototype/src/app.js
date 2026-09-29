import { createDemoModel, createMlDemoRows } from "./demo-engine.js";

const app = document.querySelector("#app");
const navItems = [...document.querySelectorAll("[data-tab]")];
const controls = {
  definitionId: document.querySelector("#definition-filter"), period: document.querySelector("#period-filter"), locationId: document.querySelector("#location-filter"), schoolId: document.querySelector("#school-filter"), grade: document.querySelector("#grade-filter"), subjectId: document.querySelector("#subject-filter"),
};
let data;
let activeTab = "overview";
let selectedPersonId = null;

const escapeHtml = (value) => String(value ?? "—").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const pct = (value) => value === null ? "—" : `${Number(value).toFixed(1)}%`;
const pt = (value) => value === null ? "—" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}pt`;
const num = (value) => value === null ? "—" : Number(value).toFixed(1);
const eventName = (id) => data.examEvents.find((item) => item.id === id)?.shortLabel ?? id;
const subjectName = (id) => data.subjectDefinitions.find((item) => item.id === id)?.shortLabel ?? id;

const pageCopy = {
  overview: ["現在地", "全校舎の最新状況と、前回からの変化を確認できます。"],
  compare: ["比較", "模試・校舎・高校を同じ基準で比べられます。"],
  subjects: ["教科・設問", "教科から分野、設問へ掘り下げて確認できます。"],
  targets: ["志望校", "判定だけでなく、ボーダー差と教科差を確認できます。"],
  individual: ["生徒", "一人の推移・教科バランス・志望校判定をまとめて確認できます。"],
  registration: ["登録状況", "各校舎の提出状況と、取り込める情報を確認できます。"],
  ml: ["ML用出力", "個人を直接特定する項目を除いた学習用CSVを作成します。"],
};

function notice(title, body, tone = "info") {
  return `<div class="notice ${tone}" role="status"><span aria-hidden="true">${tone === "danger" ? "!" : "i"}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div></div>`;
}

function metric(label, value, note, tone = "") {
  return `<article class="metric-card ${tone}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function bar(value, maximum = 100, tone = "") {
  const width = Math.max(0, Math.min(100, value / maximum * 100));
  return `<span class="bar-track"><span class="bar-fill ${tone}" style="width:${width}%"></span></span>`;
}

function currentFilters() {
  let events = data.examEvents.filter((event) => controls.definitionId.value === "all" || event.definitionId === controls.definitionId.value);
  if (controls.period.value === "latest-3") events = events.slice(-3);
  if (controls.period.value === "latest") events = events.slice(-1);
  return { definitionId: controls.definitionId.value, eventIds: events.map((event) => event.id), locationId: controls.locationId.value, schoolId: controls.schoolId.value, grade: controls.grade.value, subjectId: controls.subjectId.value, personId: selectedPersonId, suppressionThreshold: 5 };
}

function insights(model) {
  const weakSubject = [...model.subjects].filter((item) => item.sampleCount >= 5).sort((a, b) => a.nationalGap - b.nationalGap)[0];
  const weakDomain = [...model.domains].filter((item) => item.sampleCount >= 5).sort((a, b) => a.sameAbilityGap - b.sameAbilityGap)[0];
  const registrationTotal = model.registration.progress.reduce((sum, row) => sum + row.expected, 0);
  const registered = model.registration.progress.reduce((sum, row) => sum + row.registered, 0);
  const items = [];
  if (weakSubject) {
    const finding = weakSubject.nationalGap < 0 ? `全国平均を${Math.abs(weakSubject.nationalGap).toFixed(1)}pt下回る` : `全国平均との差が最も小さい（${pt(weakSubject.nationalGap)}）`;
    items.push(`<li><span class="insight-icon down">↓</span><div><strong>${escapeHtml(weakSubject.label)}は${finding}</strong><p>最新回・受験者${weakSubject.sampleCount}人の集計です。原因は自動判定していません。</p></div><button data-open-tab="subjects" data-subject="${weakSubject.id}" type="button">詳しく見る</button></li>`);
  }
  if (weakDomain) {
    const finding = weakDomain.sameAbilityGap < 0 ? `同学力帯を${Math.abs(weakDomain.sameAbilityGap).toFixed(1)}pt下回る` : `同学力帯との差が最も小さい（${pt(weakDomain.sameAbilityGap)}）`;
    items.push(`<li><span class="insight-icon">◇</span><div><strong>${escapeHtml(weakDomain.label)}は${finding}</strong><p>教科全体では見えにくい分野差です。</p></div><button data-open-tab="subjects" data-subject="${weakDomain.subjectId}" type="button">設問まで見る</button></li>`);
  }
  if (model.comparison.comparableCount) items.push(`<li><span class="insight-icon up">↗</span><div><strong>前回比3pt以上の上昇が${model.comparison.improved}人</strong><p>同じ生徒・同じ形式の共通テスト模試2回を比較しています。</p></div><button data-open-tab="compare" type="button">変化を比較</button></li>`);
  if (registrationTotal) items.push(`<li><span class="insight-icon">✓</span><div><strong>成績表の登録は${registered}/${registrationTotal}件</strong><p>未登録や確認中の校舎を一覧で確認できます。</p></div><button data-open-tab="registration" type="button">登録状況へ</button></li>`);
  return `<section class="card span-2"><div class="section-heading"><div><p class="overline">まず確認</p><h2>注目したい変化</h2></div><span class="help-text">事実だけを表示</span></div><ul class="insight-list">${items.join("")}</ul></section>`;
}

function lineChart(model) {
  const summaries = model.eventSummary.filter((item) => item.participants);
  if (!summaries.length) return notice("表示できる推移がありません", "模試の種類や期間を変更してください。", "warn");
  const values = summaries.map((item) => item.rate.mean ?? 0);
  const min = Math.min(...values, 35) - 5;
  const max = Math.max(...values, 80) + 5;
  const points = summaries.map((item, index) => ({ x: summaries.length === 1 ? 50 : index / (summaries.length - 1) * 100, y: 94 - ((item.rate.mean - min) / (max - min)) * 78, item }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  return `<div class="line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="選択期間の平均得点率推移"><line x1="0" y1="94" x2="100" y2="94" class="axis"/><polyline points="${polyline}" class="trend-line"/>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.3"><title>${escapeHtml(point.item.label)} ${pct(point.item.rate.mean)}</title></circle>`).join("")}</svg><div class="chart-labels">${points.map((point) => `<span><strong>${pct(point.item.rate.mean)}</strong><small>${escapeHtml(point.item.shortLabel)}</small><em>${point.item.participants}人</em></span>`).join("")}</div></div>`;
}

function subjectCards(model, limit = 8) {
  return `<div class="subject-grid">${model.subjects.slice(0, limit).map((row) => `<button class="subject-card" data-open-tab="subjects" data-subject="${row.id}" type="button"><span>${escapeHtml(row.label)}</span><strong>${pct(row.rate.mean)}</strong>${bar(row.rate.mean)}<small>全国平均との差 <b class="${row.nationalGap >= 0 ? "positive" : "negative"}">${pt(row.nationalGap)}</b> · ${row.sampleCount}人</small></button>`).join("")}</div>`;
}

function overview(model) {
  const registrationTotal = model.registration.progress.reduce((sum, row) => sum + row.expected, 0);
  const registered = model.registration.progress.reduce((sum, row) => sum + row.registered, 0);
  return `<div class="metric-grid">${metric("対象生徒", `${model.scope.students}人`, `${model.events.length}模試・${model.scope.observations.toLocaleString()}成績`)}${metric("最新の平均得点率", pct(model.scope.rate.mean), `中央値 ${pct(model.scope.rate.median)}`)}${metric("前回と比較できる生徒", `${model.comparison.comparableCount}人`, `平均変化 ${pt(model.comparison.change.mean)}`)}${metric("成績表の登録", registrationTotal ? `${Math.round(registered / registrationTotal * 100)}%` : "—", `${registered}/${registrationTotal}件`)}</div><div class="content-grid">${insights(model)}<section class="card span-2"><div class="section-heading"><div><p class="overline">複数模試をまとめて確認</p><h2>平均得点率の推移</h2></div><span class="help-text">人数も併記</span></div>${lineChart(model)}<p class="footnote">形式の異なる模試をまたぐ場合、得点率だけで単純な優劣を決めず、偏差値も合わせて確認します。</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">最新回</p><h2>教科ごとの状況</h2></div><button data-open-tab="subjects" type="button" class="link-button">全教科を見る</button></div>${subjectCards(model)}</section></div>`;
}

function compare(model) {
  const groupRows = model.groups.map((group) => `<tr><td><span class="group-kind">${group.kind}</span> ${escapeHtml(group.label)}</td><td>${group.sampleCount}人</td><td>${group.suppressed ? "少人数のため非表示" : pct(group.rate.mean)}</td><td>${group.suppressed ? "—" : pct(group.rate.median)}</td><td>${group.suppressed ? "—" : `${pct(group.rate.p25)}～${pct(group.rate.p75)}`}</td><td>${group.suppressed ? "" : bar(group.rate.mean)}</td></tr>`).join("");
  const changeTotal = model.comparison.comparableCount || 1;
  return `<div class="metric-grid three">${metric("上昇（3pt以上）", `${model.comparison.improved}人`, `${Math.round(model.comparison.improved / changeTotal * 100)}%`, "positive-card")}${metric("ほぼ横ばい", `${model.comparison.unchanged}人`, "±3pt未満")}${metric("低下（3pt以上）", `${model.comparison.declined}人`, `${Math.round(model.comparison.declined / changeTotal * 100)}%`, "attention-card")}</div><div class="content-grid"><section class="card"><div class="section-heading"><div><p class="overline">同じ生徒だけで比較</p><h2>前回からの変化</h2></div><span class="count-chip">比較可能 ${model.comparison.comparableCount}人</span></div><div class="change-meter"><span style="width:${model.comparison.improved / changeTotal * 100}%" class="improved"></span><span style="width:${model.comparison.unchanged / changeTotal * 100}%" class="stable"></span><span style="width:${model.comparison.declined / changeTotal * 100}%" class="declined"></span></div><div class="legend"><span class="improved">上昇</span><span class="stable">横ばい</span><span class="declined">低下</span></div><p class="footnote">比較対象外 ${model.comparison.excludedCount}人。未受験や異なる模試形式は混ぜません。</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">校舎・高校</p><h2>グループ比較</h2></div><span class="help-text">5人未満は数値を非表示</span></div><div class="table-wrap"><table><thead><tr><th>グループ</th><th>人数</th><th>平均</th><th>中央値</th><th>中央50%の範囲</th><th>位置</th></tr></thead><tbody>${groupRows}</tbody></table></div><p class="footnote">平均だけでなく中央値とばらつきを併記しています。人数や受験科目構成が異なるため、差の原因は自動判定しません。</p></section></div>`;
}

function subjects(model) {
  const heatEvents = model.events;
  const domains = model.domains.slice().sort((a, b) => a.sameAbilityGap - b.sameAbilityGap);
  const questionRows = model.answers.questions.slice(0, 12).map((row) => `<tr><td>${escapeHtml(subjectName(row.subjectId))}</td><td>第${row.majorQuestion}問</td><td>${pct(row.correctRate)}</td><td>${pct(row.partialRate)}</td><td>${pct(row.blankRate)}</td><td>${row.count}件</td></tr>`).join("");
  const answerLabels = { correct: "正答", wrong: "誤答", partial: "部分点", blank: "無回答", extra: "余分マーク" };
  return `<section class="card"><div class="section-heading"><div><p class="overline">18教科・科目</p><h2>教科別の最新状況</h2></div><span class="help-text">カードを押すと分野を絞り込み</span></div>${subjectCards(model, 30)}</section><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">分野 × 模試</p><h2>分野別の得点率</h2></div><span class="help-text">色が薄いほど低い</span></div>${domains.length ? `<div class="table-wrap"><table class="heat-table"><thead><tr><th>教科・分野</th>${heatEvents.map((event) => `<th>${escapeHtml(event.shortLabel)}</th>`).join("")}<th>全国差</th><th>同学力帯差</th></tr></thead><tbody>${domains.map((row) => `<tr><td><small>${escapeHtml(subjectName(row.subjectId))}</small><strong>${escapeHtml(row.label)}</strong></td>${row.trend.map((point) => `<td><span class="heat-cell" style="--heat:${point.value ?? 0}%">${pct(point.value)}</span></td>`).join("")}<td class="${row.nationalGap >= 0 ? "positive" : "negative"}">${pt(row.nationalGap)}</td><td class="${row.sameAbilityGap >= 0 ? "positive" : "negative"}">${pt(row.sameAbilityGap)}</td></tr>`).join("")}</tbody></table></div>` : notice("分野データがありません", "教科または模試の条件を変更してください。", "warn")}<p class="footnote">全国平均との差と同学力帯平均との差を分けて表示します。模試帳票にない分野は空欄です。</p></section><section class="card"><div class="section-heading"><div><p class="overline">解答の内訳</p><h2>正答・誤答・無回答</h2></div><span class="count-chip">${model.answers.count.toLocaleString()}マーク</span></div><div class="answer-stack">${model.answers.parts.map((part) => `<span class="${part.key}" style="width:${part.rate * 100}%"><i>${part.rate >= .08 ? `${Math.round(part.rate * 100)}%` : ""}</i></span>`).join("")}</div><div class="answer-legend">${model.answers.parts.map((part) => `<span class="${part.key}">${answerLabels[part.key]} ${Math.round(part.rate * 100)}%</span>`).join("")}</div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">正答率の低い順</p><h2>確認したい大問</h2></div><span class="help-text">無回答と部分点を分けて表示</span></div>${questionRows ? `<div class="table-wrap"><table><thead><tr><th>教科</th><th>大問</th><th>正答率</th><th>部分点率</th><th>無回答率</th><th>解答数</th></tr></thead><tbody>${questionRows}</tbody></table></div>` : notice("設問データがありません", "設問情報を持つ共通テスト模試を選んでください。", "warn")}</section></div>`;
}

function targets(model) {
  if (!model.targets.sampleCount) return notice("この条件では志望校判定を表示できません", "志望校判定を含む共通テスト模試を表示期間に加えてください。", "warn");
  const total = model.targets.sampleCount || 1;
  return `<div class="judgement-grid">${model.targets.counts.map((item) => `<article class="judgement ${item.label.toLowerCase()}"><span>${item.label}判定</span><strong>${item.count}人</strong><small>${Math.round(item.count / total * 100)}%</small></article>`).join("")}</div><div class="content-grid"><section class="card"><div class="section-heading"><div><p class="overline">第1志望</p><h2>ボーダーまでの差</h2></div><span class="count-chip">${model.targets.sampleCount}人</span></div><div class="big-number ${model.targets.borderGap.mean >= 0 ? "positive" : "negative"}">${pt(model.targets.borderGap.mean)}</div><p class="center-note">中央値 ${pt(model.targets.borderGap.median)} ／ 中央50%は ${pt(model.targets.borderGap.p25)}～${pt(model.targets.borderGap.p75)}</p></section><section class="card span-2"><div class="section-heading"><div><p class="overline">志望先別</p><h2>人数・判定・ボーダー差</h2></div></div><div class="table-wrap"><table><thead><tr><th>志望先</th><th>人数</th><th>A～C判定</th><th>平均ボーダー差</th></tr></thead><tbody>${model.targets.groups.map((group) => `<tr><td>${escapeHtml(group.label)}</td><td>${group.count}人</td><td>${group.aToC}人</td><td class="${group.borderGap >= 0 ? "positive" : "negative"}">${pt(group.borderGap)}</td></tr>`).join("")}</tbody></table></div></section><section class="card span-2">${notice("判定だけで結論を出さない", "志望順位、募集定員、志望者内順位、ボーダー差、教科別の差を合わせて確認できます。次に誰へ何を指導するかは担当者が判断します。")}</section></div>`;
}

function individual(model) {
  const detail = model.individual;
  if (!detail) return notice("表示できる生徒がいません", "条件を変更してください。", "warn");
  selectedPersonId = detail.person.personId;
  const targetRows = detail.targets.map((row) => `<tr><td>第${row.preferenceOrder}志望</td><td>${escapeHtml(row.targetLabel)}</td><td><span class="judgement-chip ${row.judgement.toLowerCase()}">${row.judgement}</span></td><td>${pt(row.borderGap)}</td><td>${row.rank}/${row.population}位</td></tr>`).join("");
  return `<section class="person-picker"><label>表示する生徒<select id="person-select">${model.people.map((person) => `<option value="${person.personId}"${person.personId === detail.person.personId ? " selected" : ""}>${escapeHtml(person.displayLabel)}（${escapeHtml(person.grade)}・${escapeHtml(person.course)}）</option>`).join("")}</select></label><div><span>${escapeHtml(data.locations.find((item) => item.id === detail.person.locationId)?.label)}</span><span>${escapeHtml(data.schools.find((item) => item.id === detail.person.schoolId)?.label)}</span></div></section><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">複数模試</p><h2>本人の推移</h2></div></div><div class="student-timeline">${detail.byEvent.map((row) => `<article><small>${escapeHtml(row.shortLabel)}</small><strong>${pct(row.rate.mean)}</strong><span>偏差値 ${num(row.deviation.mean)}</span></article>`).join("")}</div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">最新回</p><h2>教科バランス</h2></div></div><div class="student-subjects">${detail.subjects.map((row) => `<div><span>${escapeHtml(row.label)}</span>${bar(row.scoreRate)}<strong>${pct(row.scoreRate)}</strong><small>偏差値 ${num(row.deviation)}</small></div>`).join("")}</div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">志望校</p><h2>判定と位置</h2></div></div>${targetRows ? `<div class="table-wrap"><table><thead><tr><th>順位</th><th>志望先</th><th>判定</th><th>ボーダー差</th><th>志望者内</th></tr></thead><tbody>${targetRows}</tbody></table></div>` : notice("この模試には志望校判定がありません", "共通テスト模試を表示期間に含めてください。", "warn")}</section></div>`;
}

function registration(model) {
  const rows = model.registration.progress.map((row) => { const event = data.examEvents.find((item) => item.id === row.eventId); const location = data.locations.find((item) => item.id === row.locationId); const rate = row.expected ? row.registered / row.expected * 100 : 0; return `<tr><td>${escapeHtml(event.shortLabel)}</td><td>${escapeHtml(location.label)}</td><td>${row.registered}/${row.expected}件</td><td><div class="progress-cell">${bar(rate)}<span>${Math.round(rate)}%</span></div></td><td>${row.errors ? `<span class="status warning">要確認 ${row.errors}件</span>` : `<span class="status success">確認済み</span>`}</td></tr>`; }).join("");
  const cap = model.dataQuality.sourceCapabilities;
  return `<div class="metric-grid">${metric("登録済み", `${model.registration.active}件`, "分析に反映")}${metric("確認中", `${model.registration.pending}件`, "確定まで集計しない", "attention-card")}${metric("差し替え履歴", `${model.registration.superseded}件`, "最新版だけを集計")}${metric("帳票形式", `${model.dataQuality.schemaVersions.length}種類`, "形式ごとに解析")}</div><div class="content-grid"><section class="card span-2"><div class="section-heading"><div><p class="overline">提出・取込</p><h2>校舎別の登録進捗</h2></div><a class="link-button primary" href="./upload.html">PDFを登録する</a></div><div class="table-wrap"><table><thead><tr><th>模試</th><th>校舎</th><th>登録数</th><th>進捗</th><th>状態</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card span-2"><div class="section-heading"><div><p class="overline">実際の成績表から</p><h2>取り込める情報</h2></div><span class="count-chip">4ページを解析</span></div><div class="capability-grid"><article><strong>${cap.summaryMetrics}</strong><span>教科・総合成績</span><small>得点、満点、偏差値、順位、学力レベル</small></article><article><strong>${cap.convertedScores}</strong><span>共通テスト換算</span><small>国公立・私立評価に使う換算値</small></article><article><strong>${cap.trendRecords}</strong><span>過去回の推移</span><small>得点・偏差値・順位の時系列</small></article><article><strong>${cap.domainResults}</strong><span>分野別結果</span><small>全国・同学力帯・上位判定平均との差</small></article><article><strong>${cap.targets}</strong><span>志望校</span><small>判定、ボーダー、順位、募集定員</small></article><article><strong>${cap.answerMarks}</strong><span>設問マーク</span><small>正答、誤答、部分点、無回答、余分マーク</small></article></div><p class="footnote">数は添付されたサンプル成績表1件で確認できた件数です。模試や受験科目により増減します。</p></section></div>`;
}

function ml(model) {
  const rows = createMlDemoRows(data, model);
  return `<section class="card narrow-card"><div class="section-heading"><div><p class="overline">将来の機械学習に備える</p><h2>匿名化CSVを作成</h2></div><span class="count-chip">${rows.length.toLocaleString()}行</span></div>${notice("出力する内容", "生徒名やメールアドレスは含めず、架空のML用ID、模試、校舎、高校、教科、得点、偏差値、欠損理由を出力します。", "info")}<div class="export-form"><label>利用目的<input id="export-purpose" type="text" maxlength="120" placeholder="例：成績推移モデルの検証"></label><label class="check-row"><input id="export-confirm" type="checkbox">用途を限定し、適切に保存し、不要になったら削除します</label><button id="export-button" class="primary-button" type="button" disabled>架空データのCSVをダウンロード</button><p id="export-status" class="footnote" aria-live="polite">このデモでは架空データだけを出力します。</p></div></section>`;
}

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const safe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(model) {
  const rows = createMlDemoRows(data, model);
  const columns = Object.keys(rows[0] ?? {});
  const csv = `\uFEFF${[columns, ...rows.map((row) => columns.map((key) => row[key]))].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "moshi_ml_demo.csv"; link.click(); URL.revokeObjectURL(url);
  app.querySelector("#export-status").textContent = `${rows.length.toLocaleString()}行の架空データを出力しました。`;
}

function render() {
  if (!data) { app.innerHTML = notice("データを読み込んでいます", "少しお待ちください。"); return; }
  const model = createDemoModel(data, currentFilters());
  const [title, description] = pageCopy[activeTab];
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-description").textContent = description;
  document.querySelector("#scope-summary").textContent = `${model.scope.students}人・${model.events.length}模試・${model.scope.observations.toLocaleString()}成績を表示`;
  if (!model.people.length || !model.events.length) { app.innerHTML = notice("条件に合うデータがありません", "表示条件を元に戻すか、別の条件を選んでください。", "warn"); return; }
  if (model.suppressed && !["registration", "ml", "individual"].includes(activeTab)) { app.innerHTML = notice("少人数のため集計値を表示しません", "個人が推測されないよう、5人未満のグループは人数だけを表示します。", "warn"); return; }
  app.innerHTML = ({ overview, compare, subjects, targets, individual, registration, ml }[activeTab] ?? overview)(model);
}

function activateTab(tab) {
  activeTab = tab;
  navItems.forEach((item) => { const selected = item.dataset.tab === tab; item.classList.toggle("is-active", selected); item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1; });
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function populate() {
  data.examDefinitions.forEach((item) => controls.definitionId.add(new Option(item.label, item.id)));
  data.locations.forEach((item) => controls.locationId.add(new Option(item.label, item.id)));
  data.schools.forEach((item) => controls.schoolId.add(new Option(item.label, item.id)));
  data.subjectDefinitions.forEach((item) => controls.subjectId.add(new Option(item.label, item.id)));
  document.querySelector("#dataset-version").textContent = `${data.students.length}人・${data.examEvents.length}模試`;
}

navItems.forEach((item) => item.addEventListener("click", () => activateTab(item.dataset.tab)));
document.querySelector(".side-nav").addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); const current = Math.max(0, navItems.indexOf(document.activeElement)); const next = event.key === "Home" ? 0 : event.key === "End" ? navItems.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + navItems.length) % navItems.length; navItems[next].focus(); navItems[next].click();
});
Object.values(controls).forEach((control) => control.addEventListener("change", () => { selectedPersonId = null; if (control === controls.locationId) { [...controls.schoolId.options].forEach((option) => { option.hidden = option.value !== "all" && controls.locationId.value !== "all" && data.schools.find((school) => school.id === option.value)?.locationId !== controls.locationId.value; }); if (controls.schoolId.selectedOptions[0]?.hidden) controls.schoolId.value = "all"; } render(); }));
document.querySelector("#reset-filters").addEventListener("click", () => { Object.values(controls).forEach((control) => { control.value = "all"; }); controls.period.value = "all"; selectedPersonId = null; render(); });
app.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open-tab]");
  if (opener) { if (opener.dataset.subject) controls.subjectId.value = opener.dataset.subject; activateTab(opener.dataset.openTab); }
  if (event.target.id === "export-button") downloadCsv(createDemoModel(data, currentFilters()));
});
app.addEventListener("change", (event) => {
  if (event.target.id === "person-select") { selectedPersonId = event.target.value; render(); }
  if (event.target.id === "export-confirm") app.querySelector("#export-button").disabled = !(event.target.checked && app.querySelector("#export-purpose").value.trim());
});
app.addEventListener("input", (event) => { if (event.target.id === "export-purpose") app.querySelector("#export-button").disabled = !(event.target.value.trim() && app.querySelector("#export-confirm").checked); });

app.innerHTML = notice("データを読み込んでいます", "少しお待ちください。");
try {
  const response = await fetch("./data/demo-dataset.json", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("dataset request failed");
  data = await response.json(); populate(); render();
} catch { app.innerHTML = notice("データを読み込めませんでした", "画面を再読み込みしてください。改善しない場合は管理者へ連絡してください。", "danger"); }
