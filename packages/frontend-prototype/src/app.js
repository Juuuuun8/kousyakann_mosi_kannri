const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll("[data-tab]")];
const stateSelect = document.querySelector("#state-select");
let activeTab = "overview";

const stateCopy = {
  loading: { className: "notice", icon: "◌", title: "読み込み中", body: "正本データと版一致した集計を読み込んでいます。長時間変わらない場合はRequestIDを管理者へ伝えてください。" },
  empty: { className: "notice", icon: "∅", title: "対象データがありません", body: "模試回次、校舎、科目の条件を確認してください。条件を変えても正本データは変更されません。" },
  suppressed: { className: "notice warn", icon: "▧", title: "小人数群のため値を抑制", body: "対象人数が設定した閾値未満です。人数と欠損情報だけを表示し、個別推測につながる値は返しません。" },
  partial: { className: "notice warn", icon: "△", title: "一部データのみ", body: "未対応SchemaVersionまたは欠損payloadがあります。表示値には除外数とMissingReasonを併記します。" },
  schema: { className: "notice danger", icon: "!", title: "帳票スキームが一致しません", body: "この結果は分析へ含めません。SchemaVersionを確認し、対応版の追加後に再処理してください。" },
  permission: { className: "notice danger", icon: "⊘", title: "権限がありません", body: "分析とML出力はADMIN専用です。INPUTは登録操作だけを利用できます。" },
};

function metricCard(label, value, note) {
  return `<article class="kpi"><p class="eyebrow">${label}</p><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></article>`;
}

function notice(state) {
  const copy = stateCopy[state];
  return `<div class="${copy.className}"><div class="notice-icon" aria-hidden="true">${copy.icon}</div><div><h3>${copy.title}</h3><p>${copy.body}</p></div></div>`;
}

function overview() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ACTIVE REPORTS</p><h2>全体概要</h2></div><span class="status-pill">版一致 · 更新 09:42</span></div><div class="kpis">${metricCard("登録人数", "1,248", "対象 1,302 / 除外 54")}${metricCard("平均得点率", "64.2%", "前回比 +3.1pt")}${metricCard("要確認", "18", "Schema 6 · 欠損 12")}${metricCard("継続受験", "78.4%", "PersonID確定者のみ")}</div></section><div class="grid-2"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">LOCATION COMPARISON</p><h2>校舎別の得点率</h2></div><span class="status-pill">n ≥ 5</span></div><div class="bar-list"><div class="bar-row"><span>合成校舎A</span><div class="bar-track"><div class="bar-fill" style="width: 76%"></div></div><strong>68.4%</strong></div><div class="bar-row"><span>合成校舎B</span><div class="bar-track"><div class="bar-fill" style="width: 69%"></div></div><strong>62.1%</strong></div><div class="bar-row"><span>全体</span><div class="bar-track"><div class="bar-fill" style="width: 71%"></div></div><strong>64.2%</strong></div></div><div class="panel-footer">母数 1,248 · 未受験 87 · Parser警告 6</div></section><section class="panel"><p class="eyebrow">DATA QUALITY</p><h2>品質サマリ</h2><table class="data-table"><tbody><tr><td>ACTIVE</td><td><span class="status-pill">1,248</span></td></tr><tr><td>要確認</td><td><span class="status-pill warn">18</span></td></tr><tr><td>REJECTED</td><td><span class="status-pill danger">7</span></td></tr></tbody></table></section></div>`;
}

function comparison() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">GROUP COMPARISON</p><h2>校舎・学校比較</h2></div><button class="action secondary" type="button">基準群を変更</button></div><table class="data-table"><thead><tr><th>グループID</th><th>人数</th><th>得点率</th><th>全国差</th><th>欠損</th></tr></thead><tbody><tr><td>loc.synthetic.1</td><td>640</td><td>68.4%</td><td>+4.2pt</td><td>12</td></tr><tr><td>loc.synthetic.2</td><td>608</td><td>62.1%</td><td>-1.1pt</td><td>15</td></tr></tbody></table><div class="panel-footer">学校名などの表示ラベルは承認済みマスタから解決。集計レスポンスに氏名・メール・クラスは含めない。</div></section>`;
}

function subjects() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">SUBJECT / DOMAIN</p><h2>科目・分野の重点</h2></div><span class="status-pill warn">一部payload除外 4</span></div><table class="data-table"><thead><tr><th>科目ID</th><th>受験者</th><th>得点率</th><th>全国差</th><th>重点候補</th></tr></thead><tbody><tr><td>subject.synthetic.01</td><td>1,120</td><td>71.3%</td><td>+2.8pt</td><td>読解</td></tr><tr><td>subject.synthetic.02</td><td>1,087</td><td>58.9%</td><td>-3.4pt</td><td>確率</td></tr><tr><td>subject.synthetic.03</td><td>1,041</td><td>62.7%</td><td>-0.8pt</td><td>古典</td></tr></tbody></table></section>`;
}

function targets() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">TARGET SCHOOLS</p><h2>志望校判定の分布</h2></div><span class="status-pill">人数と母数を併記</span></div><div class="kpis">${metricCard("A判定", "214", "評価対象 1,006")}${metricCard("B判定", "298", "29.6%")}${metricCard("C判定", "276", "27.4%")}${metricCard("D/E判定", "218", "21.7%")}</div><div class="panel-footer">大学・学部・方式は正規化IDで集計し、原表記は正本payloadから必要時に解決。</div></section>`;
}

function individual() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">INDIVIDUAL DETAIL</p><h2>個人詳細</h2></div><span class="status-pill">PersonID確定者のみ時系列</span></div><div class="notice"><div class="notice-icon">i</div><div><h3>合成プロトタイプ</h3><p>本番ではADMINの明示操作と監査を経て対象を選択します。曖昧・未解決の本人は単発集計だけに含め、個人推移とML出力から除外します。</p></div></div></section>`;
}

function quality() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">DATA MANAGEMENT</p><h2>データ管理</h2></div><button class="action secondary" type="button">警告を再確認</button></div><table class="data-table"><thead><tr><th>状態</th><th>件数</th><th>対応</th></tr></thead><tbody><tr><td><span class="status-pill warn">PENDING</span></td><td>18</td><td>ADMIN確認待ち</td></tr><tr><td><span class="status-pill danger">REJECTED</span></td><td>7</td><td>再アップロード</td></tr><tr><td><span class="status-pill">SUPERSEDED</span></td><td>34</td><td>履歴として保持</td></tr></tbody></table></section>`;
}

function ml() {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ML EXPORT</p><h2>ML用CSV</h2></div><span class="status-pill warn">ADMIN明示操作</span></div><div class="notice warn"><div class="notice-icon">!</div><div><h3>端末ダウンロードのみ</h3><p>直接識別子を除外した固定列のCSVを一時生成します。Drive・GAS・Cloudflareへ保存せず、出力監査だけを残します。</p></div></div><div class="panel-footer"><button class="action" type="button">条件を確認して生成</button></div></section>`;
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
