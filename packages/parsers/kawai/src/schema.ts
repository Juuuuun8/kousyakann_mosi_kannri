import type {
  AbilityLevel,
  ExamEventId,
  MetricDefinitionId,
  RawLabelsPayload,
  SchemaVersionId,
} from "../../../contracts/src/types.ts";
import {
  type DetectResult,
  type ExtractResult,
  type ExtractedField,
  type NormalizeResult,
  type ParserIssue,
  type ParserSchema,
  type PdfPageText,
  type PdfTextDocument,
  type ValidateResult,
  validatePageSet,
} from "../../core/src/index.ts";
import { normalizeCompact, pageByOrdinal, pageOrdinal } from "./layout.ts";
import { headerField, pageOneHasRequiredAnchors, parseHeader, parseSubjectScores } from "./page1.ts";
import { domainItemCount, parseDomainPayloads } from "./page2.ts";

export const KAWAI_SCHEMA_VERSION_ID = "kawai.ct.2026.round-2.v1" as SchemaVersionId;
export const KAWAI_EXAM_EVENT_ID = "kawai.ct.2026.round-2" as ExamEventId;
export const KAWAI_PROVIDER_LABEL = "河合塾";
export const KAWAI_EXAM_FAMILY_LABEL = "全統共通テスト模試";
export const KAWAI_REPORT_LABEL = "個人成績表";

const PAGE_ANCHORS = new Map([
  [1, ["1-(1)成績概況", "2.成績推移"]],
  [2, ["3.設問別成績"]],
  [3, ["4.志望校別成績・評価"]],
  [4, ["5.正答・誤答マーク読み取り状況"]],
] as const);

const REQUIRED_MARKERS = [
  { key: "exam_family", label: "exam_family", marker: KAWAI_EXAM_FAMILY_LABEL },
  { key: "report_type", label: "report_type", marker: KAWAI_REPORT_LABEL },
] as const;

function issue(code: string, severity: ParserIssue["severity"], message: string, pageNumber: number | null = null, field: string | null = null): ParserIssue {
  return { code, severity, message, pageNumber, field };
}

function markerPage(input: PdfTextDocument, marker: string): number | null {
  const compactMarker = normalizeCompact(marker);
  return input.pages.find((page) => normalizeCompact(page.text).includes(compactMarker))?.pageNumber ?? null;
}

function pageRoleIssues(input: PdfTextDocument): ParserIssue[] {
  const issues: ParserIssue[] = [];
  const seen = new Map<number, number[]>();
  for (const page of input.pages) {
    const ordinal = pageOrdinal(page.text);
    if (ordinal === null) {
      issues.push(issue("KAWAI_PAGE_ORDINAL_MISSING", "FATAL", "personal report page ordinal is missing", page.pageNumber, "page_ordinal"));
      continue;
    }
    seen.set(ordinal, [...(seen.get(ordinal) ?? []), page.pageNumber]);
    const compact = normalizeCompact(page.text);
    const anchors = PAGE_ANCHORS.get(ordinal) ?? [];
    for (const anchor of anchors) {
      if (!compact.includes(normalizeCompact(anchor))) issues.push(issue("KAWAI_PAGE_ANCHOR_MISSING", "FATAL", `required section anchor is missing for logical page ${ordinal}`, page.pageNumber, anchor));
    }
  }
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const pages = seen.get(ordinal) ?? [];
    if (pages.length === 0) issues.push(issue("KAWAI_LOGICAL_PAGE_MISSING", "FATAL", `logical page ${ordinal}/4 is missing`, null, "page_ordinal"));
    if (pages.length > 1) issues.push(issue("KAWAI_LOGICAL_PAGE_DUPLICATE", "FATAL", `logical page ${ordinal}/4 is duplicated`, pages[1], "page_ordinal"));
  }
  return issues;
}

function identityIssues(input: PdfTextDocument): ParserIssue[] {
  const issues: ParserIssue[] = [];
  const identities = input.pages.map((page) => ({ page, candidate: parseHeader(page).examCandidateId }));
  for (const identity of identities) {
    if (identity.candidate === null) issues.push(issue("KAWAI_IDENTITY_MISSING", "FATAL", "exam candidate ID is missing from page header", identity.page.pageNumber, "exam_candidate_id"));
  }
  const distinct = new Set(identities.map((identity) => identity.candidate).filter((value): value is string => value !== null));
  if (distinct.size > 1) issues.push(issue("KAWAI_MIXED_REPORT_IDENTITY", "FATAL", "pages from different candidates must not be combined", null, "exam_candidate_id"));
  return issues;
}

export function detectKawai(input: PdfTextDocument): DetectResult {
  const issues = [...validatePageSet(input, { expectedPageCount: 4 }), ...pageRoleIssues(input)];
  const evidence = REQUIRED_MARKERS.flatMap((required) => {
    const pageNumber = markerPage(input, required.marker);
    return pageNumber === null ? [] : [{ code: "KAWAI_MARKER", pageNumber, label: required.label, value: required.marker }];
  });
  const providerPage = markerPage(input, KAWAI_PROVIDER_LABEL);
  if (providerPage !== null) evidence.push({ code: "KAWAI_VISUAL_PROVIDER_MARKER", pageNumber: providerPage, label: "provider", value: KAWAI_PROVIDER_LABEL });
  const missing = REQUIRED_MARKERS.filter((required) => markerPage(input, required.marker) === null);
  issues.push(...missing.map((required) => issue("KAWAI_MARKER_MISSING", "FATAL", `required marker is missing: ${required.label}`, null, required.key)));
  if (issues.some((item) => item.severity === "FATAL")) {
    return { status: "NO_MATCH", schemaVersionId: null, confidence: evidence.length / REQUIRED_MARKERS.length, evidence, issues };
  }
  return { status: "MATCH", schemaVersionId: KAWAI_SCHEMA_VERSION_ID, confidence: 1, evidence, issues: [] };
}

function orderedPages(input: PdfTextDocument): PdfPageText[] {
  return [1, 2, 3, 4].map((ordinal) => pageByOrdinal(input, ordinal)).filter((page): page is PdfPageText => page !== null);
}

export function extractKawai(input: PdfTextDocument, detection: DetectResult): ExtractResult {
  if (detection.status !== "MATCH" || detection.schemaVersionId !== KAWAI_SCHEMA_VERSION_ID) {
    return { status: "FAILED", schemaVersionId: KAWAI_SCHEMA_VERSION_ID, fields: [], payloads: [], evidence: [], issues: [issue("EXTRACT_WITHOUT_MATCH", "FATAL", "Kawai schema must be matched before extraction")] };
  }
  const pages = orderedPages(input);
  const firstPage = pages[0];
  const fields: ExtractedField[] = REQUIRED_MARKERS.map((required) => ({ key: required.key, rawValue: required.marker, pageNumber: markerPage(input, required.marker), sourceLabel: required.label }));
  fields.push({ key: "provider", rawValue: KAWAI_PROVIDER_LABEL, pageNumber: markerPage(input, KAWAI_PROVIDER_LABEL), sourceLabel: markerPage(input, KAWAI_PROVIDER_LABEL) === null ? "schema_inference" : "provider" });
  fields.push({ key: "page_count", rawValue: String(input.pageCount), pageNumber: null, sourceLabel: "page_count" });
  if (firstPage) fields.push(...parseHeader(firstPage).fields);
  for (const page of pages) {
    fields.push({ key: `page_role.${pageOrdinal(page.text)}`, rawValue: String(page.pageNumber), pageNumber: page.pageNumber, sourceLabel: "logical_page" });
    const candidate = parseHeader(page).examCandidateId;
    fields.push({ key: `exam_candidate_id.p${pageOrdinal(page.text)}`, rawValue: candidate, pageNumber: page.pageNumber, sourceLabel: "受験番号" });
  }
  const subjectScores = firstPage ? parseSubjectScores(firstPage) : [];
  fields.push({ key: "subject_score_count", rawValue: String(subjectScores.length), pageNumber: firstPage?.pageNumber ?? null, sourceLabel: "科目成績件数" });
  const secondPage = pages[1];
  const domainPayloads = secondPage ? parseDomainPayloads(secondPage) : [];
  fields.push({ key: "domain_item_count", rawValue: String(domainItemCount(domainPayloads)), pageNumber: secondPage?.pageNumber ?? null, sourceLabel: "分野別成績件数" });
  const payload: RawLabelsPayload = {
    v: 1,
    type: "raw_labels",
    items: pages.map((page) => ({ field: "page_text_transitional", page: pageOrdinal(page.text) ?? page.pageNumber, labelRaw: "page_text", valueRaw: page.text })),
  };
  return {
    status: "EXTRACTED",
    schemaVersionId: KAWAI_SCHEMA_VERSION_ID,
    fields,
    payloads: [payload, ...domainPayloads],
    evidence: detection.evidence,
    issues: [issue("KAWAI_PARTIAL_EXTRACTION", "WARNING", "page 1 trend/conversion, page 2 commentary, page 3 target, and page 4 answer details remain transitional raw payloads")],
  };
}

export function validateKawai(input: PdfTextDocument, extraction: ExtractResult): ValidateResult {
  const issues = [...validatePageSet(input, { expectedPageCount: 4 }), ...pageRoleIssues(input), ...identityIssues(input), ...extraction.issues];
  for (const required of REQUIRED_MARKERS) {
    const field = extraction.fields.find((candidate) => candidate.key === required.key);
    if (!field || field.rawValue !== required.marker) issues.push(issue("KAWAI_FIELD_INVALID", "FATAL", `required field is invalid: ${required.key}`, field?.pageNumber ?? null, required.key));
  }
  const firstPage = pageByOrdinal(input, 1);
  if (!firstPage || !pageOneHasRequiredAnchors(firstPage)) issues.push(issue("KAWAI_PAGE1_STRUCTURE", "FATAL", "page 1 required score sections are missing", firstPage?.pageNumber ?? null, "page1"));
  const scores = firstPage ? parseSubjectScores(firstPage) : [];
  if (scores.length === 0) issues.push(issue("KAWAI_SUBJECT_SCORES_MISSING", "FATAL", "no subject summary rows were extracted", firstPage?.pageNumber ?? null, "subject_scores"));
  if (scores.some((score) => score.subjectDefinitionId === null)) issues.push(issue("KAWAI_UNKNOWN_SUBJECT", "WARNING", "one or more subject labels are not in the normalization map", firstPage?.pageNumber ?? null, "subject_scores"));
  const domainPayloads = extraction.payloads.filter((payload) => payload.type === "domain_results");
  if (domainItemCount(domainPayloads) === 0) issues.push(issue("KAWAI_DOMAIN_RESULTS_MISSING", "FATAL", "no page 2 domain rows were extracted", pageByOrdinal(input, 2)?.pageNumber ?? null, "domain_results"));
  if (!extraction.payloads.some((payload) => payload.type === "raw_labels")) issues.push(issue("KAWAI_PAYLOAD_COUNT", "FATAL", "transitional raw label payload is missing"));
  if (issues.some((item) => item.severity === "FATAL")) return { status: "INVALID", issues };
  return issues.some((item) => item.severity === "WARNING" || item.severity === "ERROR") ? { status: "REVIEW", issues } : { status: "VALID", issues };
}

export function normalizeKawai(
  input: PdfTextDocument,
  extraction: ExtractResult,
  validation: ValidateResult,
  context: { readonly parserVersion: string; readonly normalizationVersion: string },
): NormalizeResult {
  const fields = extraction.fields.map((field) => ({
    key: field.key,
    rawValue: field.rawValue,
    normalizedValue: ["page_count", "subject_score_count", "domain_item_count"].includes(field.key) && field.rawValue !== null ? Number(field.rawValue) : field.rawValue,
    pageNumber: field.pageNumber,
    missingReason: field.rawValue === null ? "UNREADABLE" : null,
  }));
  if (validation.status === "INVALID") return { status: "REJECTED", fields, subjectScores: [], report: null, payloads: [], issues: validation.issues };
  const firstPage = pageByOrdinal(input, 1);
  const scores = firstPage ? parseSubjectScores(firstPage) : [];
  const subjectScores = scores.map((score) => ({
    ...(score.subjectDefinitionId === null ? {} : { subjectDefinitionId: score.subjectDefinitionId }),
    metricDefinitionId: "metric.subject.summary" as MetricDefinitionId,
    score: score.score,
    maxScore: score.maxScore,
    scoreRate: score.score === null || score.maxScore === null || score.maxScore === 0 ? null : score.score / score.maxScore,
    deviation: score.deviation,
    abilityLevel: score.abilityLevel as AbilityLevel | null,
    nationalAverage: score.nationalAverage,
    nationalRank: score.nationalRank,
    nationalPopulation: score.nationalPopulation,
    currentStudentAverage: score.currentStudentAverage,
    graduateAverage: score.graduateAverage,
    currentRank: score.currentRank,
    currentPopulation: score.currentPopulation,
    schoolDeviation: score.schoolDeviation,
    schoolAverage: score.schoolAverage,
    schoolRank: score.schoolRank,
    schoolPopulation: score.schoolPopulation,
    missingReason: score.missingReason,
    sourceLabelRaw: score.subjectRaw,
    schemaVersionId: KAWAI_SCHEMA_VERSION_ID,
    parserVersion: context.parserVersion,
    normalizationVersion: context.normalizationVersion,
  }));
  const report = {
    examEventId: KAWAI_EXAM_EVENT_ID,
    examCandidateId: headerField(extraction.fields, "exam_candidate_id"),
    schoolCodeRaw: headerField(extraction.fields, "school_code_raw"),
    schoolNameRaw: headerField(extraction.fields, "school_name_raw"),
    gradeRaw: headerField(extraction.fields, "grade_raw"),
    classRaw: headerField(extraction.fields, "class_raw"),
    localNumberRaw: headerField(extraction.fields, "local_number_raw"),
    studentNameKanaRaw: headerField(extraction.fields, "student_name_kana_raw"),
    schemaVersionId: KAWAI_SCHEMA_VERSION_ID,
    parserVersion: context.parserVersion,
    normalizationVersion: context.normalizationVersion,
    pageCount: input.pageCount,
    subjectCount: subjectScores.length,
    payloadCount: extraction.payloads.length,
  };
  return {
    status: validation.status === "VALID" ? "READY" : "REVIEW",
    fields,
    subjectScores,
    report,
    payloads: extraction.payloads,
    issues: validation.issues,
  };
}

export function createKawaiSchema(): ParserSchema {
  return { schemaVersionId: KAWAI_SCHEMA_VERSION_ID, detect: detectKawai, extract: extractKawai, validate: validateKawai, normalize: normalizeKawai };
}
