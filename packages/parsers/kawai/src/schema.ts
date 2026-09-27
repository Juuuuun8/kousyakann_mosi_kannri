import type { RawLabelsPayload, SchemaVersionId } from "../../../contracts/src/types.ts";
import {
  type DetectResult,
  type ExtractResult,
  type ExtractedField,
  type NormalizeResult,
  type ParserSchema,
  type PdfTextDocument,
  type ValidateResult,
  validatePageSet,
} from "../../core/src/index.ts";

export const KAWAI_SCHEMA_VERSION_ID = "kawai.ct.2026.round-2.v1" as SchemaVersionId;
export const KAWAI_PROVIDER_LABEL = "河合塾";
export const KAWAI_EXAM_FAMILY_LABEL = "全統共通テスト模試";
export const KAWAI_REPORT_LABEL = "成績表";

const REQUIRED_MARKERS = [
  { key: "provider", label: "provider", marker: KAWAI_PROVIDER_LABEL },
  { key: "exam_family", label: "exam_family", marker: KAWAI_EXAM_FAMILY_LABEL },
  { key: "report_type", label: "report_type", marker: KAWAI_REPORT_LABEL },
] as const;

function issue(code: string, severity: "INFO" | "WARNING" | "ERROR" | "FATAL", message: string, pageNumber: number | null = null, field: string | null = null) {
  return { code, severity, message, pageNumber, field } as const;
}

function markerPage(input: PdfTextDocument, marker: string): number | null {
  return input.pages.find((page) => page.text.includes(marker))?.pageNumber ?? null;
}

export function detectKawai(input: PdfTextDocument): DetectResult {
  const pageIssues = validatePageSet(input, { expectedPageCount: 4 });
  if (pageIssues.some((item) => item.severity === "FATAL")) {
    return { status: "NO_MATCH", schemaVersionId: null, confidence: 0, evidence: [], issues: pageIssues };
  }
  const evidence = REQUIRED_MARKERS.flatMap((required) => {
    const pageNumber = markerPage(input, required.marker);
    return pageNumber === null
      ? []
      : [{ code: "KAWAI_MARKER", pageNumber, label: required.label, value: required.marker }];
  });
  const missing = REQUIRED_MARKERS.filter((required) => markerPage(input, required.marker) === null);
  if (missing.length > 0) {
    return {
      status: "NO_MATCH",
      schemaVersionId: null,
      confidence: evidence.length / REQUIRED_MARKERS.length,
      evidence,
      issues: missing.map((required) => issue("KAWAI_MARKER_MISSING", "FATAL", `required marker is missing: ${required.label}`, null, required.key)),
    };
  }
  return { status: "MATCH", schemaVersionId: KAWAI_SCHEMA_VERSION_ID, confidence: 1, evidence, issues: [] };
}

export function extractKawai(input: PdfTextDocument, detection: DetectResult): ExtractResult {
  if (detection.status !== "MATCH" || detection.schemaVersionId !== KAWAI_SCHEMA_VERSION_ID) {
    return {
      status: "FAILED",
      schemaVersionId: KAWAI_SCHEMA_VERSION_ID,
      fields: [],
      payloads: [],
      evidence: [],
      issues: [issue("EXTRACT_WITHOUT_MATCH", "FATAL", "Kawai schema must be matched before extraction")],
    };
  }
  const fields: ExtractedField[] = REQUIRED_MARKERS.map((required) => ({
    key: required.key,
    rawValue: required.marker,
    pageNumber: markerPage(input, required.marker),
    sourceLabel: required.label,
  }));
  fields.push({ key: "page_count", rawValue: String(input.pageCount), pageNumber: null, sourceLabel: "page_count" });
  const payload: RawLabelsPayload = {
    v: 1,
    type: "raw_labels",
    items: [...input.pages].sort((left, right) => left.pageNumber - right.pageNumber).map((page) => ({
      field: "page_text",
      page: page.pageNumber,
      labelRaw: "page_text",
      valueRaw: page.text,
    })),
  };
  return { status: "EXTRACTED", schemaVersionId: KAWAI_SCHEMA_VERSION_ID, fields, payloads: [payload], evidence: detection.evidence, issues: [] };
}

export function validateKawai(input: PdfTextDocument, extraction: ExtractResult): ValidateResult {
  const issues = [...validatePageSet(input, { expectedPageCount: 4 })];
  for (const required of REQUIRED_MARKERS) {
    const field = extraction.fields.find((candidate) => candidate.key === required.key);
    if (!field || field.rawValue !== required.marker) issues.push(issue("KAWAI_FIELD_INVALID", "FATAL", `required field is invalid: ${required.key}`, field?.pageNumber ?? null, required.key));
  }
  if (extraction.payloads.length !== 1) issues.push(issue("KAWAI_PAYLOAD_COUNT", "FATAL", "raw label payload is missing"));
  return issues.some((item) => item.severity === "FATAL") ? { status: "INVALID", issues } : { status: "VALID", issues };
}

export function normalizeKawai(
  _input: PdfTextDocument,
  extraction: ExtractResult,
  validation: ValidateResult,
  _context: { readonly parserVersion: string; readonly normalizationVersion: string },
): NormalizeResult {
  const fields = extraction.fields.map((field) => ({
    key: field.key,
    rawValue: field.rawValue,
    normalizedValue: field.key === "page_count" && field.rawValue !== null ? Number(field.rawValue) : field.rawValue,
    pageNumber: field.pageNumber,
    missingReason: null,
  }));
  if (validation.status === "INVALID") {
    return { status: "REJECTED", fields, subjectScores: [], report: null, payloads: [], issues: validation.issues };
  }
  return { status: "READY", fields, subjectScores: [], report: null, payloads: extraction.payloads, issues: validation.issues };
}

export function createKawaiSchema(): ParserSchema {
  return {
    schemaVersionId: KAWAI_SCHEMA_VERSION_ID,
    detect: detectKawai,
    extract: extractKawai,
    validate: validateKawai,
    normalize: normalizeKawai,
  };
}
