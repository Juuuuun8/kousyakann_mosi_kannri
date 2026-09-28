import type {
  MissingReason,
  SubjectDefinitionId,
  TargetEvaluationBand,
  TargetSchoolItem,
  TargetSubjectResult,
  TargetsPayload,
} from "../../../contracts/src/types.ts";
import type { PdfPageText } from "../../core/src/index.ts";
import type { LayoutLine, LayoutWord } from "./layout.ts";
import { normalizeCompact, normalizeWidth, numberOrNull, toLayoutLines } from "./layout.ts";

interface TargetBlock {
  readonly preferenceOrder: number;
  readonly centerX: number;
  readonly left: number;
  readonly right: number;
  readonly startY: number;
  readonly endY: number;
}

const TARGET_SUBJECT_IDS: Readonly<Record<string, string>> = {
  "英語": "subject.english.reading",
  "リスニング": "subject.english.listening",
  "国語": "subject.japanese.total",
  "情報": "subject.information.i",
  "情報I": "subject.information.i",
  "情報Ⅰ": "subject.information.i",
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function targetBlocks(lines: readonly LayoutLine[], pageRight: number, pageBottom: number): readonly TargetBlock[] {
  const headings = lines.flatMap((line) => line.words.flatMap((word) => {
    const match = normalizeCompact(word.text).match(/^第(\d+)志望$/u);
    return match ? [{ preferenceOrder: Number(match[1]), centerX: word.centerX, startY: line.y }] : [];
  }));
  const firstRow = headings.filter((heading) => heading.preferenceOrder <= 5).sort((left, right) => left.centerX - right.centerX);
  const pitch = median(firstRow.slice(1).map((heading, index) => heading.centerX - firstRow[index].centerX));
  return headings.map((heading) => {
    const nextRowY = Math.min(...headings.filter((candidate) => candidate.startY > heading.startY + 10).map((candidate) => candidate.startY), pageBottom);
    return {
      ...heading,
      left: Math.max(0, heading.centerX - pitch / 2),
      right: Math.min(pageRight, heading.centerX + pitch / 2),
      endY: nextRowY,
    };
  }).sort((left, right) => left.preferenceOrder - right.preferenceOrder);
}

function wordsInBlock(line: LayoutLine, block: TargetBlock): readonly LayoutWord[] {
  if (line.y < block.startY || line.y >= block.endY) return [];
  return line.words.filter((word) => word.centerX >= block.left && word.centerX < block.right);
}

function relativeX(word: LayoutWord, block: TargetBlock): number {
  return (word.centerX - block.left) / (block.right - block.left);
}

function blockLines(lines: readonly LayoutLine[], block: TargetBlock): readonly LayoutLine[] {
  return lines.flatMap((line) => {
    const words = wordsInBlock(line, block);
    return words.length === 0 ? [] : [{ y: line.y, words }];
  });
}

function normalizedLine(line: LayoutLine): string {
  return line.words.map((word) => normalizeWidth(word.text)).join("").replace(/\s+/gu, "").trim();
}

function numberFromWords(words: readonly LayoutWord[]): number | null {
  for (const word of words) {
    const match = normalizeWidth(word.text).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/u);
    if (match) return numberOrNull(match[0]);
  }
  return null;
}

function numberInRange(line: LayoutLine, block: TargetBlock, from: number, to: number): number | null {
  return numberFromWords(line.words.filter((word) => relativeX(word, block) >= from && relativeX(word, block) < to));
}

function linesBetween(lines: readonly LayoutLine[], startY: number, endY: number): readonly LayoutLine[] {
  return lines.filter((line) => line.y >= startY && line.y < endY);
}

function joinedJapanese(words: readonly LayoutWord[]): string | null {
  const text = words.map((word) => word.text.trim()).join("").trim().normalize("NFC");
  return /[ぁ-んァ-ヶ一-龯]/u.test(text) ? text : null;
}

function headerFields(lines: readonly LayoutLine[], block: TargetBlock) {
  const header = linesBetween(lines, block.startY + 7, Math.min(block.startY + 40, block.endY));
  const nameLines = header.flatMap((line) => {
    const text = joinedJapanese(line.words.filter((word) => {
      const position = relativeX(word, block);
      return position >= 0.20 && position < 0.84 && !normalizeCompact(word.text).startsWith("定員");
    }));
    return text === null ? [] : [text];
  });
  const scheduleParts = header.flatMap((line) => {
    const text = joinedJapanese(line.words.filter((word) => relativeX(word, block) < 0.20));
    return text === null ? [] : [text];
  });
  const headerText = header.map(normalizedLine).join(" ");
  const capacityMatch = normalizeWidth(headerText).match(/定員\((\d*)\)/u);
  const judgement = header.flatMap((line) => line.words)
    .filter((word) => relativeX(word, block) >= 0.84)
    .map((word) => normalizeWidth(word.text).trim())
    .find((value) => /^[A-H*]$/u.test(value)) ?? null;
  return {
    scheduleRaw: scheduleParts.length === 0 ? null : scheduleParts.join("\n"),
    universityRaw: nameLines[0] ?? null,
    facultyRaw: nameLines[1] ?? null,
    departmentMethodRaw: nameLines[2] ?? null,
    judgementRaw: judgement,
    capacity: capacityMatch && capacityMatch[1] !== "" ? numberOrNull(capacityMatch[1]) : null,
  };
}

function summaryFields(lines: readonly LayoutLine[], block: TargetBlock) {
  const personalLine = linesBetween(lines, block.startY + 35, block.startY + 54).find((line) => numberInRange(line, block, 0.24, 0.52) !== null);
  const fullScore = linesBetween(lines, block.startY + 45, block.startY + 66).flatMap((line) => {
    const match = normalizedLine(line).match(/\((\d+)\)/u);
    return match ? [numberOrNull(match[1])] : [];
  }).find((value) => value !== null) ?? null;
  const borderLine = linesBetween(lines, block.startY + 58, block.startY + 79).find((line) => normalizedLine(line).includes("ボーダーライン"));
  const rankLine = linesBetween(lines, block.startY + 78, block.startY + 98).find((line) => {
    const values = line.words.map((word) => normalizeWidth(word.text).trim());
    return values.filter((value) => /^\d+\/\d+$/u.test(value)).length >= 2;
  });
  const ranks = rankLine ? rankLine.words.map((word) => normalizeWidth(word.text).trim()).filter((value) => /^\d+\/\d+$/u.test(value)) : [];
  const averagesLine = linesBetween(lines, block.startY + 92, block.startY + 113).find((line) => {
    const values = line.words.filter((word) => relativeX(word, block) < 0.52).map((word) => normalizeWidth(word.text));
    return values.filter((value) => /^\d+(?:\.\d+)?点$/u.test(value)).length >= 2;
  });
  const averages = averagesLine ? averagesLine.words.filter((word) => relativeX(word, block) < 0.52).map((word) => normalizeWidth(word.text)).filter((value) => /^\d+(?:\.\d+)?点$/u.test(value)).map((value) => numberOrNull(value)) : [];
  const parseRank = (raw: string | undefined): readonly [number | null, number | null] => {
    const match = raw?.match(/(\d+)\/(\d+)/u);
    return match ? [numberOrNull(match[1]), numberOrNull(match[2])] : [null, null];
  };
  const [firstChoiceRank, firstChoicePopulation] = parseRank(ranks[0]);
  const [totalRank, totalPopulation] = parseRank(ranks[1]);
  const regionText = linesBetween(lines, block.startY + 30, block.startY + 58).map(normalizedLine).join("");
  return {
    scoreMetricRaw: regionText.includes("共通テスト得点") ? "共通テスト得点" : regionText.includes("偏差値") ? "偏差値" : null,
    scoreOrDeviation: personalLine ? numberInRange(personalLine, block, 0.24, 0.52) : null,
    fullScore,
    borderScore: borderLine ? numberInRange(borderLine, block, 0.24, 0.52) : null,
    firstChoiceRank,
    firstChoicePopulation,
    totalRank,
    totalPopulation,
    firstChoiceAverage: averages[0] ?? null,
    totalAverage: averages[1] ?? null,
  };
}

function subjectResults(lines: readonly LayoutLine[], block: TargetBlock): readonly TargetSubjectResult[] {
  const results: TargetSubjectResult[] = [];
  const detailLines = lines.filter((line) => line.y > block.startY + 112 && line.y < block.endY);
  for (const line of detailLines) {
    const metricWords = line.words.filter((word) => {
      const position = relativeX(word, block);
      return position >= 0.17 && position < 0.51;
    });
    if (numberFromWords(metricWords) === null) continue;
    const labels = lines.flatMap((candidate) => candidate.words.filter((word) => {
      const position = relativeX(word, block);
      return position < 0.17 && Math.abs(candidate.y - line.y) <= 6.5 && /[ぁ-んァ-ヶ一-龯]/u.test(word.text);
    })).sort((left, right) => left.y - right.y || left.x0 - right.x0);
    const subjectRaw = normalizeCompact(labels.map((word) => word.text).join(""));
    if (subjectRaw.length === 0 || subjectRaw === "教科") continue;
    const averageDeviation = numberInRange(line, block, 0.17, 0.29);
    const personalScore = numberInRange(line, block, 0.29, 0.40);
    const universityAllocation = numberInRange(line, block, 0.40, 0.51);
    const missingReason: MissingReason | null = averageDeviation === null && personalScore === null && universityAllocation === null ? "NOT_PRINTED" : null;
    results.push({
      subjectRaw,
      subjectDefinitionId: (TARGET_SUBJECT_IDS[subjectRaw] ?? null) as SubjectDefinitionId | null,
      averageDeviation,
      personalScore,
      universityAllocation,
      missingReason,
    });
  }
  return results;
}

function evaluationBands(lines: readonly LayoutLine[], block: TargetBlock): readonly TargetEvaluationBand[] {
  const bands: TargetEvaluationBand[] = [];
  for (const line of lines.filter((candidate) => candidate.y > block.startY + 58 && candidate.y < block.endY)) {
    const thresholdRaw = normalizeWidth(line.words.filter((word) => {
      const position = relativeX(word, block);
      return position >= 0.50 && position < 0.65;
    }).map((word) => word.text).join("")).replace(/\s+/gu, "");
    if (!/^(?:[A-H])?\d+(?:\.\d+)?[~～〜]$|^未満$/u.test(thresholdRaw)) continue;
    const population = numberInRange(line, block, 0.64, 0.76);
    const judgementRaw = thresholdRaw.match(/^([A-H])/u)?.[1] ?? null;
    const lowerBound = thresholdRaw === "未満" ? null : numberOrNull(thresholdRaw.replace(/^[A-H]/u, "").replace(/[~～〜]$/u, ""));
    bands.push({ thresholdRaw, judgementRaw, lowerBound, population, missingReason: population === null ? "NOT_PRINTED" : null });
  }
  return bands;
}

function parseTarget(lines: readonly LayoutLine[], block: TargetBlock): TargetSchoolItem | null {
  const within = blockLines(lines, block);
  const header = headerFields(within, block);
  if (header.universityRaw === null) return null;
  const summary = summaryFields(within, block);
  return {
    preferenceOrder: block.preferenceOrder,
    scheduleRaw: header.scheduleRaw,
    universityRaw: header.universityRaw,
    facultyRaw: header.facultyRaw,
    departmentMethodRaw: header.departmentMethodRaw,
    universityId: null,
    judgementRaw: header.judgementRaw,
    ...summary,
    capacity: header.capacity,
    subjectResults: subjectResults(within, block),
    evaluationBands: evaluationBands(within, block),
    missingReason: null,
  };
}

export function parseTargetsPayload(page: PdfPageText): TargetsPayload {
  const lines = toLayoutLines(page.items);
  const pageRight = Math.max(...page.items.map((entry) => (entry.x ?? 0) + (entry.width ?? 0)), 1);
  const pageBottom = Math.max(...page.items.map((entry) => (entry.y ?? 0) + (entry.height ?? 0)), 1) + 1;
  const items = targetBlocks(lines, pageRight, pageBottom).flatMap((block) => {
    const target = parseTarget(lines, block);
    return target === null ? [] : [target];
  });
  return { v: 1, type: "targets", items };
}

export function targetSlotCount(page: PdfPageText): number {
  return toLayoutLines(page.items).flatMap((line) => line.words)
    .filter((word) => /^第\d+志望$/u.test(normalizeCompact(word.text))).length;
}
