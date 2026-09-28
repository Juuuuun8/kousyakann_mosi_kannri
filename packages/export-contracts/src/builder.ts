import type { PersonId, ReportRecord, SubjectScoreRecord } from "../../contracts/src/types.ts";
import { ML_EXPORT_COLUMNS, ML_EXPORT_SCHEMA_VERSION } from "./constants.ts";
import type { MlExportAuditRecord, MlExportFilter, MlExportRequest, MlExportRole, MlExportRow } from "./types.ts";
import { validateMlExportRequest } from "./validation.ts";

export interface MlExportDataset {
  readonly reports: readonly ReportRecord[];
  readonly subjectScores: readonly SubjectScoreRecord[];
}

export interface BuildMlExportInput {
  readonly actorRole: MlExportRole;
  readonly actorId: string;
  readonly auditId: string;
  readonly purpose: string;
  readonly requestedAt: MlExportRequest["requestedAt"];
  readonly filter: MlExportFilter;
  readonly dataset: MlExportDataset;
  readonly pseudonymKey: Uint8Array<ArrayBuffer>;
}

export interface BuiltMlExport {
  readonly request: MlExportRequest;
  readonly audit: MlExportAuditRecord;
}

function included<T>(filter: readonly T[] | undefined, value: T): boolean { return filter === undefined || filter.includes(value); }

function reportMatches(report: ReportRecord, filter: MlExportFilter): boolean {
  return included(filter.examEventIds, report.examEventId) && included(filter.locationIds, report.locationId) &&
    (filter.importedAtFrom === undefined || report.importedAt >= filter.importedAtFrom) &&
    (filter.importedAtTo === undefined || report.importedAt <= filter.importedAtTo);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function mlId(personId: PersonId, keyBytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (keyBytes.byteLength < 32) throw new Error("ML pseudonym key must be at least 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(personId)));
  return `ml_${base64Url(digest)}`;
}

export async function buildMlExport(input: BuildMlExportInput): Promise<BuiltMlExport> {
  if (!input.purpose.trim()) throw new Error("export purpose is required");
  const reports = new Map(input.dataset.reports.filter((report) => report.status === "ACTIVE" && report.personId !== null && ["RESOLVED", "NEW_CONFIRMED"].includes(report.identityStatus) && reportMatches(report, input.filter)).map((report) => [report.reportId, report]));
  const idCache = new Map<PersonId, string>();
  const rows: MlExportRow[] = [];
  for (const score of input.dataset.subjectScores) {
    const report = reports.get(score.reportId);
    if (!report || report.personId === null || !included(input.filter.subjectDefinitionIds, score.subjectDefinitionId)) continue;
    let pseudonym = idCache.get(report.personId);
    if (!pseudonym) {
      pseudonym = await mlId(report.personId, input.pseudonymKey);
      idCache.set(report.personId, pseudonym);
    }
    rows.push({
      exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION, mlId: pseudonym,
      identityStatus: report.identityStatus as MlExportRow["identityStatus"], examEventId: report.examEventId, locationId: report.locationId,
      subjectDefinitionId: score.subjectDefinitionId, metricDefinitionId: score.metricDefinitionId, score: score.score, maxScore: score.maxScore,
      scoreRate: score.scoreRate, deviation: score.deviation, abilityLevel: score.abilityLevel, missingReason: score.missingReason,
      parserVersion: report.parserVersion, payloadFormatVersion: null, featureAsOf: report.importedAt,
    });
  }
  rows.sort((left, right) => `${left.mlId}|${left.examEventId}|${left.subjectDefinitionId}|${left.metricDefinitionId}`.localeCompare(`${right.mlId}|${right.examEventId}|${right.subjectDefinitionId}|${right.metricDefinitionId}`));
  const request: MlExportRequest = { actorRole: input.actorRole, exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION, purpose: input.purpose.trim(), requestedAt: input.requestedAt, filter: input.filter, rows };
  const validation = validateMlExportRequest(request);
  if (!validation.ok) throw new Error(`generated ML export violates the contract: ${validation.issues.map((item) => item.code).join(",")}`);
  const filterSummary = JSON.stringify({ examEventIds: input.filter.examEventIds ?? [], locationIds: input.filter.locationIds ?? [], subjectDefinitionIds: input.filter.subjectDefinitionIds ?? [], importedAtFrom: input.filter.importedAtFrom ?? null, importedAtTo: input.filter.importedAtTo ?? null });
  return { request, audit: { auditId: input.auditId, actorId: input.actorId, purpose: request.purpose, requestedAt: request.requestedAt, exportSchemaVersion: ML_EXPORT_SCHEMA_VERSION, rowCount: rows.length, columns: ML_EXPORT_COLUMNS, filterSummary } };
}
