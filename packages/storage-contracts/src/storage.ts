import type { PayloadRecord, ReportRecord } from "../../contracts/src/types.ts";
import { validateReportRecord, validateSubjectScoreRecord } from "../../contracts/src/validation.ts";
import { createPayloadRecords, verifyPayloadRecords } from "../../payload-codec/src/index.ts";
import type { DataFileEntry, DataFileSelection, PreparedRegistration, RegistrationInput, RegistrationOutcome, SheetWriteStep, StorageState } from "./types.ts";

function fail(message: string): never {
  throw new Error(message);
}

export async function prepareRegistration(input: RegistrationInput, maxPayloadChars = 40000): Promise<PreparedRegistration> {
  const reportValidation = validateReportRecord(input.report);
  if (!reportValidation.ok) fail("report violates the canonical contract");
  if (input.report.status !== "ACTIVE") fail("registration input must request an ACTIVE report");
  if (input.report.subjectCount !== input.subjectScores.length) fail("subjectCount does not match subject score rows");
  if (input.report.payloadCount !== input.payloads.length) fail("payloadCount does not match logical payloads");
  if (new Set(input.subjectScores.map((row) => row.recordId)).size !== input.subjectScores.length) fail("subject score record IDs must be unique");
  for (const row of input.subjectScores) {
    if (!validateSubjectScoreRecord(row).ok) fail("subject score violates the canonical contract");
    if (row.reportId !== input.report.reportId) fail("subject score belongs to another report");
    if (row.schemaVersionId !== input.report.schemaVersionId || row.parserVersion !== input.report.parserVersion || row.normalizationVersion !== input.report.normalizationVersion) fail("subject score version does not match its report");
  }
  if (new Set(input.payloads.map((item) => item.payloadId)).size !== input.payloads.length) fail("payload IDs must be unique");
  if (input.payloads.some((item) => item.payload.type === "raw_labels")) fail("full-page raw label payloads cannot be persisted");
  const payloadRecords: PayloadRecord[] = [];
  for (const item of input.payloads) {
    if (["answer_marks", "domain_results"].includes(item.payload.type) && item.subjectDefinitionId === null) fail("subject payload requires a normalized subjectDefinitionId");
    const records = await createPayloadRecords({
      payloadId: item.payloadId,
      reportId: input.report.reportId,
      subjectDefinitionId: item.subjectDefinitionId,
      payloadFormatVersion: item.payloadFormatVersion,
      payload: item.payload,
      createdAt: input.report.importedAt,
      maxChars: maxPayloadChars,
    });
    await verifyPayloadRecords(records);
    payloadRecords.push(...records);
  }
  return { report: { ...input.report }, subjectScores: input.subjectScores.map((row) => ({ ...row })), payloadRecords };
}

export function buildSheetWritePlan(prepared: PreparedRegistration): readonly SheetWriteStep[] {
  return [
    { order: 1, operation: "APPEND_PENDING_REPORT", rowCount: 1 },
    { order: 2, operation: "APPEND_SUBJECT_SCORES", rowCount: prepared.subjectScores.length },
    { order: 3, operation: "APPEND_PAYLOAD_CHUNKS", rowCount: prepared.payloadRecords.length },
    { order: 4, operation: "VERIFY_READBACK", rowCount: 1 + prepared.subjectScores.length + prepared.payloadRecords.length },
    { order: 5, operation: "ACTIVATE_REPORT", rowCount: 1 },
  ];
}

function copyState(state: StorageState): StorageState {
  return { reports: state.reports.map((row) => ({ ...row })), subjectScores: state.subjectScores.map((row) => ({ ...row })), payloadRecords: state.payloadRecords.map((row) => ({ ...row })) };
}

export function commitPreparedRegistration(state: StorageState, prepared: PreparedRegistration): RegistrationOutcome {
  const duplicate = state.reports.find((report) => report.examEventId === prepared.report.examEventId && report.pdfHash === prepared.report.pdfHash);
  if (duplicate) return { status: "DUPLICATE", reportId: duplicate.reportId, state };
  const semantic = state.reports.filter((report) => report.status === "ACTIVE" && report.examEventId === prepared.report.examEventId && report.semanticFingerprint === prepared.report.semanticFingerprint);
  if (semantic.length) return { status: "SEMANTIC_REVIEW", candidateReportIds: semantic.map((report) => report.reportId), state };
  if (state.reports.some((report) => report.reportId === prepared.report.reportId)) fail("reportId already exists");

  let reports = state.reports.map((row) => ({ ...row }));
  if (prepared.report.supersedesReportId !== null) {
    const original = reports.find((report) => report.reportId === prepared.report.supersedesReportId);
    if (!original || original.status !== "ACTIVE") fail("superseded report must exist and be ACTIVE");
    reports = reports.map((report) => report.reportId === original.reportId ? { ...report, status: "SUPERSEDED" } : report);
  }
  const next: StorageState = {
    reports: [...reports, { ...prepared.report }],
    subjectScores: [...state.subjectScores.map((row) => ({ ...row })), ...prepared.subjectScores.map((row) => ({ ...row }))],
    payloadRecords: [...state.payloadRecords.map((row) => ({ ...row })), ...prepared.payloadRecords.map((row) => ({ ...row }))],
  };
  return { status: "CREATED", reportId: prepared.report.reportId, state: next };
}

export function emptyStorageState(): StorageState {
  return { reports: [], subjectScores: [], payloadRecords: [] };
}

export function selectDataFile(entries: readonly DataFileEntry[], academicYear: number, addedCells: number, splitThresholdCells: number, createdAt: DataFileEntry["createdAt"]): DataFileSelection {
  if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200) fail("academicYear is invalid");
  if (!Number.isInteger(addedCells) || addedCells < 1) fail("addedCells must be positive");
  if (!Number.isInteger(splitThresholdCells) || splitThresholdCells < addedCells) fail("split threshold must fit one registration");
  const active = entries.filter((entry) => entry.academicYear === academicYear && entry.status === "ACTIVE").sort((left, right) => right.part - left.part)[0];
  if (active && active.estimatedCells + addedCells <= splitThresholdCells) {
    const updated = { ...active, estimatedCells: active.estimatedCells + addedCells };
    return { entry: updated, created: false, entries: entries.map((entry) => entry.fileKey === active.fileKey ? updated : entry) };
  }
  const nextPart = Math.max(0, ...entries.filter((entry) => entry.academicYear === academicYear).map((entry) => entry.part)) + 1;
  const entry: DataFileEntry = { fileKey: `data.${academicYear}.part-${String(nextPart).padStart(2, "0")}`, academicYear, part: nextPart, status: "ACTIVE", estimatedCells: addedCells, createdAt };
  const archived = entries.map((item) => item.academicYear === academicYear && item.status === "ACTIVE" ? { ...item, status: "ARCHIVED" as const } : item);
  return { entry, created: true, entries: [...archived, entry] };
}

export function activeReports(state: StorageState): readonly ReportRecord[] {
  return state.reports.filter((report) => report.status === "ACTIVE");
}

export function cloneStorageState(state: StorageState): StorageState {
  return copyState(state);
}
