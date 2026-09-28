import { ML_EXPORT_COLUMNS, ML_EXPORT_SCHEMA_VERSION } from "./constants.ts";
import type { MlExportRow } from "./types.ts";
import { validateMlExportRows } from "./validation.ts";

const FORMULA_PREFIX_RE = /^[\t\r\n ]*[=+\-@]/;

/** Prefix formula-like text and quote every field before terminal download. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && FORMULA_PREFIX_RE.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function rowValues(row: MlExportRow): readonly unknown[] {
  return [row.exportSchemaVersion, row.mlId, row.examEventId, row.locationId, row.subjectDefinitionId,
    row.metricDefinitionId, row.score, row.maxScore, row.scoreRate, row.deviation, row.abilityLevel,
    row.missingReason, row.parserVersion, row.payloadFormatVersion, row.featureAsOf];
}

export interface SerializeMlCsvOptions { readonly includeUtf8Bom?: boolean; }

export function serializeMlCsv(rows: readonly MlExportRow[], options: SerializeMlCsvOptions = {}): string {
  const validation = validateMlExportRows(rows);
  if (!validation.ok) {
    const firstIssue = validation.issues[0];
    throw new Error(firstIssue ? `invalid ML export rows: ${firstIssue.path} ${firstIssue.message}` : "invalid ML export rows");
  }
  const lines = [ML_EXPORT_COLUMNS.map(csvCell).join(","), ...rows.map((row) => rowValues(row).map(csvCell).join(","))];
  const csv = `${lines.join("\r\n")}\r\n`;
  return options.includeUtf8Bom ? `\uFEFF${csv}` : csv;
}

export const mlExportSchemaVersion = ML_EXPORT_SCHEMA_VERSION;
