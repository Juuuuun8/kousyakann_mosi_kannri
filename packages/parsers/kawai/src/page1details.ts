import type {
  AbilityLevel,
  MetricDefinitionId,
  MissingReason,
  SubjectDefinitionId,
  TrendItem,
  TrendPayload,
} from "../../../contracts/src/types.ts";
import type { PdfPageText } from "../../core/src/index.ts";
import type { LayoutLine, LayoutWord } from "./layout.ts";
import { normalizeCompact, normalizeWidth, numberOrNull, toLayoutLines } from "./layout.ts";
import { normalizeSubjectLabel, subjectDefinitionIdFor } from "./page1.ts";

export interface ParsedAdditionalMetric {
  readonly subjectRaw: string;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly metricDefinitionId: MetricDefinitionId;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly deviation: number | null;
  readonly missingReason: MissingReason | null;
}

const CONVERTED_METRIC = "metric.kawai.common-test-converted-score" as MetricDefinitionId;
const PRIVATE_DEVIATION_METRIC = "metric.kawai.private-university-deviation" as MetricDefinitionId;
const ABILITY_LEVEL = /^[SABCDEF]$/u;

function pageRight(page: PdfPageText): number {
  return Math.max(...page.items.map((item) => (item.x ?? 0) + (item.width ?? 0)), 1);
}

function wordsText(words: readonly LayoutWord[]): string {
  return normalizeCompact(words.map((word) => word.text).join(""));
}

function findHeading(lines: readonly LayoutLine[], marker: string): LayoutWord | null {
  const normalized = normalizeCompact(marker);
  return lines.flatMap((line) => line.words).find((word) => normalizeCompact(word.text).includes(normalized)) ?? null;
}

function subjectId(label: string): SubjectDefinitionId | null {
  const cleaned = normalizeSubjectLabel(label.replace(/^第[12]/u, ""));
  return subjectDefinitionIdFor(cleaned);
}

export function parseAdditionalSubjectMetrics(page: PdfPageText): readonly ParsedAdditionalMetric[] {
  const lines = toLayoutLines(page.items);
  const convertedHeading = findHeading(lines, "共通テスト換算得点");
  const privateHeading = findHeading(lines, "私大評価用偏差値");
  if (!convertedHeading || !privateHeading) return [];

  const convertedLeft = Math.max(0, convertedHeading.x0 - pageRight(page) * 0.04);
  const convertedRight = privateHeading.x0 - 2;
  const converted = lines.flatMap((line) => {
    if (line.y <= convertedHeading.y + 3 || line.y > convertedHeading.y + 140) return [];
    const raw = wordsText(line.words.filter((word) => word.centerX >= convertedLeft && word.centerX < convertedRight));
    const match = raw.match(/^(.+?)(?:[*＊#])?(\d+|-+)\/(\d+|-+)$/u);
    if (!match || !/[ぁ-んァ-ヶ一-龯]/u.test(match[1]!)) return [];
    const subjectRaw = normalizeSubjectLabel(match[1]!);
    const score = numberOrNull(match[2]);
    const maxScore = numberOrNull(match[3]);
    return [{
      subjectRaw,
      subjectDefinitionId: subjectId(subjectRaw),
      metricDefinitionId: CONVERTED_METRIC,
      score,
      maxScore,
      deviation: null,
      missingReason: score === null ? "NOT_TAKEN" as const : null,
    }];
  });

  const privateLeft = Math.max(convertedRight, privateHeading.x0 - pageRight(page) * 0.02);
  const privateDeviations = lines.flatMap((line) => {
    if (line.y <= privateHeading.y + 3 || line.y > privateHeading.y + 65) return [];
    const raw = wordsText(line.words.filter((word) => word.centerX >= privateLeft));
    const match = raw.match(/^(.+?)(\d+(?:\.\d+)?|-+)$/u);
    if (!match || !/[ぁ-んァ-ヶ一-龯]/u.test(match[1]!)) return [];
    const subjectRaw = normalizeSubjectLabel(match[1]!);
    const deviation = numberOrNull(match[2]);
    return [{
      subjectRaw,
      subjectDefinitionId: subjectId(subjectRaw),
      metricDefinitionId: PRIVATE_DEVIATION_METRIC,
      score: null,
      maxScore: null,
      deviation,
      missingReason: deviation === null ? "NOT_PRINTED" as const : null,
    }];
  });
  return [...converted, ...privateDeviations];
}

interface TrendBlock {
  readonly left: number;
  readonly right: number;
  readonly headerY: number;
  readonly subjectX: number;
  readonly scoreX: number;
  readonly deviationX: number;
  readonly abilityX: number;
  readonly examEventIdRaw: string;
}

function nearestText(words: readonly LayoutWord[], targetX: number): string | null {
  const candidate = [...words].sort((left, right) => Math.abs(left.centerX - targetX) - Math.abs(right.centerX - targetX))[0];
  return candidate ? normalizeWidth(candidate.text).trim() : null;
}

function trendBlocks(lines: readonly LayoutLine[], right: number): readonly TrendBlock[] {
  const headerLine = [...lines].reverse().find((line) => line.words.filter((word) => normalizeCompact(word.text) === "科目").length >= 2);
  if (!headerLine) return [];
  const subjectHeaders = headerLine.words.filter((word) => normalizeCompact(word.text) === "科目").sort((a, b) => a.centerX - b.centerX);
  return subjectHeaders.flatMap((subjectHeader, index) => {
    const previous = subjectHeaders[index - 1];
    const next = subjectHeaders[index + 1];
    const left = previous ? subjectHeader.centerX - (subjectHeader.centerX - previous.centerX) * 0.08 : 0;
    const blockRight = next ? next.centerX - (next.centerX - subjectHeader.centerX) * 0.08 : right;
    const words = headerLine.words.filter((word) => word.centerX >= left && word.centerX < blockRight);
    const score = words.find((word) => normalizeCompact(word.text) === "得点");
    const deviation = words.find((word) => normalizeCompact(word.text) === "偏差値");
    const ability = words.find((word) => normalizeCompact(word.text) === "レベル");
    if (!score || !deviation || !ability) return [];
    const titleLines = lines.filter((line) => line.y < headerLine.y - 1 && line.y >= headerLine.y - 45).sort((a, b) => b.y - a.y);
    let examEventIdRaw = "";
    for (const line of titleLines) {
      const text = wordsText(line.words.filter((word) => word.centerX >= left && word.centerX < blockRight));
      if (text && text !== "2.成績推移" && text !== "成績推移") {
        examEventIdRaw = text;
        break;
      }
    }
    if (!examEventIdRaw) return [];
    return [{ left, right: blockRight, headerY: headerLine.y, subjectX: subjectHeader.centerX, scoreX: score.centerX, deviationX: deviation.centerX, abilityX: ability.centerX, examEventIdRaw }];
  });
}

function metricWords(words: readonly LayoutWord[], from: number, to: number): readonly LayoutWord[] {
  return words.filter((word) => word.centerX >= from && word.centerX < to);
}

function numericValue(raw: string | null): number | null {
  if (!raw) return null;
  const numerator = normalizeWidth(raw).match(/^-?\d+(?:\.\d+)?/u)?.[0];
  return numberOrNull(numerator);
}

function trendItem(line: LayoutLine, block: TrendBlock): TrendItem | null {
  const words = line.words.filter((word) => word.centerX >= block.left && word.centerX < block.right);
  if (words.length === 0) return null;
  const subjectScoreBoundary = (block.subjectX + block.scoreX) / 2;
  const scoreDeviationBoundary = (block.scoreX + block.deviationX) / 2;
  const deviationAbilityBoundary = (block.deviationX + block.abilityX) / 2;
  const subjectRaw = normalizeSubjectLabel(wordsText(metricWords(words, block.left, subjectScoreBoundary)));
  if (!subjectRaw || !/[ぁ-んァ-ヶ一-龯]/u.test(subjectRaw)) return null;
  const scoreRaw = nearestText(metricWords(words, subjectScoreBoundary, scoreDeviationBoundary), block.scoreX);
  const deviationRaw = nearestText(metricWords(words, scoreDeviationBoundary, deviationAbilityBoundary), block.deviationX);
  const abilityRaw = nearestText(metricWords(words, deviationAbilityBoundary, block.right), block.abilityX);
  const score = numericValue(scoreRaw);
  const deviation = numericValue(deviationRaw);
  const abilityLevel = abilityRaw && ABILITY_LEVEL.test(normalizeWidth(abilityRaw)) ? normalizeWidth(abilityRaw) as AbilityLevel : null;
  if (score === null && deviation === null && abilityLevel === null) return null;
  return {
    examEventIdRaw: block.examEventIdRaw,
    examEventId: null,
    subjectRaw,
    subjectDefinitionId: subjectId(subjectRaw),
    score,
    deviation,
    abilityLevel,
    missingReason: null,
  };
}

export function parseTrendPayload(page: PdfPageText): TrendPayload {
  const lines = toLayoutLines(page.items);
  const blocks = trendBlocks(lines, pageRight(page));
  const items = blocks.flatMap((block) => lines.flatMap((line) => {
    if (line.y <= block.headerY + 3 || line.y > block.headerY + 140) return [];
    const item = trendItem(line, block);
    return item ? [item] : [];
  }));
  return { v: 1, type: "trend", items };
}
