import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "packages", "frontend-prototype", "data", "demo-dataset.json");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;

const locations = [
  { id: "loc.sapporo", label: "札幌駅前校" },
  { id: "loc.asahikawa", label: "旭川校" },
  { id: "loc.obihiro", label: "帯広校" },
  { id: "loc.hakodate", label: "函館校" },
];
const schoolNames = ["北星高校", "中央高校", "旭丘高校", "河畔高校", "十勝高校", "東陵高校", "函館南高校", "港陵高校"];
const schools = schoolNames.map((label, index) => ({ id: `school.${index + 1}`, label, locationId: locations[Math.floor(index / 2)].id }));
const examDefinitions = [
  { id: "kawai.ct", label: "全統共通テスト模試", scale: "score-rate" },
  { id: "kawai.written", label: "全統記述模試", scale: "deviation" },
];
const examEvents = [
  { id: "ct.2025.3", definitionId: "kawai.ct", year: 2025, round: 3, label: "2025年度 第3回 全統共通テスト模試", shortLabel: "25年 共テ③", examDate: "2025-10-05" },
  { id: "ct.2026.1", definitionId: "kawai.ct", year: 2026, round: 1, label: "2026年度 第1回 全統共通テスト模試", shortLabel: "共テ①", examDate: "2026-05-03" },
  { id: "wr.2026.1", definitionId: "kawai.written", year: 2026, round: 1, label: "2026年度 第1回 全統記述模試", shortLabel: "記述①", examDate: "2026-05-17" },
  { id: "ct.2026.2", definitionId: "kawai.ct", year: 2026, round: 2, label: "2026年度 第2回 全統共通テスト模試", shortLabel: "共テ②", examDate: "2026-08-09" },
  { id: "wr.2026.2", definitionId: "kawai.written", year: 2026, round: 2, label: "2026年度 第2回 全統記述模試", shortLabel: "記述②", examDate: "2026-09-06" },
];
const subjectDefinitions = [
  ["english-reading", "英語リーディング", "英語R", 100, 61], ["english-listening", "英語リスニング", "英語L", 100, 58],
  ["math-1a", "数学Ⅰ・A", "数学ⅠA", 100, 55], ["math-2bc", "数学Ⅱ・B・C", "数学ⅡBC", 100, 50],
  ["japanese", "国語", "国語", 200, 62], ["modern-japanese", "近代以降の文章", "現代文", 110, 64],
  ["classical-japanese", "古文", "古文", 45, 54], ["kanbun", "漢文", "漢文", 45, 55],
  ["geography", "地理総合・地理探究", "地理", 100, 58], ["japanese-history", "歴史総合・日本史探究", "日本史", 100, 57],
  ["world-history", "歴史総合・世界史探究", "世界史", 100, 56], ["public-ethics", "公共・倫理", "倫理", 100, 59],
  ["public-politics", "公共・政治経済", "政経", 100, 58], ["physics", "物理", "物理", 100, 55],
  ["chemistry", "化学", "化学", 100, 53], ["biology", "生物", "生物", 100, 57],
  ["earth-science", "地学", "地学", 100, 56], ["information-1", "情報Ⅰ", "情報Ⅰ", 100, 64],
].map(([id, label, shortLabel, maxScore, nationalAverage], order) => ({ id, label, shortLabel, maxScore, nationalAverage, order }));

const domainsBySubject = {
  "english-reading": ["論理展開", "要旨把握", "情報検索", "語彙・表現"],
  "english-listening": ["短い会話", "図表・講義", "複数話者"],
  "math-1a": ["数と式", "二次関数", "図形と計量", "場合の数と確率", "データの分析"],
  "math-2bc": ["微分・積分", "数列", "統計的な推測", "ベクトル"],
  japanese: ["論理的文章", "文学的文章", "実用的文章"],
  "modern-japanese": ["評論", "小説"], "classical-japanese": ["古文読解"], kanbun: ["漢文読解"],
  physics: ["力学", "波動", "電磁気"], chemistry: ["理論化学", "無機化学", "有機化学"],
  "information-1": ["情報社会", "プログラミング", "データ活用"],
};
const domainDefinitions = Object.entries(domainsBySubject).flatMap(([subjectId, labels]) => labels.map((label, index) => ({ id: `${subjectId}.${index + 1}`, subjectId, label, order: index })));
const targetDefinitions = [
  ["hokkai", "北海総合大学", "総合政策学部"], ["sapporo", "札幌未来大学", "データ科学部"], ["do-o", "道央教育大学", "教育学部"],
  ["north-tech", "北日本工科大学", "工学部"], ["hakodate", "函館国際大学", "国際学部"], ["tokachi", "十勝生命大学", "生命科学部"],
].map(([id, university, faculty]) => ({ id: `target.${id}`, university, faculty, label: `${university} ${faculty}` }));

const courses = ["国公立文系", "国公立理系", "私立文系", "私立理系"];
const students = Array.from({ length: 72 }, (_, index) => {
  const location = locations[index % locations.length];
  const schoolOptions = schools.filter((school) => school.locationId === location.id);
  return {
    personId: `demo-person-${String(index + 1).padStart(3, "0")}`,
    displayLabel: `デモ生徒${String(index + 1).padStart(2, "0")}`,
    locationId: location.id,
    schoolId: schoolOptions[Math.floor(index / locations.length) % 2].id,
    grade: index % 9 < 2 ? "高2" : "高3",
    course: courses[index % courses.length],
  };
});

function takesSubject(student, subjectId, event) {
  if (event.definitionId === "kawai.written" && ["english-listening", "information-1", "public-ethics", "public-politics"].includes(subjectId)) return false;
  if (["modern-japanese", "classical-japanese", "kanbun"].includes(subjectId)) return event.definitionId === "kawai.ct";
  if (["geography", "japanese-history", "world-history", "public-ethics", "public-politics"].includes(subjectId)) return (student.personId.charCodeAt(student.personId.length - 1) + subjectId.length) % 5 === 0;
  if (["physics", "chemistry", "biology", "earth-science"].includes(subjectId)) return (student.course.includes("理系") && ["physics", "chemistry"].includes(subjectId)) || (!student.course.includes("理系") && subjectId === "biology");
  return true;
}

const scores = [];
const reports = [];
for (const [studentIndex, student] of students.entries()) {
  const ability = 38 + ((studentIndex * 11) % 48);
  for (const [eventIndex, event] of examEvents.entries()) {
    const absentReport = (studentIndex + eventIndex * 7) % 37 === 0;
    const reportId = `report.${studentIndex + 1}.${eventIndex + 1}`;
    reports.push({ reportId, personId: student.personId, eventId: event.id, locationId: student.locationId, status: absentReport ? "PENDING" : "ACTIVE", completeness: absentReport ? .25 : 1, schemaVersion: event.definitionId === "kawai.ct" ? "kawai.ct.v2" : "kawai.written.demo.v1" });
    if (absentReport) continue;
    for (const [subjectIndex, subject] of subjectDefinitions.entries()) {
      if (!takesSubject(student, subject.id, event)) continue;
      const missingReason = (studentIndex * 5 + eventIndex * 3 + subjectIndex) % 113 === 0 ? "NOT_TAKEN" : null;
      const gain = eventIndex * 1.8 + ((studentIndex + subjectIndex) % 5) * .6;
      const variation = ((studentIndex * 3 + subjectIndex * 7 + eventIndex * 5) % 15) - 7;
      const rate = clamp((ability + gain + variation + (subjectIndex % 4 - 1.5) * 2) / 100, .18, .98);
      const score = missingReason ? null : Math.round(rate * subject.maxScore);
      const deviation = missingReason ? null : round1(50 + (rate * 100 - subject.nationalAverage) * .42 + (event.definitionId === "kawai.written" ? 1.5 : 0));
      scores.push({ personId: student.personId, eventId: event.id, subjectId: subject.id, score, maxScore: subject.maxScore, scoreRate: score === null ? null : round1(score / subject.maxScore * 100), nationalAverageRate: subject.nationalAverage, deviation, schoolRank: score === null ? null : 1 + ((studentIndex * 7 + subjectIndex) % 180), nationalRank: score === null ? null : 100 + ((studentIndex * 971 + subjectIndex * 137) % 62000), abilityLevel: deviation === null ? null : deviation >= 65 ? "S" : deviation >= 60 ? "A" : deviation >= 55 ? "B" : deviation >= 50 ? "C" : deviation >= 45 ? "D" : "E", missingReason });
    }
  }
}
reports.push({ reportId: "report.superseded", personId: students[0].personId, eventId: "ct.2026.2", locationId: students[0].locationId, status: "SUPERSEDED", completeness: 1, schemaVersion: "kawai.ct.v1" });

const domains = [];
for (const [studentIndex, student] of students.entries()) {
  for (const [eventIndex, event] of examEvents.entries()) {
    for (const [domainIndex, domain] of domainDefinitions.entries()) {
      if (!takesSubject(student, domain.subjectId, event)) continue;
      const parent = scores.find((row) => row.personId === student.personId && row.eventId === event.id && row.subjectId === domain.subjectId && row.scoreRate !== null);
      if (!parent) continue;
      const scoreRate = clamp(parent.scoreRate + ((studentIndex + domainIndex * 3) % 17) - 8, 5, 100);
      const nationalAverageRate = clamp(subjectDefinitions.find((item) => item.id === domain.subjectId).nationalAverage + (domainIndex % 5 - 2) * 2, 30, 80);
      domains.push({ personId: student.personId, eventId: event.id, subjectId: domain.subjectId, domainId: domain.id, scoreRate: round1(scoreRate), nationalAverageRate, sameAbilityAverageRate: clamp(nationalAverageRate + 4, 0, 100), higherJudgementAverageRate: clamp(nationalAverageRate + 9, 0, 100) });
    }
  }
}

const targets = [];
for (const [studentIndex, student] of students.entries()) {
  for (const event of examEvents.filter((item) => item.definitionId === "kawai.ct" && item.year === 2026)) {
    const personScores = scores.filter((row) => row.personId === student.personId && row.eventId === event.id && row.scoreRate !== null && !["modern-japanese", "classical-japanese", "kanbun"].includes(row.subjectId));
    if (!personScores.length) continue;
    const overall = personScores.reduce((sum, row) => sum + row.scoreRate, 0) / personScores.length;
    for (let preferenceOrder = 1; preferenceOrder <= 3; preferenceOrder += 1) {
      const definition = targetDefinitions[(studentIndex + preferenceOrder - 1) % targetDefinitions.length];
      const border = 52 + ((studentIndex + preferenceOrder * 5) % 20);
      const borderGap = round1(overall - border);
      const judgement = borderGap >= 8 ? "A" : borderGap >= 2 ? "B" : borderGap >= -5 ? "C" : borderGap >= -12 ? "D" : "E";
      targets.push({ personId: student.personId, eventId: event.id, preferenceOrder, targetId: definition.id, targetLabel: definition.label, judgement, borderGap, capacity: 40 + preferenceOrder * 20, rank: 1 + ((studentIndex * 13 + preferenceOrder * 7) % 260), population: 280 });
    }
  }
}

const answers = [];
const questionSubjects = ["english-reading", "math-1a", "japanese", "information-1"];
for (const [studentIndex, student] of students.entries()) {
  for (const event of examEvents.filter((item) => item.definitionId === "kawai.ct")) {
    for (const subjectId of questionSubjects) {
      const parent = scores.find((row) => row.personId === student.personId && row.eventId === event.id && row.subjectId === subjectId && row.scoreRate !== null);
      if (!parent) continue;
      for (let question = 1; question <= 12; question += 1) {
        const expected = (parent.scoreRate + ((question * 7 + studentIndex) % 19) - 9) / 100;
        const roll = ((studentIndex * 17 + question * 13 + event.round * 11) % 100) / 100;
        const result = roll < expected * .82 ? "correct" : roll < expected ? "partial" : roll > .93 ? "blank" : roll > .9 ? "extra" : "wrong";
        answers.push({ personId: student.personId, eventId: event.id, subjectId, majorQuestion: Math.ceil(question / 3), questionNumber: question, result });
      }
    }
  }
}

const expectedByEventLocation = [];
for (const event of examEvents) for (const location of locations) {
  const expected = students.filter((student) => student.locationId === location.id && (event.year === 2026 || student.grade === "高3")).length;
  const active = reports.filter((row) => row.eventId === event.id && row.locationId === location.id && row.status === "ACTIVE").length;
  expectedByEventLocation.push({ eventId: event.id, locationId: location.id, expected, registered: active, errors: (event.round + locations.indexOf(location)) % 9 === 0 ? 1 : 0 });
}

const dataset = {
  meta: { datasetVersion: "demo-sheet.v2", generatedAt: "2026-09-30T00:00:00Z", title: "模試成績管理 架空デモデータ", notice: "すべて架空データです。実在の生徒・学校・成績とは関係ありません。", activeEventId: "ct.2026.2", baselineEventId: "ct.2026.1" },
  sourceCapabilities: { summaryMetrics: 14, convertedScores: 12, privateEvaluationMetrics: 5, trendRecords: 33, domainResults: 50, targets: 7, answerMarks: 477 },
  locations, schools, examDefinitions, examEvents, subjectDefinitions, domainDefinitions, targetDefinitions, students, reports, scores, domains, targets, answers, expectedByEventLocation,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(dataset), "utf8");
process.stdout.write(`Generated demo-sheet.v2: ${students.length} students, ${scores.length} scores, ${domains.length} domains, ${answers.length} answers\n`);
