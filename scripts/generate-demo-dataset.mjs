import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "packages", "frontend-prototype", "data", "demo-dataset.json");

const locations = [
  { id: "loc.sapporo", label: "札幌駅前校" },
  { id: "loc.asahikawa", label: "旭川校" },
  { id: "loc.obihiro", label: "帯広校" },
];
const schools = [
  { id: "school.north", label: "北星高校", locationId: "loc.sapporo" },
  { id: "school.central", label: "中央高校", locationId: "loc.sapporo" },
  { id: "school.asahi", label: "旭丘高校", locationId: "loc.asahikawa" },
  { id: "school.river", label: "河畔高校", locationId: "loc.asahikawa" },
  { id: "school.tokachi", label: "十勝高校", locationId: "loc.obihiro" },
  { id: "school.east", label: "東陵高校", locationId: "loc.obihiro" },
];
const examEvents = [
  { id: "kawai.ct.2026.round-1", year: 2026, round: 1, label: "第1回 全統共通テスト模試", examDate: "2026-05-03" },
  { id: "kawai.ct.2026.round-2", year: 2026, round: 2, label: "第2回 全統共通テスト模試", examDate: "2026-08-09" },
];
const subjectDefinitions = [
  { id: "english-reading", label: "英語リーディング", shortLabel: "英語R", maxScore: 100, nationalAverage: 61 },
  { id: "english-listening", label: "英語リスニング", shortLabel: "英語L", maxScore: 100, nationalAverage: 58 },
  { id: "math-1a", label: "数学Ⅰ・A", shortLabel: "数学ⅠA", maxScore: 100, nationalAverage: 55 },
  { id: "math-2bc", label: "数学Ⅱ・B・C", shortLabel: "数学ⅡBC", maxScore: 100, nationalAverage: 50 },
  { id: "japanese", label: "国語", shortLabel: "国語", maxScore: 200, nationalAverage: 62 },
  { id: "science", label: "理科", shortLabel: "理科", maxScore: 100, nationalAverage: 56 },
  { id: "information-1", label: "情報Ⅰ", shortLabel: "情報Ⅰ", maxScore: 100, nationalAverage: 64 },
];
const subjectAdjustments = [-2, 4, -5, -8, 2, 0, 3];
const targetLabels = ["北海総合大学", "札幌未来大学", "道央教育大学", "北日本工科大学"];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round1 = (value) => Math.round(value * 10) / 10;

const students = Array.from({ length: 24 }, (_, index) => {
  const location = locations[index % locations.length];
  const schoolOptions = schools.filter((school) => school.locationId === location.id);
  return {
    personId: `demo-person-${String(index + 1).padStart(3, "0")}`,
    displayLabel: `デモ生徒${String(index + 1).padStart(2, "0")}`,
    locationId: location.id,
    schoolId: schoolOptions[Math.floor(index / locations.length) % schoolOptions.length].id,
    grade: index % 5 === 0 ? "高2" : "高3",
  };
});

const scores = [];
const reports = [];
for (const [studentIndex, student] of students.entries()) {
  const baseAbility = 43 + ((studentIndex * 7) % 39);
  for (const [eventIndex, event] of examEvents.entries()) {
    const reportId = `demo-report-${studentIndex + 1}-${eventIndex + 1}`;
    reports.push({ reportId, personId: student.personId, eventId: event.id, locationId: student.locationId, status: "ACTIVE", schemaVersion: eventIndex === 0 ? "kawai.ct.v1" : "kawai.ct.v2", completeness: 1 });
    for (const [subjectIndex, subject] of subjectDefinitions.entries()) {
      const missingReason = (studentIndex === 22 && eventIndex === 1 && subject.id === "math-2bc") || (studentIndex === 23 && eventIndex === 0 && subject.id === "english-listening") ? "NOT_TAKEN" : null;
      if (missingReason) {
        scores.push({ reportId, personId: student.personId, eventId: event.id, locationId: student.locationId, schoolId: student.schoolId, subjectId: subject.id, score: null, maxScore: subject.maxScore, scoreRate: null, nationalAverage: subject.nationalAverage, deviation: null, abilityLevel: null, missingReason });
        continue;
      }
      const eventGain = eventIndex === 0 ? 0 : 2 + ((studentIndex + subjectIndex) % 6);
      const variation = ((studentIndex * 3 + subjectIndex * 5 + eventIndex * 2) % 9) - 4;
      const scoreRate = clamp((baseAbility + subjectAdjustments[subjectIndex] + eventGain + variation) / 100, .23, .96);
      const score = Math.round(scoreRate * subject.maxScore);
      const deviation = round1(50 + ((score / subject.maxScore * 100) - subject.nationalAverage) * .46);
      const abilityLevel = deviation >= 65 ? "S" : deviation >= 60 ? "A" : deviation >= 55 ? "B" : deviation >= 50 ? "C" : deviation >= 45 ? "D" : "E";
      scores.push({ reportId, personId: student.personId, eventId: event.id, locationId: student.locationId, schoolId: student.schoolId, subjectId: subject.id, score, maxScore: subject.maxScore, scoreRate: round1(score / subject.maxScore * 100) / 100, nationalAverage: subject.nationalAverage, deviation, abilityLevel, missingReason: null });
    }
  }
}
reports.push(
  { reportId: "demo-report-pending", personId: null, eventId: examEvents[1].id, locationId: locations[0].id, status: "PENDING", schemaVersion: "kawai.ct.v2", completeness: .45 },
  { reportId: "demo-report-superseded", personId: students[0].personId, eventId: examEvents[1].id, locationId: locations[0].id, status: "SUPERSEDED", schemaVersion: "kawai.ct.v2", completeness: 1 },
);

const domainDefinitions = [
  { id: "math.probability", label: "場合の数と確率", maxScore: 30 },
  { id: "math.figures", label: "図形の性質", maxScore: 30 },
  { id: "math.data", label: "データの分析", maxScore: 40 },
];
const domains = [];
for (const [studentIndex, student] of students.entries()) {
  for (const [eventIndex, event] of examEvents.entries()) {
    for (const [domainIndex, domain] of domainDefinitions.entries()) {
      const rate = clamp((42 + ((studentIndex * 7) % 39) + (eventIndex ? 4 : 0) + [1, -4, 3][domainIndex] + ((studentIndex + domainIndex) % 7 - 3)) / 100, .15, .98);
      const score = Math.round(rate * domain.maxScore);
      const nationalRate = [.54, .49, .58][domainIndex];
      domains.push({ personId: student.personId, eventId: event.id, locationId: student.locationId, schoolId: student.schoolId, subjectId: "math-1a", domainId: domain.id, score, maxScore: domain.maxScore, scoreRate: round1(score / domain.maxScore * 100) / 100, nationalAverageRate: nationalRate, sameAbilityAverageRate: clamp(nationalRate + .04, 0, 1), missingReason: null });
    }
  }
}

const currentScores = scores.filter((item) => item.eventId === examEvents[1].id && item.scoreRate !== null);
const targets = students.map((student, index) => {
  const personScores = currentScores.filter((item) => item.personId === student.personId);
  const meanRate = personScores.reduce((sum, item) => sum + item.scoreRate, 0) / personScores.length;
  const targetIndex = index % targetLabels.length;
  const targetDifficulty = [.69, .62, .57, .53][targetIndex];
  const borderGap = Math.round((meanRate - targetDifficulty) * 100);
  const judgement = borderGap >= 8 ? "A" : borderGap >= 1 ? "B" : borderGap >= -7 ? "C" : borderGap >= -14 ? "D" : "E";
  return { personId: student.personId, eventId: examEvents[1].id, preferenceOrder: 1, targetId: `target-${targetIndex + 1}`, targetLabel: targetLabels[targetIndex], judgement, borderGap, metric: "score-rate-point" };
});

const answers = students.map((student) => {
  const score = currentScores.find((item) => item.personId === student.personId && item.subjectId === "math-1a");
  const rate = score?.scoreRate ?? 0;
  const correct = Math.round(40 * rate * .82);
  const partial = Math.round(40 * rate * .18);
  const blank = rate < .5 ? 3 : rate < .7 ? 2 : 1;
  const extra = Number(student.personId.endsWith("007") || student.personId.endsWith("019"));
  const wrong = 40 - correct - partial - blank - extra;
  return { personId: student.personId, eventId: examEvents[1].id, subjectId: "math-1a", correct, wrong, partial, blank, extra };
});

const dataset = {
  meta: {
    datasetVersion: "demo-sheet.v1",
    generatedAt: "2026-09-29T00:00:00Z",
    title: "全統共通テスト模試 架空デモデータ",
    sourceStructure: "河合塾・全統共通テスト模試 個人成績表（4ページ構成）",
    notice: "すべて架空データです。実在の生徒・学校・成績とは関係ありません。",
    activeEventId: examEvents[1].id,
    baselineEventId: examEvents[0].id,
  },
  locations,
  schools,
  examEvents,
  subjectDefinitions,
  domainDefinitions,
  students,
  reports,
  scores,
  domains,
  targets,
  answers,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
process.stdout.write(`Generated ${output}\nStudents: ${students.length}; scores: ${scores.length}; domains: ${domains.length}\n`);
