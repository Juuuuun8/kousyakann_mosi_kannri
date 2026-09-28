import type { MissingReason, SubjectDefinitionId } from "../../../contracts/src/types.ts";
import type { ExtractedField, PdfPageText } from "../../core/src/index.ts";
import { allWords, normalizeCompact, normalizeWidth, numberOrNull, toLayoutLines } from "./layout.ts";

export interface ParsedSubjectScore {
  readonly subjectRaw: string;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly attentionCodeRaw: string | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly deviation: number | null;
  readonly abilityLevel: string | null;
  readonly nationalAverage: number | null;
  readonly nationalRank: number | null;
  readonly nationalPopulation: number | null;
  readonly currentStudentAverage: number | null;
  readonly graduateAverage: number | null;
  readonly currentRank: number | null;
  readonly currentPopulation: number | null;
  readonly schoolDeviation: number | null;
  readonly schoolAverage: number | null;
  readonly schoolRank: number | null;
  readonly schoolPopulation: number | null;
  readonly missingReason: MissingReason | null;
}

export interface ParsedHeader {
  readonly fields: readonly ExtractedField[];
  readonly examCandidateId: string | null;
}

const SUBJECT_IDS: Readonly<Record<string, string>> = {
  "英語": "subject.english.reading",
  "リーディング": "subject.english.reading",
  "リスニング": "subject.english.listening",
  "英語+L": "subject.english.total",
  "英語リーディング": "subject.english.reading",
  "英語リスニング": "subject.english.listening",
  "英語計": "subject.english.total",
  "数学ⅠＡ": "subject.math.ia",
  "数学ⅠA": "subject.math.ia",
  "数学ⅡＢＣ": "subject.math.iibc",
  "数学ⅡBC": "subject.math.iibc",
  "数学IA": "subject.math.ia",
  "数学IIBC": "subject.math.iibc",
  "数学①②": "subject.math.total",
  "国語": "subject.japanese.total",
  "英数国総合": "subject.overall.core",
  "現代文": "subject.japanese.modern",
  "古文": "subject.japanese.classical",
  "漢文": "subject.japanese.kanbun",
  "物理": "subject.science.physics",
  "化学": "subject.science.chemistry",
  "地理": "subject.geography",
  "情報I": "subject.information.i",
  "情報Ⅰ": "subject.information.i",
  "国英6-8型": "subject.overall.6-8",
  "総合(国理6-8型)": "subject.overall.6-8",
  "総合(国理６－８型)": "subject.overall.6-8",
  "総合(国理6－8型)": "subject.overall.6-8",
  "総合(理系)": "subject.overall.science",
  "総合": "subject.overall.6-8",
  "国理6-8型": "subject.overall.6-8",
  "国理６－８型": "subject.overall.6-8",
  "数学1科目": "subject.math.private-eval.one",
  "数学2科目": "subject.math.private-eval.two",
  "数学(1科目)": "subject.math.private-eval.one",
  "数学(2科目)": "subject.math.private-eval.two",
  "現代文型": "subject.japanese.modern.private-eval",
  "現古型": "subject.japanese.modern-classical.private-eval",
  "国語型": "subject.japanese.total.private-eval",
  "国(現)": "subject.japanese.modern.private-eval",
  "国(現・古)": "subject.japanese.modern-classical.private-eval",
  "国(現・古・漢)": "subject.japanese.total.private-eval",
};

const SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  "英語英語": "英語",
  "リスニングリスニング": "リスニング",
  "数学①②数学①②": "数学①②",
  "国語国語": "国語",
  "理科化学": "化学",
  "理科物理": "物理",
  "情報情報I": "情報I",
  "情報情報Ⅰ": "情報Ⅰ",
  "国理6-8": "国理6-8型",
  "総合国理6-8": "国理6-8型",
};

const SUBJECT_LINE = /^(.*?)\s*([*＊#])?\s*(\d+|-+)\/(\d+|-+)\s+([\d.]+)\s+([SABCDEF])\s+([\d.]+|-+)\s+(\d+)\/(\d+)\s+([\d.]+|-+)\s+([\d.]+|-+)\s+(\d+)\/(\d+)\s+([\d.]+)\s+([\d.]+|-+)\s+(\d+)\/(\d+)$/u;
const DROP_LABELS = new Set(["理科", "地歴", "公民", "第1", "第2"]);

function cleanSubjectLabel(label: string): string {
  let parts = label.split(/[\s\u3000]+/u).filter(Boolean);
  if (parts[0]?.startsWith("総合")) return parts.length === 1 ? normalizeCompact(parts[0]) : `総合(${parts.slice(1).join("")})`;
  parts = parts.filter((part) => !DROP_LABELS.has(part));
  if (parts.length > 1 && ["数学①", "数学②", "情報", "英語", "国語"].includes(parts[0])) parts = parts.slice(1);
  return normalizeCompact(parts.join(""));
}

export function normalizeSubjectLabel(label: string): string {
  const compact = normalizeCompact(label).replace(/[－–—]/gu, "-");
  const aliased = SUBJECT_ALIASES[compact] ?? compact;
  if (/^総合\(.+\)$/u.test(aliased)) return aliased;
  return cleanSubjectLabel(aliased);
}

export function subjectDefinitionIdFor(label: string): SubjectDefinitionId | null {
  return (SUBJECT_IDS[normalizeSubjectLabel(label)] ?? null) as SubjectDefinitionId | null;
}

function nullableInteger(value: string): number | null {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

export function parseHeader(page: PdfPageText): ParsedHeader {
  const lines = toLayoutLines(page.items);
  const topLines = lines.filter((line) => line.y < 55);
  const fields: ExtractedField[] = [];
  let examCandidateId: string | null = null;
  for (const line of topLines) {
    const tokens = line.words.map((word) => normalizeWidth(word.text));
    const joined = tokens.join(" ");
    const school = joined.match(/(?:^|\s)(\d{5})\s+([^\d]+?)(?=\s|$)/u);
    if (school) {
      fields.push({ key: "school_code_raw", rawValue: school[1], pageNumber: page.pageNumber, sourceLabel: "学校コード" });
      fields.push({ key: "school_name_raw", rawValue: school[2].trim(), pageNumber: page.pageNumber, sourceLabel: "学校" });
    }
    const grade = joined.match(/(\d+)年\s+(\S+)\s+クラス\s+(\S+)\s+番/u);
    if (grade) {
      fields.push({ key: "grade_raw", rawValue: grade[1], pageNumber: page.pageNumber, sourceLabel: "学年" });
      fields.push({ key: "class_raw", rawValue: grade[2], pageNumber: page.pageNumber, sourceLabel: "クラス" });
      fields.push({ key: "local_number_raw", rawValue: grade[3], pageNumber: page.pageNumber, sourceLabel: "番号" });
    }
    const candidate = joined.match(/((?:[ァ-ヶー]+\s*)+)\s+(\d{6,8})(?:\s|$)/u);
    if (candidate) {
      fields.push({ key: "student_name_kana_raw", rawValue: candidate[1].trim().normalize("NFC"), pageNumber: page.pageNumber, sourceLabel: "氏名カナ" });
      fields.push({ key: "exam_candidate_id", rawValue: candidate[2], pageNumber: page.pageNumber, sourceLabel: "受験番号" });
      examCandidateId = candidate[2];
    }
  }
  const examMatch = normalizeWidth(page.text).replace(/[\s\u3000]+/gu, "").match(/(\d{4}年度第\d+回全統共通テスト模試)/u);
  if (examMatch) fields.push({ key: "exam_event_raw", rawValue: examMatch[1], pageNumber: page.pageNumber, sourceLabel: "模試" });
  return { fields, examCandidateId };
}

export function parseSubjectScores(page: PdfPageText): readonly ParsedSubjectScore[] {
  const lines = toLayoutLines(page.items);
  const pageRight = Math.max(...page.items.map((entry) => (entry.x ?? 0) + (entry.width ?? 0)), 1);
  const summaryRight = pageRight * 0.62;
  const scores: ParsedSubjectScore[] = [];
  for (const line of lines) {
    const raw = line.words.filter((word) => word.x0 < summaryRight).map((word) => normalizeWidth(word.text)).join(" ").replace(/\s+/gu, " ").trim();
    const match = raw.match(SUBJECT_LINE);
    if (!match) continue;
    const subjectRaw = cleanSubjectLabel(match[1]);
    if (subjectRaw.length === 0 || (!/[ぁ-んァ-ヶ一-龯]/u.test(subjectRaw) && !subjectRaw.includes("英語"))) continue;
    const missingReason: MissingReason | null = numberOrNull(match[3]) === null ? "NOT_TAKEN" : null;
    scores.push({
      subjectRaw,
      subjectDefinitionId: subjectDefinitionIdFor(subjectRaw),
      attentionCodeRaw: match[2] ?? null,
      score: numberOrNull(match[3]), maxScore: numberOrNull(match[4]), deviation: numberOrNull(match[5]), abilityLevel: match[6] ?? null,
      nationalAverage: numberOrNull(match[7]), nationalRank: nullableInteger(match[8]), nationalPopulation: nullableInteger(match[9]),
      currentStudentAverage: numberOrNull(match[10]), graduateAverage: numberOrNull(match[11]), currentRank: nullableInteger(match[12]), currentPopulation: nullableInteger(match[13]),
      schoolDeviation: numberOrNull(match[14]), schoolAverage: numberOrNull(match[15]), schoolRank: nullableInteger(match[16]), schoolPopulation: nullableInteger(match[17]),
      missingReason,
    });
  }
  return scores;
}

export function headerField(fields: readonly ExtractedField[], key: string): string | null {
  return fields.find((field) => field.key === key)?.rawValue ?? null;
}

export function pageOneHasRequiredAnchors(page: PdfPageText): boolean {
  const compact = normalizeCompact(allWords(toLayoutLines(page.items)).map((word) => word.text).join(""));
  return compact.includes("1-(1)成績概況") && compact.includes("2.成績推移");
}
