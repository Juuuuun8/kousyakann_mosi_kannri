import { answerCompositionModel, comparisonSummaryModel, domainTableModel, domainTrendModel, subjectTableModel, targetSummaryModel } from "./analytics-view-model.js";
import { syntheticAnswerResult, syntheticComparisonResult, syntheticDomainComparisonResult, syntheticDomainResult, syntheticSubjectResult, syntheticTargetResult } from "./synthetic-analytics-results.js";

const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll("[data-tab]")];
const stateSelect = document.querySelector("#state-select");
let activeTab = "overview";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

const stateCopy = {
  loading: { className: "notice", icon: "◌", title: "読み込み中", body: "正本データと版一致した集計を読み込んでいます。長時間変わらない場合はRequestIDを管理者へ伝えてください。" },
  empty: { className: "notice", icon: "∅", title: "対象データがありません", body: "模試回次、校舎、科目の条件を確認してください。条件を変えても正本データは変更されません。" },
  suppressed: { className: "notice warn", icon: "▧", title: "小人数群のため値を抑制", body: "対象人数が設定した閾値未満です。人数と欠損情報だけを表示し、個別推測につながる値は返しません。" },
  partial: { className: "notice warn", icon: "△", title: "一部データのみ", body: "未対応SchemaVersionまたは欠損payloadがあります。表示値には除外数とMissingReasonを併記します。" },
  schema: { className: "notice danger", icon: "!", title: "帳票スキームが一致しません", body: "この結果は分析へ含めません。SchemaVersionを確認し、対応版の追加後に再処理してください。" },
  permission: { className: "notice danger", icon: "⊘", title: "権限がありません", body: "分析とML出力はADMIN専用です。INPUTは登録操作だけを利用できます。" },
};

function metricCard(label, value, note) {
  return `<article class="kpi"><p class="eyebrow">${escapeHtml(label)}</p><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></article>`;
}

function notice(state) {
  const copy = stateCopy[state];
  return `<div class="${copy.className}"><div class="notice-icon" aria-hidden="true">${copy.icon}</div><div><h3>${copy.title}</h3><p>${copy.body}</p></div></div>`;
}

function histogram() {
  const values = [12, 24, 43, 72, 103, 156, 180, 143, 92, 38];
  return `<div class="chart" aria-label="得点率分布"><div class="chart-title"><strong>得点率の分布</strong><span>中央値 66.0% · 四分位 54.0–76.0%</span></div><div class="histogram">${values.map((value, index) => `<div class="hist-column${index === 6 ? " is-median" : ""}"><span class="hist-bar" style="height:${Math.max(6, Math.round(value / 1.7))}px"></span><span>${index * 10}–</span></div>`).join("")}</div><p class="chart-note">横軸：得点率（%）／縦軸：人数。平均だけでは見えない二極化や裾の広がりを確認します。</p></div>`;
}

function overview() {
  const trend = comparisonSummaryModel(syntheticComparisonResult);
  const bandLabels = { "baseline.lt25": "前回25%未満", "baseline.25-50": "前回25–50%", "baseline.50-75": "前回50–75%", "baseline.gte75": "前回75%以上" };
  const bandRows = trend.baselineBands.map((band) => `<div class="trend-row"><span>${escapeHtml(bandLabels[band.key] ?? band.key)}（n=${escapeHtml(band.sampleCount)}）</span><div class="trend-track"><div class="trend-value" style="margin-left:50%;width:${Math.min(40, Math.abs(Number.parseFloat(band.value)) * 4)}%"></div></div><strong>${escapeHtml(band.value)}</strong></div>`).join("");
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ACTIVE REPORTS</p><h2>全体概要</h2></div><span class="status-pill">版条件確認済み · 更新 09:42</span></div><div class="kpis">${metricCard("登録人数", "1,248", "対象 1,302 / 除外 54")}${metricCard("平均 / 中央値", "64.2 / 66.0%", "四分位 54.0–76.0%")}${metricCard("前回比較可能", String(trend.comparableCount), `比較不能 ${trend.excludedCount}`)}${metricCard("得点率変化", trend.scoreRateChange, `四分位 ${trend.changeQuartiles}`)}</div>${histogram()}</section><div class="grid-2"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">COMPARABLE TREND</p><h2>同一受験者の回次推移</h2></div><span class="status-pill">n = ${escapeHtml(trend.comparableCount)}</span></div><div class="trend-list"><div class="trend-row"><span>得点率変化</span><div class="trend-track"><div class="trend-value" style="margin-left:50%;width:18%"></div></div><strong>${escapeHtml(trend.scoreRateChange)}</strong></div><div class="trend-row"><span>全国平均との差の変化</span><div class="trend-track"><div class="trend-value" style="margin-left:50%;width:11%"></div></div><strong>${escapeHtml(trend.nationalGapChange)}</strong></div><div class="trend-row"><span>偏差値変化</span><div class="trend-track"><div class="trend-value" style="margin-left:50%;width:8%"></div></div><strong>${escapeHtml(trend.deviationChange)}</strong></div>${bandRows}</div><div class="evidence-note">前後2回とも受験し、本人・科目・指標定義が一致した人だけで比較しています。得点率、全国平均との差、偏差値を分け、変化の原因は断定しません。</div></section><section class="panel"><p class="eyebrow">DATA QUALITY</p><h2>品質サマリ</h2><table class="data-table"><tbody><tr><td>データ完全率</td><td><span class="status-pill">98.6%</span></td></tr><tr><td>比較不能</td><td><span class="status-pill warn">${escapeHtml(trend.excludedCount)}</span></td></tr><tr><td>SchemaVersion</td><td>回次ごとに記録</td></tr><tr><td>未受験・非掲載</td><td>別理由で集計</td></tr></tbody></table><div class="panel-footer">欠損は未受験・非掲載・帳票空欄・解析不能を区別します。</div></section></div>`;
}

function comparison() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">GROUP COMPARISON</p><h2>校舎・学校比較</h2></div><span class="status-pill">全国掲載値で難易度補正</span></div><div class="bar-list"><div class="bar-row"><span>合成校舎A</span><div class="bar-track"><div class="bar-fill" style="width:76%"></div></div><strong>+4.2pt</strong></div><div class="bar-row"><span>合成校舎B</span><div class="bar-track"><div class="bar-fill" style="width:51%"></div></div><strong>-1.1pt</strong></div><div class="bar-row"><span>全校舎</span><div class="bar-track"><div class="bar-fill" style="width:62%"></div></div><strong>+1.7pt</strong></div></div><table class="data-table"><thead><tr><th>グループ</th><th>比較可能人数</th><th>平均 / 中央値</th><th>四分位範囲</th><th>全国差</th><th>欠損</th></tr></thead><tbody><tr><td>合成校舎A</td><td>502 / 640</td><td>68.4 / 70.1%</td><td>58.2–79.0%</td><td>+4.2pt</td><td>12</td></tr><tr><td>合成校舎B</td><td>476 / 608</td><td>62.1 / 63.8%</td><td>50.4–73.5%</td><td>-1.1pt</td><td>15</td></tr></tbody></table><div class="evidence-note">順位だけでなく分布・母数・前回比較可能人数を併記します。校舎規模や受験者構成が異なるため、平均との差だけで評価しません。</div></section>`;
}

function subjects() {
  const rows = subjectTableModel(syntheticSubjectResult);
  const domains = domainTableModel(syntheticDomainResult, { "domain.synthetic.probability": "確率", "domain.synthetic.vectors": "ベクトル", "domain.synthetic.calculus": "微積分" });
  const domainTrends = new Map(domainTrendModel(syntheticDomainComparisonResult).map((row) => [row.id, row]));
  const answers = answerCompositionModel(syntheticAnswerResult);
  const answerParts = answers.parts.filter((part) => part.rate !== null);
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SUBJECT / DOMAIN</p><h2>科目・分野の観測値</h2></div><span class="status-pill">集計結果契約 v1</span></div><table class="data-table"><thead><tr><th>科目</th><th>対象人数</th><th>平均 / 中央値</th><th>四分位範囲</th><th>全国差</th><th>標準偏差</th><th>欠損</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.subject)}</td><td>${escapeHtml(row.sampleCount)}</td><td>${escapeHtml(row.mean)} / ${escapeHtml(row.median)}</td><td>${escapeHtml(row.interquartileRange)}</td><td>${escapeHtml(row.nationalGap)}</td><td>${escapeHtml(row.standardDeviation)}</td><td>${escapeHtml(row.missingCount)}</td></tr>`).join("")}</tbody></table><div class="grid-2"><div class="chart"><div class="chart-title"><strong>数学 分野別</strong><span>同一受験者の前回差を併記</span></div><table class="data-table"><thead><tr><th>分野</th><th>今回対象</th><th>得点率</th><th>同学力帯差</th><th>前回差</th><th>比較可 / 不可</th></tr></thead><tbody>${domains.map((row) => { const trend = domainTrends.get(row.id); return `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.sampleCount)}</td><td>${escapeHtml(row.scoreRate)}</td><td>${escapeHtml(row.sameAbilityGap)}</td><td>${escapeHtml(trend?.change ?? "—")}</td><td>${escapeHtml(trend?.comparableCount ?? 0)} / ${escapeHtml(trend?.excludedCount ?? 0)}</td></tr>`; }).join("")}</tbody></table></div><div class="chart"><div class="chart-title"><strong>数学 設問結果構成</strong><span>対象者 ${escapeHtml(answers.sampleCount)}</span></div><div class="stack" aria-label="${escapeHtml(answerParts.map((part) => `${part.label}${(part.rate * 100).toFixed(1)}%`).join("、"))}">${answerParts.map((part) => `<span class="${escapeHtml(part.className)}" style="width:${(part.rate * 100).toFixed(1)}%"></span>`).join("")}</div><div class="legend">${answerParts.map((part) => `<span>${escapeHtml(part.label)} ${(part.rate * 100).toFixed(1)}%</span>`).join("")}</div><p class="chart-note">掲載設問の正誤・部分点・無回答・余分マークを区別します。解答位置から原因を自動断定しません。</p></div></div><div class="evidence-note">分野推移は両回で本人・科目・正規化DomainIDが一致した人だけを比較します。未受験を0点へ変換せず、異なる指標定義や未正規化分野は混在させません。</div></section>`;
}

function targets() {
  const model = targetSummaryModel(syntheticTargetResult);
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">TARGET SCHOOLS</p><h2>志望校判定・ボーダー差</h2></div><span class="status-pill">第1志望 · 評価対象 ${model.sampleCount}</span></div><div class="kpis">${model.judgements.map((item) => metricCard(item.label, String(item.count), item.denominator ? `${(item.count / item.denominator * 100).toFixed(1)}%` : "—")).join("")}</div><div class="grid-2"><div class="chart"><div class="chart-title"><strong>平均ボーダー差</strong><span>対象 ${model.sampleCount}</span></div><div class="kpi-value">${model.borderGap}</div><p class="chart-note">本人指標と帳票掲載ボーダーの差です。得点と偏差値は混在させず、判定や指導内容も自動決定しません。</p></div><div class="chart"><div class="chart-title"><strong>ボーダー差の四分位範囲</strong><span>分布を併記</span></div><div class="kpi-value">${model.quartiles}</div><p class="chart-note">大学名原表記は集団結果へ返さず、正規化IDが揃った場合だけ志望校別に分けます。</p></div></div></section>`;
}

function individual() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">INDIVIDUAL DETAIL</p><h2>個人詳細（合成表示）</h2></div><span class="status-pill">PersonID確定 · ADMIN監査対象</span></div><div class="kpis">${metricCard("総合得点率", "67.8%", "前回 +4.5pt")}${metricCard("全国偏差値", "58.2", "前回 +2.1")}${metricCard("科目差", "24.0pt", "最高−最低")}${metricCard("データ状態", "完全", "欠損 0 / 警告 0")}</div><div class="grid-2"><div class="chart"><div class="chart-title"><strong>回次推移</strong><span>難易度差確認用に全国差も併記</span></div><table class="data-table"><thead><tr><th>回次</th><th>得点率</th><th>全国差</th><th>偏差値</th></tr></thead><tbody><tr><td>第1回</td><td>63.3%</td><td>+1.0pt</td><td>56.1</td></tr><tr><td>第2回</td><td>67.8%</td><td>+3.4pt</td><td>58.2</td></tr></tbody></table></div><div class="chart"><div class="chart-title"><strong>科目バランス</strong><span>得点率</span></div><div class="bar-list"><div class="bar-row"><span>英語</span><div class="bar-track"><div class="bar-fill" style="width:78%"></div></div><strong>78%</strong></div><div class="bar-row"><span>数学</span><div class="bar-track"><div class="bar-fill" style="width:54%"></div></div><strong>54%</strong></div><div class="bar-row"><span>国語</span><div class="bar-track"><div class="bar-fill" style="width:71%"></div></div><strong>71%</strong></div></div></div></div><div class="evidence-note">ここでは事実、比較値、欠損、時系列だけを提示します。次に誰へ何を指導するかは、面談記録・授業での様子・答案などと合わせて担当者が決めます。</div></section>`;
}

function quality() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">DATA MANAGEMENT</p><h2>データ管理</h2></div><button class="action secondary" type="button">警告を再確認</button></div><table class="data-table"><thead><tr><th>状態</th><th>件数</th><th>分析への扱い</th></tr></thead><tbody><tr><td><span class="status-pill warn">PENDING</span></td><td>18</td><td>確定まで除外</td></tr><tr><td><span class="status-pill danger">REJECTED</span></td><td>7</td><td>常に除外</td></tr><tr><td><span class="status-pill">SUPERSEDED</span></td><td>34</td><td>最新版のみ採用・履歴保持</td></tr></tbody></table><div class="evidence-note">各グラフから、この一覧の除外・欠損理由へドリルダウンできる設計にします。値の信頼性を確認できない分析は表示しません。</div></section>`;
}

function ml() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ML EXPORT</p><h2>ML用CSV</h2></div><span class="status-pill warn">ADMIN明示操作</span></div><div class="notice warn"><div class="notice-icon">!</div><div><h3>端末ダウンロードのみ</h3><p>直接識別子を除外した固定列のCSVを一時生成します。Drive・GAS・CloudflareへCSVを保存せず、出力条件と件数の監査だけを残します。</p></div></div><div class="panel-footer"><button class="action" type="button">条件を確認して生成</button></div></section>`;
}

function render() {
  const state = stateSelect.value;
  if (state !== "ready") {
    app.innerHTML = notice(state);
    return;
  }
  app.innerHTML = ({ overview, groups: comparison, subjects, targets, individual, quality, ml }[activeTab] ?? overview)();
}

tabs.forEach((tab) => tab.addEventListener("click", () => {
  activeTab = tab.dataset.tab;
  tabs.forEach((candidate) => candidate.classList.toggle("is-active", candidate === tab));
  render();
}));
stateSelect.addEventListener("change", render);
render();
