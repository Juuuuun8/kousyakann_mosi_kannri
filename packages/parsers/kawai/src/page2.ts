import type { DomainPayload, DomainResultItem, MissingReason } from "../../../contracts/src/types.ts";
import type { PdfPageText } from "../../core/src/index.ts";
import type { LayoutLine, LayoutWord } from "./layout.ts";
import { normalizeCompact, normalizeWidth, numberOrNull, toLayoutLines } from "./layout.ts";

const ROW_PATTERN = /^(\d+)\/(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([○〇▲]\s*)?(-?[\d.]+)%\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)/u;
const GROUP_LABELS = new Set(["理科", "地歴・公民", "数学①", "数学②", "情報"]);
const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/u;

interface SubjectBlock {
  readonly side: 0 | 1;
  readonly subject: string;
  readonly startY: number;
  readonly endY: number;
}

interface SubjectHeading {
  readonly subject: string | null;
}

function sideBounds(side: 0 | 1, splitX: number, pageRight: number): { start: number; width: number } {
  return side === 0 ? { start: 0, width: splitX } : { start: splitX, width: pageRight - splitX };
}

function wordsOnSide(line: LayoutLine, side: 0 | 1, splitX: number): readonly LayoutWord[] {
  return line.words.filter((word) => side === 0 ? word.centerX < splitX : word.centerX >= splitX);
}

function subjectHeading(words: readonly LayoutWord[]): SubjectHeading | null {
  const headingIndex = words.findIndex((word) => normalizeCompact(word.text).startsWith("あなたと同じ学力"));
  if (headingIndex < 0) return null;
  const labels = words.slice(0, headingIndex).map((word) => normalizeCompact(word.text)).filter((label) => label.length > 0 && !GROUP_LABELS.has(label));
  return { subject: labels.length > 0 ? labels.join("") : null };
}

function subjectBlocks(lines: readonly LayoutLine[], splitX: number): readonly SubjectBlock[] {
  const blocks: SubjectBlock[] = [];
  for (const side of [0, 1] as const) {
    const starts = lines.flatMap((line) => {
      const heading = subjectHeading(wordsOnSide(line, side, splitX));
      return heading === null ? [] : [{ subject: heading.subject, startY: line.y }];
    });
    starts.forEach((start, index) => {
      if (start.subject === null) return;
      blocks.push({
        side,
        subject: start.subject,
        startY: start.startY,
        endY: starts[index + 1]?.startY ?? Number.POSITIVE_INFINITY,
      });
    });
  }
  return blocks;
}

function commentaryForBlock(block: SubjectBlock, lines: readonly LayoutLine[], splitX: number, pageRight: number): string | null {
  const bounds = sideBounds(block.side, splitX, pageRight);
  const parts = lines.flatMap((line) => {
    // The subject commentary begins below the radar legend and level label.
    if (line.y <= block.startY + 46 || line.y >= block.endY) return [];
    const text = wordsOnSide(line, block.side, splitX)
      .filter((word) => {
        const relativeX = (word.centerX - bounds.start) / bounds.width;
        return relativeX >= 0.48 && relativeX <= 0.84;
      })
      .map((word) => word.text.trim())
      .join("")
      .trim();
    return text.length > 0 && JAPANESE.test(text) ? [text] : [];
  });
  return parts.length === 0 ? null : parts.join("\n");
}

function domainItem(questionNumberRaw: string, domainRaw: string, match: RegExpMatchArray): DomainResultItem {
  const mark = (match[7] ?? "").trim();
  const score = numberOrNull(match[1]);
  const maxScore = numberOrNull(match[2]);
  const missingReason: MissingReason | null = score === null ? "NOT_TAKEN" : null;
  return {
    questionNumberRaw: normalizeWidth(questionNumberRaw),
    domainRaw,
    domainId: null,
    score,
    maxScore,
    nationalAverage: numberOrNull(match[3]),
    schoolAverage: numberOrNull(match[4]),
    sameAbilityAverage: numberOrNull(match[5]),
    sameAbilityDifference: numberOrNull(match[6]),
    scoreRateDifference: numberOrNull(match[8]),
    evaluationCodeRaw: mark === "" ? null : mark,
    nextLevelAverage: numberOrNull(match[10]),
    nextLevelDifference: numberOrNull(match[11]),
    commentaryRaw: null,
    missingReason,
  };
}

export function parseDomainPayloads(page: PdfPageText): readonly DomainPayload[] {
  const lines = toLayoutLines(page.items);
  const pageRight = Math.max(...page.items.map((entry) => (entry.x ?? 0) + (entry.width ?? 0)), 1);
  // The printed center gutter is slightly right of half of the text extent.
  // Use a proportional gutter so right-edge metadata does not steal the final left-side difference cell.
  const splitX = pageRight * 0.51;
  const blocks = subjectBlocks(lines, splitX);
  const commentaries = new Map(blocks.map((block) => [block.subject, commentaryForBlock(block, lines, splitX, pageRight)]));
  const bySubject = new Map<string, DomainResultItem[]>();
  for (const side of [0, 1]) {
    const inSide = (centerX: number) => side === 0 ? centerX < splitX : centerX >= splitX;
    let subject: string | null = null;
    for (const line of lines) {
      const words = line.words.filter((word) => inSide(word.centerX));
      if (words.length === 0) continue;
      const heading = subjectHeading(words);
      if (heading !== null) {
        subject = heading.subject;
        continue;
      }
      if (subject === null || words.length < 4 || !/^\d{1,2}$/u.test(normalizeWidth(words[0]!.text)) || !/^\d+\/\d+$/u.test(normalizeWidth(words[2]!.text))) continue;
      const remainder = words.slice(2)
        .filter((word) => !(JAPANESE.test(word.text) && !word.text.includes("%")))
        .map((word) => normalizeWidth(word.text)).join(" ").replace(/-\s+(\d)/gu, "-$1");
      const match = remainder.match(ROW_PATTERN);
      if (!match) continue;
      const item = domainItem(words[0]!.text, words[1]!.text, match);
      const items = bySubject.get(subject) ?? [];
      items.push(item);
      bySubject.set(subject, items);
    }
  }
  return [...bySubject.entries()].map(([subject, items]) => ({
    v: 1,
    type: "domain_results",
    subject,
    commentaryRaw: commentaries.get(subject) ?? null,
    items,
  }));
}

export function domainItemCount(payloads: readonly DomainPayload[]): number {
  return payloads.reduce((sum, payload) => sum + payload.items.length, 0);
}
