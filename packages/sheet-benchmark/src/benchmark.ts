import type { PayloadJson } from "../../contracts/src/types.ts";
import type { SyntheticDataset, SyntheticPayloadBinding } from "../../test-fixtures/src/generator.ts";
import { canonicalJson, chunkPayloadJson, roundTripPayloadJson } from "../../payload-codec/src/codec.ts";

export interface SheetMetrics {
  readonly sheetName: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly logicalCells: number;
  readonly nonEmptyCells: number;
  readonly textCharacters: number;
}

export interface LayoutMetrics {
  readonly format: "row" | "json";
  readonly sheets: readonly SheetMetrics[];
  readonly rowCount: number;
  readonly logicalCells: number;
  readonly nonEmptyCells: number;
  readonly textCharacters: number;
}

export interface SheetBenchmarkOptions {
  readonly jsonMaxChars?: number;
}

export interface SheetBenchmarkResult {
  readonly rowForm: LayoutMetrics;
  readonly jsonForm: LayoutMetrics;
  readonly payloadCount: number;
  readonly chunkCount: number;
  readonly roundTripValid: boolean;
  readonly logicalCellReductionRatio: number;
  readonly nonEmptyCellReductionRatio: number;
}

type SheetRows = { readonly name: string; readonly rows: readonly (readonly unknown[])[] };

function cellCharacterCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : serialized.length;
}

function isNonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valuesOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return Object.values(value);
  return [value];
}

function metricsForSheet(sheet: SheetRows): SheetMetrics {
  const rowCount = sheet.rows.length;
  const columnCount = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const logicalCells = rowCount * columnCount;
  const nonEmptyCells = sheet.rows.reduce<number>(
    (total, row) => total + row.reduce<number>((rowTotal, value) => rowTotal + (isNonEmpty(value) ? 1 : 0), 0),
    0,
  );
  const textCharacters = sheet.rows.reduce<number>(
    (total, row) => total + row.reduce<number>((rowTotal, value) => rowTotal + cellCharacterCount(value), 0),
    0,
  );
  return { sheetName: sheet.name, rowCount, columnCount, logicalCells, nonEmptyCells, textCharacters };
}

function summarize(format: "row" | "json", sheets: readonly SheetRows[]): LayoutMetrics {
  const metrics = sheets.map(metricsForSheet);
  return {
    format,
    sheets: metrics,
    rowCount: metrics.reduce((total, sheet) => total + sheet.rowCount, 0),
    logicalCells: metrics.reduce((total, sheet) => total + sheet.logicalCells, 0),
    nonEmptyCells: metrics.reduce((total, sheet) => total + sheet.nonEmptyCells, 0),
    textCharacters: metrics.reduce((total, sheet) => total + sheet.textCharacters, 0),
  };
}

function commonRows(dataset: SyntheticDataset): readonly SheetRows[] {
  return [
    {
      name: "reports",
      rows: dataset.reports.map((report) => Object.values(report)),
    },
    {
      name: "subject_scores",
      rows: dataset.subjectScores.map((score) => Object.values(score)),
    },
  ];
}

function rowPayloadItemRows(binding: SyntheticPayloadBinding): readonly (readonly unknown[])[] {
  return binding.payload.items.map((item, itemIndex) => [
    binding.reportId,
    binding.subjectDefinitionId,
    binding.payload.type,
    binding.payload.v,
    itemIndex,
    ...valuesOf(item),
  ]);
}

function rowLayout(dataset: SyntheticDataset): LayoutMetrics {
  const payloadRows = dataset.payloadBindings.flatMap(rowPayloadItemRows);
  return summarize("row", [
    ...commonRows(dataset),
    { name: "payload_items", rows: payloadRows },
  ]);
}

function jsonLayout(dataset: SyntheticDataset, jsonMaxChars: number): {
  readonly metrics: LayoutMetrics;
  readonly chunkCount: number;
  readonly roundTripValid: boolean;
} {
  const payloadRows: (readonly unknown[])[] = [];
  let chunkCount = 0;
  let roundTripValid = true;
  for (const binding of dataset.payloadBindings) {
    const chunks = chunkPayloadJson(binding.payload, jsonMaxChars);
    chunkCount += chunks.length;
    roundTripValid = roundTripValid && canonicalJson(roundTripPayloadJson(binding.payload, jsonMaxChars)) === canonicalJson(binding.payload);
    for (const chunk of chunks) {
      payloadRows.push([
        binding.reportId,
        binding.subjectDefinitionId,
        binding.payload.type,
        binding.payload.v,
        chunk.chunkIndex,
        chunk.chunkCount,
        chunk.itemCount,
        chunk.jsonText,
      ]);
    }
  }
  return {
    metrics: summarize("json", [
      ...commonRows(dataset),
      { name: "payload_chunks", rows: payloadRows },
    ]),
    chunkCount,
    roundTripValid,
  };
}

export function benchmarkSyntheticDataset(
  dataset: SyntheticDataset,
  options: SheetBenchmarkOptions = {},
): SheetBenchmarkResult {
  const jsonMaxChars = options.jsonMaxChars ?? 40000;
  if (!Number.isInteger(jsonMaxChars) || jsonMaxChars <= 0) throw new Error("jsonMaxChars must be a positive integer");
  const rowForm = rowLayout(dataset);
  const json = jsonLayout(dataset, jsonMaxChars);
  return {
    rowForm,
    jsonForm: json.metrics,
    payloadCount: dataset.payloadBindings.length,
    chunkCount: json.chunkCount,
    roundTripValid: json.roundTripValid,
    logicalCellReductionRatio: rowForm.logicalCells === 0 ? 0 : 1 - json.metrics.logicalCells / rowForm.logicalCells,
    nonEmptyCellReductionRatio: rowForm.nonEmptyCells === 0 ? 0 : 1 - json.metrics.nonEmptyCells / rowForm.nonEmptyCells,
  };
}

export function payloadItemCount(payload: PayloadJson): number {
  return payload.items.length;
}
