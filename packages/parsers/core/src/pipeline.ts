import type {
  DetectResult,
  ExtractResult,
  PageSetOptions,
  ParserIssue,
  ParserPipelineResult,
  ParserSchema,
  PdfTextDocument,
  ValidateResult,
} from "./types.ts";

function issue(
  code: string,
  severity: ParserIssue["severity"],
  message: string,
  pageNumber: number | null = null,
  field: string | null = null,
): ParserIssue {
  return { code, severity, message, pageNumber, field };
}

export function validatePageSet(input: PdfTextDocument, options: PageSetOptions): readonly ParserIssue[] {
  const issues: ParserIssue[] = [];
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1) {
    issues.push(issue("PAGE_COUNT_INVALID", "FATAL", "pageCount must be a positive integer"));
    return issues;
  }
  if (input.pageCount !== options.expectedPageCount || input.pages.length !== options.expectedPageCount) {
    issues.push(issue("PAGE_COUNT_MISMATCH", "FATAL", `expected exactly ${options.expectedPageCount} pages`));
  }
  const seen = new Set<number>();
  for (const page of input.pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > input.pageCount) {
      issues.push(issue("PAGE_NUMBER_INVALID", "FATAL", "page number is outside the document", page.pageNumber));
    }
    if (seen.has(page.pageNumber)) issues.push(issue("DUPLICATE_PAGE", "FATAL", "duplicate page number", page.pageNumber));
    seen.add(page.pageNumber);
    if (options.requireTextLayer !== false && page.text.trim().length === 0) {
      issues.push(issue("NO_TEXT_LAYER", "FATAL", "page has no extractable text layer", page.pageNumber));
    }
  }
  for (let pageNumber = 1; pageNumber <= input.pageCount; pageNumber += 1) {
    if (!seen.has(pageNumber)) issues.push(issue("MISSING_PAGE", "FATAL", "required page is missing", pageNumber));
  }
  return issues;
}

function rejectedDetection(message: string, issues: readonly ParserIssue[] = []): DetectResult {
  return { status: "NO_MATCH", schemaVersionId: null, confidence: 0, evidence: [], issues: [issue("DETECT_REJECTED", "FATAL", message), ...issues] };
}

function failedExtraction(schemaVersionId: ExtractResult["schemaVersionId"], error: unknown): ExtractResult {
  return {
    status: "FAILED",
    schemaVersionId,
    fields: [],
    payloads: [],
    evidence: [],
    issues: [issue("EXTRACT_EXCEPTION", "FATAL", error instanceof Error ? error.message : "extract failed")],
  };
}

export function runParserPipeline(
  input: PdfTextDocument,
  schema: ParserSchema,
  context: { readonly parserVersion: string; readonly normalizationVersion: string },
): ParserPipelineResult {
  let detection: DetectResult;
  try {
    detection = schema.detect(input);
  } catch (error) {
    detection = rejectedDetection(error instanceof Error ? error.message : "detect failed");
  }
  if (detection.status !== "MATCH" || detection.schemaVersionId !== schema.schemaVersionId) {
    return { status: "REJECTED", detection, extraction: null, validation: null, normalization: null };
  }

  let extraction: ExtractResult;
  try {
    extraction = schema.extract(input, detection);
  } catch (error) {
    extraction = failedExtraction(schema.schemaVersionId, error);
  }
  if (extraction.status !== "EXTRACTED") {
    return { status: "REJECTED", detection, extraction, validation: null, normalization: null };
  }

  let validation: ValidateResult;
  try {
    validation = schema.validate(input, extraction);
  } catch (error) {
    validation = { status: "INVALID", issues: [issue("VALIDATE_EXCEPTION", "FATAL", error instanceof Error ? error.message : "validate failed")] };
  }
  if (validation.status === "INVALID") {
    return { status: "REJECTED", detection, extraction, validation, normalization: null };
  }

  let normalization;
  try {
    normalization = schema.normalize(input, extraction, validation, context);
  } catch (error) {
    normalization = {
      status: "REJECTED" as const,
      fields: [],
      subjectScores: [],
      report: null,
      payloads: [],
      issues: [issue("NORMALIZE_EXCEPTION", "FATAL", error instanceof Error ? error.message : "normalize failed")],
    };
  }
  const status = normalization.status === "READY" && validation.status === "VALID"
    ? "READY"
    : normalization.status === "REJECTED"
      ? "REJECTED"
      : "REVIEW";
  return { status, detection, extraction, validation, normalization };
}
