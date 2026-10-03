import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "packages", "frontend-prototype", "data", "demo-dataset.json");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;

const locations = [
  { id: "loc.sapporo", label: "札幌駅前校" }, { id: "loc.asahikawa", label: "旭川校" },
  { id: "loc.obihiro", label: "帯広校" }, { id: "loc.hakodate", label: "函館校" },
];
const schoolNames = ["北星高校", "中央高校", "旭丘高校", "河畔高校", "十勝高校", "東陵高校", "函館南高校", "港陵高校"];
const schools = schoolNames.map((label, index) => ({ id: `school.${index + 1}`, label, locationId: locations[Math.floor(index / 2)].id }));
const examDefinitions = [{ id: "kawai.ct", providerId: "kawai", format: "COMMON_TEST", label: "全統共通テスト模試", sourceStatus: "ATTACHED_PDF_CONFIRMED" }];
const examEvents = [
  ["ct.2025.1", 2025, 1, "2025年度 第1回 全統共通テスト模試", "25年 共テ①"],
  ["ct.2025.2", 2025, 2, "2025年度 第2回 全統共通テスト模試", "25年 共テ②"],
  ["ct.2025.3", 2025, 3, "2025年度 第3回 全統共通テスト模試", "25年 共テ③"],
  ["ct.2026.1", 2026, 1, "2026年度 第1回 全統共通テスト模試", "26年 共テ①"],
  ["ct.2026.2", 2026, 2, "2026年度 第2回 全統共通テスト模試", "26年 共テ②"],
].map(([id, year, round, label, shortLabel]) => ({ id, definitionId: "kawai.ct", year, round, label, shortLabel }));

const subjectDefinitions = [
  ["english-reading", "英語リーディング", "英語R", 100, 61, false], ["english-listening", "英語リスニング", "英語L", 100, 58, false],
  ["english-total", "英語計", "英語計", 200, 60, true], ["math-1a", "数学Ⅰ・A", "数学ⅠA", 100, 55, false],
  ["math-2bc", "数学Ⅱ・B・C", "数学ⅡBC", 100, 50, false], ["math-total", "数学①②", "数学計", 200, 53, true],
  ["japanese", "国語", "国語", 200, 62, false], ["overall-core", "英数国総合", "英数国", 600, 58, true],
  ["chemistry", "化学", "化学", 100, 53, false], ["physics", "物理", "物理", 100, 55, false],
  ["geography", "地理", "地理", 100, 58, false], ["information-1", "情報Ⅰ", "情報Ⅰ", 100, 64, false],
  ["overall-6-8", "国理6-8型総合", "6-8型", 1000, 58, true], ["overall-science", "理系総合", "理系総合", 900, 57, true],
].map(([id, label, shortLabel, maxScore, nationalAverage, aggregate], order) => ({ id, label, shortLabel, maxScore, nationalAverage, aggregate, metricDefinitionId: `metric.${id}.summary.v1`, comparisonEligible: true, order, sourceStatus: "ATTACHED_PDF_CONFIRMED" }));

const domainLabels = {
  "english-reading": ["読解－メール", "読解－情報", "読解－物語", "読解表現融合", "読解－図表", "読解－論説", "読解－広告", "読解－複数資料"],
  "english-listening": ["短文内容一致", "対話－図", "対話内容選択", "中文－図表", "長文－図表", "長対話・会話"],
  "math-1a": ["数と式・集合", "図形と計量", "二次関数", "データの分析", "図形の性質", "場合の数・確率"],
  "math-2bc": ["三角関数", "指数・対数関数", "微分法・積分法", "数列", "統計的な推測", "平面ベクトル"],
  japanese: ["現代文－論理", "現代文－文学", "現代文－資料", "古文", "漢文"],
  "information-1": ["小問集合", "情報システム", "プログラム", "通信・データ"],
  chemistry: ["構成・結晶", "気体・溶液", "物質の変化", "無機物質", "物質の密度"],
  physics: ["小問集合", "力学", "波", "電磁気"],
  geography: ["資源問題", "地域調査", "自然と災害", "農業と食料", "都市問題", "環太平洋地誌"],
};
const domainDefinitions = Object.entries(domainLabels).flatMap(([subjectId, labels]) => labels.map((label, index) => ({ id: `${subjectId}.${index + 1}`, subjectId, label, version: 1, order: index, sourceStatus: "ATTACHED_PDF_CONFIRMED" })));
const targetDefinitions = [
  ["hokkai", "北海総合大学", "総合政策学部"], ["sapporo", "札幌未来大学", "データ科学部"], ["do-o", "道央教育大学", "教育学部"],
  ["north-tech", "北日本工科大学", "工学部"], ["hakodate", "函館国際大学", "国際学部"], ["tokachi", "十勝生命大学", "生命科学部"],
].map(([id, university, faculty]) => ({
  id: `target.${id}`,
  universityId: `university.${id}`,
  facultyId: `faculty.${id}`,
  programId: `program.${id}.default`,
  university,
  faculty,
  program: "一般選抜",
  label: `${university} ${faculty}`,
}));

const students = Array.from({ length: 72 }, (_, index) => {
  const location = locations[index % locations.length];
  const schoolOptions = schools.filter((school) => school.locationId === location.id);
  return { personId: `demo-person-${String(index + 1).padStart(3, "0")}`, identityStatus: "RESOLVED", identityMethod: "ADMIN_CONFIRMED", displayLabel: `デモ生徒${String(index + 1).padStart(2, "0")}`, locationId: location.id, schoolId: schoolOptions[Math.floor(index / locations.length) % 2].id, grade: index % 9 < 2 ? "高2" : "高3" };
});

const directSubjects = subjectDefinitions.filter((subject) => !subject.aggregate);
const scores = [];
const reports = [];
for (const [studentIndex, student] of students.entries()) {
  const ability = 38 + ((studentIndex * 11) % 48);
  for (const [eventIndex, event] of examEvents.entries()) {
    const pending = (studentIndex + eventIndex * 7) % 37 === 0;
    const reportId = `report.${studentIndex + 1}.${eventIndex + 1}`;
    reports.push({ reportId, personId: student.personId, eventId: event.id, locationId: student.locationId, schoolId: student.schoolId, grade: student.grade, identityStatus: student.identityStatus, status: pending ? "PENDING" : "ACTIVE", completeness: pending ? .25 : 1, schemaVersion: "kawai.ct.v2" });
    if (pending) continue;
    const personRows = [];
    for (const [subjectIndex, subject] of directSubjects.entries()) {
      const missingReason = (studentIndex * 5 + eventIndex * 3 + subjectIndex) % 131 === 0 ? "NOT_TAKEN" : null;
      const locationEffect = [2.8, -1.2, 1.0, -2.0][locations.findIndex((item) => item.id === student.locationId)];
      const domainBias = ((studentIndex + subjectIndex * 5) % 13) - 6;
      const eventShock = ((studentIndex * 5 + eventIndex * 7) % 17) - 8;
      const rate = clamp((ability + eventIndex * 1.5 + locationEffect + domainBias + eventShock) / 100, .18, .98);
      const score = missingReason ? null : Math.round(rate * subject.maxScore);
      const scoreRate = score === null ? null : round1(score / subject.maxScore * 100);
      const deviation = scoreRate === null ? null : round1(50 + (scoreRate - subject.nationalAverage) * .42);
      personRows.push({ personId: student.personId, eventId: event.id, subjectId: subject.id, metricDefinitionId: "metric.subject.summary", score, maxScore: subject.maxScore, scoreRate, nationalAverageRate: subject.nationalAverage, deviation, schoolRank: score === null ? null : 1 + ((studentIndex * 7 + subjectIndex) % 180), nationalRank: score === null ? null : 100 + ((studentIndex * 971 + subjectIndex * 137) % 62000), abilityLevel: deviation === null ? null : deviation >= 65 ? "S" : deviation >= 60 ? "A" : deviation >= 55 ? "B" : deviation >= 50 ? "C" : deviation >= 45 ? "D" : "E", missingReason });
    }
    const aggregate = (id, componentIds) => {
      const rows = personRows.filter((row) => componentIds.includes(row.subjectId) && row.score !== null);
      const definition = subjectDefinitions.find((subject) => subject.id === id);
      const complete = rows.length === componentIds.length;
      const score = complete ? rows.reduce((sum, row) => sum + row.score, 0) : null;
      const scoreRate = score === null ? null : round1(score / definition.maxScore * 100);
      return { personId: student.personId, eventId: event.id, subjectId: id, metricDefinitionId: "metric.subject.summary", score, maxScore: definition.maxScore, scoreRate, nationalAverageRate: definition.nationalAverage, deviation: scoreRate === null ? null : round1(50 + (scoreRate - definition.nationalAverage) * .42), schoolRank: scoreRate === null ? null : 1 + ((studentIndex * 9 + eventIndex) % 180), nationalRank: scoreRate === null ? null : 100 + ((studentIndex * 557 + eventIndex * 91) % 62000), abilityLevel: null, missingReason: scoreRate === null ? "NOT_TAKEN" : null };
    };
    const allDirect = directSubjects.map((subject) => subject.id);
    personRows.push(aggregate("english-total", ["english-reading", "english-listening"]));
    personRows.push(aggregate("math-total", ["math-1a", "math-2bc"]));
    personRows.push(aggregate("overall-core", ["english-reading", "english-listening", "math-1a", "math-2bc", "japanese"]));
    personRows.push(aggregate("overall-6-8", allDirect));
    personRows.push(aggregate("overall-science", ["english-reading", "english-listening", "math-1a", "math-2bc", "japanese", "chemistry", "physics", "information-1"]));
    scores.push(...personRows);
  }
}
reports.push({ reportId: "report.superseded", personId: students[0].personId, eventId: "ct.2026.2", locationId: students[0].locationId, status: "SUPERSEDED", completeness: 1, schemaVersion: "kawai.ct.v1" });

const domains = [];
for (const [studentIndex, student] of students.entries()) for (const [eventIndex, event] of examEvents.slice(-3).entries()) {
  for (const [domainIndex, domain] of domainDefinitions.entries()) {
    const parent = scores.find((row) => row.personId === student.personId && row.eventId === event.id && row.subjectId === domain.subjectId && row.scoreRate !== null);
    if (!parent) continue;
    const campusBias = [3.5, -2.5, 1.5, -1.5][locations.findIndex((item) => item.id === student.locationId)] * ((domainIndex % 3) - 1);
    const scoreRate = clamp(parent.scoreRate + ((studentIndex + domainIndex * 3) % 17) - 8 + campusBias, 5, 100);
    const nationalAverageRate = clamp(subjectDefinitions.find((item) => item.id === domain.subjectId).nationalAverage + (domainIndex % 5 - 2) * 2, 30, 80);
    domains.push({ personId: student.personId, eventId: event.id, subjectId: domain.subjectId, domainId: domain.id, scoreRate: round1(scoreRate), nationalAverageRate, schoolAverageRate: clamp(nationalAverageRate + 2, 0, 100), sameAbilityAverageRate: clamp(nationalAverageRate + 4, 0, 100), nextLevelAverageRate: clamp(nationalAverageRate + 9, 0, 100) });
  }
}

const targets = [];
for (const [studentIndex, student] of students.entries()) for (const event of examEvents.slice(-2)) {
  const personScores = scores.filter((row) => row.personId === student.personId && row.eventId === event.id && row.scoreRate !== null && !subjectDefinitions.find((item) => item.id === row.subjectId).aggregate);
  if (!personScores.length) continue;
  const overall = personScores.reduce((sum, row) => sum + row.scoreRate, 0) / personScores.length;
  for (let preferenceOrder = 1; preferenceOrder <= 7; preferenceOrder += 1) {
    const definition = targetDefinitions[(studentIndex + preferenceOrder - 1) % targetDefinitions.length];
    const allEFixtureOffset = studentIndex % 18 === 0 ? 18 : 0;
    const border = 52 + ((studentIndex + preferenceOrder * 5) % 20) + allEFixtureOffset;
    const borderGap = round1(overall - border);
    const judgement = borderGap >= 8 ? "A" : borderGap >= 2 ? "B" : borderGap >= -5 ? "C" : borderGap >= -12 ? "D" : "E";
    const schedule = preferenceOrder === 1 ? "前期" : "一般";
    // Fabricated score-point gaps and printed-judgment fixtures, NOT a real admission algorithm.
    targets.push({ personId: student.personId, eventId: event.id, preferenceOrder, targetId: definition.id, universityId: definition.universityId, facultyId: definition.facultyId, programId: definition.programId, admissionMethodId: `admission.${definition.id}.${schedule}`, targetLabelRaw: definition.label, targetLabel: definition.label, schedule, judgement, borderGap, borderGapUnit: "SCORE_POINT", capacity: 40 + preferenceOrder * 20, rank: 1 + ((studentIndex * 13 + preferenceOrder * 7) % 260), population: 280 });
  }
}

const answers = [];
for (const [studentIndex, student] of students.entries()) for (const event of examEvents.slice(-2)) for (const domain of domainDefinitions) {
  const parent = scores.find((row) => row.personId === student.personId && row.eventId === event.id && row.subjectId === domain.subjectId && row.scoreRate !== null);
  if (!parent) continue;
  const question = domain.order + 1;
  const expected = (parent.scoreRate + ((question * 7 + studentIndex) % 19) - 9) / 100;
  const roll = ((studentIndex * 17 + question * 13 + event.round * 11 + domain.id.length) % 100) / 100;
  const result = roll < expected * .82 ? "correct" : roll < expected ? "partial" : roll > .93 ? "blank" : roll > .9 ? "extra" : "wrong";
  answers.push({ personId: student.personId, eventId: event.id, subjectId: domain.subjectId, domainId: domain.id, majorQuestion: question, questionNumber: question, result });
}

// Explicit report ownership prevents corrections and pending reports leaking into analysis.
const activeReports = new Map(reports.filter((row) => row.status === "ACTIVE").map((row) => [`${row.personId}|${row.eventId}`, row.reportId]));
for (const collection of [scores, domains, targets, answers]) for (const row of collection) row.reportId = activeReports.get(`${row.personId}|${row.eventId}`);
for (const row of scores) row.metricDefinitionId = subjectDefinitions.find((subject) => subject.id === row.subjectId).metricDefinitionId;
for (const row of domains) row.domainDefinitionVersion = domainDefinitions.find((domain) => domain.id === row.domainId).version;

const dataset = {
  meta: { datasetVersion: "demo-sheet.v5", generatedAt: "2026-10-03T00:00:00Z", title: "模試成績管理 架空デモデータ", notice: "すべて架空データです。実在の生徒・学校・成績とは関係ありません。", activeEventId: "ct.2026.2", baselineEventId: "ct.2026.1", defaultComparisonSubjectId: "overall-core", supportedScope: "添付PDF1件で確認済みの河合塾・全統共通テスト模試のみ。各回の数値・日程・判定は架空で、実帳票の追加対応を意味しません。" },
  sourceCapabilities: { parserStatus: "READY", detectionStatus: "MATCH", summaryMetrics: 14, convertedScores: 12, privateEvaluationMetrics: 5, trendRecords: 33, domainResults: 50, targets: 7, answerMarks: 477 },
  capabilityProfiles: [{ schemaVersion: "kawai.ct.v2", examDefinitionId: "kawai.ct", supports: { subjectScores: true, deviation: true, ranks: true, trends: true, domains: true, answerMarks: true, targets: true }, sourceStatus: "ATTACHED_PDF_CONFIRMED" }],
  followUpRules: { version: "demo-follow-up.v1", changeBandThreshold: 3, scoreRateDeclineThreshold: -5, targetPreferenceOrders: [1, 2, 3], targetJudgements: ["E"], targetMode: "ALL", editableBy: "ADMIN", labels: { decline: "前回比が5pt以上低い", targets: "第1～第3志望がすべてE判定" } },
  provenance: [
    { source: "PDF", label: "成績表から取得", fields: "模試・回次、学校、学年、氏名・受験番号、科目成績、順位・母数、分野、志望校、設問マーク" },
    { source: "UPLOAD", label: "登録時に選択", fields: "所属校舎" },
    { source: "SYSTEM", label: "システムが生成・計算", fields: "PersonID、登録状態、PDFハッシュ、得点率、前回差、中央値、四分位" },
    { source: "NOT_USED", label: "このデモでは使用しない", fields: "文理・国公私区分、登録予定人数、未対応模試の成績" },
  ],
  locations, schools, examDefinitions, examEvents, subjectDefinitions, domainDefinitions, targetDefinitions, students, reports, scores, domains, targets, answers,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(dataset), "utf8");
process.stdout.write(`Generated demo-sheet.v5: ${students.length} students, ${scores.length} scores, ${domains.length} domains, ${answers.length} answers\n`);
