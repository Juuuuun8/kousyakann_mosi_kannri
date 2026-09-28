import type {
  AnswerCorrectnessCode,
  AnswerMarkTuple,
  AnswerMarksPayload,
  MissingReason,
  SubjectDefinitionId,
} from "../../../contracts/src/types.ts";
import type { PdfPageText } from "../../core/src/index.ts";
import type { LayoutWord } from "./layout.ts";
import { normalizeCompact, normalizeWidth, numberOrNull, toLayoutLines } from "./layout.ts";

type RowType = "major" | "answer" | "correctness" | "mark";

interface RowSegment {
  readonly type: RowType;
  readonly y: number;
  readonly labelX: number;
  readonly data: readonly LayoutWord[];
}

interface SubjectHeading {
  readonly subjectRaw: string;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly y: number;
}

const ROW_LABELS: Readonly<Record<string, RowType>> = {
  "大問番号": "major",
  "解答番号": "answer",
  "正": "correctness",
  "正誤": "correctness",
  "マーク": "mark",
};

const SUBJECTS: readonly [string, string][] = [
  ["リーディング", "subject.english.reading"],
  ["数学ⅠA", "subject.math.ia"],
  ["数学ⅠＡ", "subject.math.ia"],
  ["数学IＡ", "subject.math.ia"],
  ["数学ⅡBC", "subject.math.iibc"],
  ["数学ⅡＢＣ", "subject.math.iibc"],
  ["数学IIBC", "subject.math.iibc"],
  ["国語", "subject.japanese.total"],
  ["化学", "subject.science.chemistry"],
  ["物理", "subject.science.physics"],
  ["地理", "subject.geography"],
  ["情報Ⅰ", "subject.information.i"],
  ["情報I", "subject.information.i"],
] as const;

function rowType(word: LayoutWord): RowType | null {
  return ROW_LABELS[normalizeCompact(word.text)] ?? null;
}

function usableData(type: RowType, words: readonly LayoutWord[]): readonly LayoutWord[] {
  return words.filter((word) => {
    const text = normalizeWidth(word.text).trim();
    if (text === "" || text === "誤" || rowType(word) !== null) return false;
    if (type === "major") return /^\d+$/u.test(text);
    if (type === "answer") return /^\d+$|^[ァ-ヶー]$/u.test(text);
    if (type === "correctness") return /^[○〇×△SNW]$/u.test(text);
    return !/[ぁ-んァ-ヶ一-龯]{2,}/u.test(text);
  });
}

function rowSegments(page: PdfPageText): readonly RowSegment[] {
  const lines = toLayoutLines(page.items, 3, 0);
  const segments: RowSegment[] = [];
  for (const line of lines) {
    const labels = line.words.flatMap((word, index) => {
      const type = rowType(word);
      return type === null ? [] : [{ index, type, word }];
    });
    labels.forEach((label, index) => {
      const end = labels[index + 1]?.index ?? line.words.length;
      segments.push({
        type: label.type,
        y: line.y,
        labelX: label.word.x0,
        data: usableData(label.type, line.words.slice(label.index + 1, end)),
      });
    });
  }
  return segments;
}

function subjectHeadings(page: PdfPageText): readonly SubjectHeading[] {
  const lines = toLayoutLines(page.items, 3, 0);
  return lines.flatMap((line) => {
    const text = normalizeCompact(line.words.map((word) => word.text).join(""));
    for (const [label, id] of SUBJECTS) {
      if (text.includes(label)) return [{ subjectRaw: label, subjectDefinitionId: id as SubjectDefinitionId, y: line.y }];
    }
    return [];
  });
}

function closestSegment(segments: readonly RowSegment[], type: RowType, y: number, labelX: number): readonly LayoutWord[] {
  const candidates = segments.filter((segment) => segment.type === type && Math.abs(segment.labelX - labelX) < 15 && Math.abs(segment.y - y) < 4)
    .sort((left, right) => Math.abs(left.y - y) - Math.abs(right.y - y));
  return candidates[0]?.data ?? [];
}

function valueAt(words: readonly LayoutWord[], centerX: number): string | null {
  const nearest = [...words].sort((left, right) => Math.abs(left.centerX - centerX) - Math.abs(right.centerX - centerX))[0];
  return nearest && Math.abs(nearest.centerX - centerX) < 5 ? normalizeWidth(nearest.text).trim() : null;
}

function correctness(raw: string | null): { code: AnswerCorrectnessCode | null; missingReason: MissingReason | null } {
  if (raw === null || raw === "") return { code: null, missingReason: "BLANK_ON_REPORT" };
  if (raw === "○" || raw === "〇") return { code: "CORRECT", missingReason: null };
  if (raw === "×") return { code: "WRONG", missingReason: null };
  if (raw === "△") return { code: "PARTIAL", missingReason: null };
  if (raw === "S") return { code: "UNDETERMINED", missingReason: null };
  if (raw === "N") return { code: "NO_ANSWER", missingReason: null };
  if (raw === "W") return { code: "EXTRA_MARK", missingReason: null };
  return { code: null, missingReason: "UNKNOWN_CODE" };
}

function subjectForSegment(answer: RowSegment, headings: readonly SubjectHeading[], page: PdfPageText, baseLabelX: number): SubjectHeading | null {
  if (answer.labelX > baseLabelX + 50) {
    const listening = page.items.find((item) => item.text.includes("リスニング") && item.x !== null && item.x > baseLabelX + 50 && item.x < answer.labelX && item.y !== null && Math.abs(item.y - answer.y) < 20);
    if (listening) return { subjectRaw: "リスニング", subjectDefinitionId: "subject.english.listening" as SubjectDefinitionId, y: listening.y ?? answer.y };
  }
  return [...headings].sort((left, right) => Math.abs(left.y - answer.y) - Math.abs(right.y - answer.y))[0] ?? null;
}

export function parseAnswerMarks(page: PdfPageText): readonly AnswerMarksPayload[] {
  const segments = rowSegments(page);
  const answers = segments.filter((segment) => segment.type === "answer" && segment.data.length > 0);
  if (answers.length === 0) return [];
  const baseLabelX = Math.min(...answers.map((segment) => segment.labelX));
  const headings = subjectHeadings(page);
  const tuples = new Map<string, { subjectDefinitionId: SubjectDefinitionId | null; items: AnswerMarkTuple[] }>();
  const lastMajor = new Map<string, number | null>();
  for (const answer of answers) {
    const subject = subjectForSegment(answer, headings, page, baseLabelX);
    if (subject === null) continue;
    const majorWords = closestSegment(segments, "major", answer.y - 8, answer.labelX);
    const correctnessWords = closestSegment(segments, "correctness", answer.y + 8, answer.labelX);
    const markWords = closestSegment(segments, "mark", answer.y + 16, answer.labelX);
    let currentMajor = lastMajor.get(subject.subjectRaw) ?? null;
    const subjectItems = tuples.get(subject.subjectRaw) ?? { subjectDefinitionId: subject.subjectDefinitionId, items: [] };
    for (const answerWord of answer.data) {
      for (const majorWord of majorWords) {
        if (majorWord.x0 <= answerWord.centerX + 3) {
          const parsed = numberOrNull(normalizeWidth(majorWord.text));
          if (parsed !== null && Number.isInteger(parsed)) currentMajor = parsed;
        }
      }
      const answerNumberRaw = normalizeWidth(answerWord.text).trim();
      const correctnessRaw = valueAt(correctnessWords, answerWord.centerX);
      const markRaw = valueAt(markWords, answerWord.centerX);
      const normalized = correctness(correctnessRaw);
      subjectItems.items.push([currentMajor, answerNumberRaw, correctnessRaw, normalized.code, markRaw, normalized.missingReason]);
    }
    lastMajor.set(subject.subjectRaw, currentMajor);
    tuples.set(subject.subjectRaw, subjectItems);
  }
  return [...tuples.entries()].map(([subject, value]) => ({ v: 1, type: "answer_marks", subject, items: value.items }));
}

export function answerMarkCount(payloads: readonly AnswerMarksPayload[]): number {
  return payloads.reduce((sum, payload) => sum + payload.items.length, 0);
}
