import type {
  PayloadJson,
  ReportRecord,
  SchemaVersionId,
  SubjectScoreRecord,
} from "../../../contracts/src/types.ts";

export interface PdfTextItem {
  readonly text: string;
  readonly x: number | null;
  readonly y: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PdfPageText {
  readonly pageNumber: number;
  readonly text: string;
  readonly items: readonly PdfTextItem[];
}

export interface PdfTextDocument {
  readonly pageCount: number;
  readonly pages: readonly PdfPageText[];
}

export type ParserIssueSeverity = "INFO" | "WARNING" | "ERROR" | "FATAL";

export interface ParserIssue {
  readonly code: string;
  readonly severity: ParserIssueSeverity;
  readonly message: string;
  readonly pageNumber: number | null;
  readonly field: string | null;
}

export interface ParserEvidence {
  readonly code: string;
  readonly pageNumber: number | null;
  readonly label: string | null;
  readonly value: string | null;
}

export type DetectStatus = "MATCH" | "NO_MATCH" | "AMBIGUOUS";

export interface DetectResult {
  readonly status: DetectStatus;
  readonly schemaVersionId: SchemaVersionId | null;
  readonly confidence: number;
  readonly evidence: readonly ParserEvidence[];
  readonly issues: readonly ParserIssue[];
}

export interface ExtractedField {
  readonly key: string;
  readonly rawValue: string | null;
  readonly pageNumber: number | null;
  readonly sourceLabel: string | null;
}

export interface ExtractResult {
  readonly status: "EXTRACTED" | "FAILED";
  readonly schemaVersionId: SchemaVersionId;
  readonly fields: readonly ExtractedField[];
  readonly payloads: readonly PayloadJson[];
  readonly evidence: readonly ParserEvidence[];
  readonly issues: readonly ParserIssue[];
}

export interface ValidateResult {
  readonly status: "VALID" | "REVIEW" | "INVALID";
  readonly issues: readonly ParserIssue[];
}

export interface NormalizedField {
  readonly key: string;
  readonly rawValue: string | null;
  readonly normalizedValue: string | number | null;
  readonly pageNumber: number | null;
  readonly missingReason: string | null;
}

export interface NormalizeResult {
  readonly status: "READY" | "REVIEW" | "REJECTED";
  readonly fields: readonly NormalizedField[];
  readonly subjectScores: readonly Partial<SubjectScoreRecord>[];
  readonly report: Partial<ReportRecord> | null;
  readonly payloads: readonly PayloadJson[];
  readonly issues: readonly ParserIssue[];
}

export interface ParserContext {
  readonly parserVersion: string;
  readonly normalizationVersion: string;
}

export interface ParserSchema {
  readonly schemaVersionId: SchemaVersionId;
  detect(input: PdfTextDocument): DetectResult;
  extract(input: PdfTextDocument, detection: DetectResult): ExtractResult;
  validate(input: PdfTextDocument, extraction: ExtractResult): ValidateResult;
  normalize(
    input: PdfTextDocument,
    extraction: ExtractResult,
    validation: ValidateResult,
    context: ParserContext,
  ): NormalizeResult;
}

export interface ParserPipelineResult {
  readonly status: "READY" | "REVIEW" | "REJECTED";
  readonly detection: DetectResult;
  readonly extraction: ExtractResult | null;
  readonly validation: ValidateResult | null;
  readonly normalization: NormalizeResult | null;
}

export interface PageSetOptions {
  readonly expectedPageCount: number;
  readonly requireTextLayer?: boolean;
}
