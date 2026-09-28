import type { PdfTextItem, PdfTextDocument } from "../../core/src/index.ts";

export interface LayoutWord {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  readonly centerX: number;
  readonly y: number;
}

export interface LayoutLine {
  readonly y: number;
  readonly words: readonly LayoutWord[];
}

const FULL_WIDTH = "０１２３４５６７８９ＳＡＢＣＤＥＦＧＨＮＷ＊（）／";
const HALF_WIDTH = "0123456789SABCDEFGHNW*()/";

export function normalizeWidth(value: string): string {
  return [...value].map((character) => {
    const index = FULL_WIDTH.indexOf(character);
    return index >= 0 ? HALF_WIDTH[index] : character;
  }).join("");
}

export function normalizeCompact(value: string): string {
  return normalizeWidth(value).normalize("NFC").replace(/[\s\u3000]/gu, "");
}

export function numberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeWidth(value).replace("点", "").trim();
  if (normalized === "" || /^-+$/u.test(normalized) || normalized === "/") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteOr(value: number | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function itemWord(item: PdfTextItem): LayoutWord | null {
  const text = item.text.trim().normalize("NFC");
  if (text.length === 0) return null;
  const x0 = finiteOr(item.x, 0);
  const width = Math.max(0, finiteOr(item.width, text.length));
  const y = finiteOr(item.y, 0);
  return { text, x0, x1: x0 + width, centerX: x0 + width / 2, y };
}

export function toLayoutLines(items: readonly PdfTextItem[], yTolerance = 1.5, gapTolerance = 1.2): readonly LayoutLine[] {
  const sorted = items.map(itemWord).filter((item): item is LayoutWord => item !== null)
    .sort((left, right) => left.y - right.y || left.x0 - right.x0);
  const buckets: Array<{ y: number; words: LayoutWord[] }> = [];
  for (const word of sorted) {
    let bucket: { y: number; words: LayoutWord[] } | undefined;
    for (let index = buckets.length - 1; index >= 0 && index >= buckets.length - 3; index -= 1) {
      if (Math.abs(buckets[index].y - word.y) < yTolerance) {
        bucket = buckets[index];
        break;
      }
    }
    if (bucket) bucket.words.push(word);
    else buckets.push({ y: word.y, words: [word] });
  }
  return buckets.map((bucket) => {
    const words = [...bucket.words].sort((left, right) => left.x0 - right.x0);
    const merged: LayoutWord[] = [];
    for (const word of words) {
      const previous = merged.at(-1);
      if (previous && word.x0 - previous.x1 < gapTolerance) {
        const text = `${previous.text}${word.text}`.normalize("NFC");
        merged[merged.length - 1] = { text, x0: previous.x0, x1: word.x1, centerX: (previous.x0 + word.x1) / 2, y: previous.y };
      } else merged.push(word);
    }
    return { y: bucket.y, words: merged };
  }).filter((line) => line.words.length > 0).sort((left, right) => left.y - right.y);
}

export function allWords(lines: readonly LayoutLine[]): readonly LayoutWord[] {
  return lines.flatMap((line) => line.words);
}

export function pageOrdinal(text: string): number | null {
  const compact = normalizeCompact(text);
  const match = compact.match(/個人成績表\((\d)\/4\)/u);
  return match ? Number(match[1]) : null;
}

export function pageByOrdinal(input: PdfTextDocument, ordinal: number) {
  return input.pages.find((page) => pageOrdinal(page.text) === ordinal) ?? null;
}
