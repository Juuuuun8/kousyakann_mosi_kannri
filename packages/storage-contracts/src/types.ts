import type { IsoDateTime, PayloadJson, PayloadRecord, ReportRecord, SubjectDefinitionId, SubjectScoreRecord, UUID } from "../../contracts/src/types.ts";

export interface RegistrationPayload {
  readonly payloadId: UUID;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly payloadFormatVersion: string;
  readonly payload: PayloadJson;
}

export interface RegistrationInput {
  readonly report: ReportRecord;
  readonly subjectScores: readonly SubjectScoreRecord[];
  readonly payloads: readonly RegistrationPayload[];
}

export interface PreparedRegistration {
  readonly report: ReportRecord;
  readonly subjectScores: readonly SubjectScoreRecord[];
  readonly payloadRecords: readonly PayloadRecord[];
}

export interface StorageState {
  readonly reports: readonly ReportRecord[];
  readonly subjectScores: readonly SubjectScoreRecord[];
  readonly payloadRecords: readonly PayloadRecord[];
}

export type RegistrationOutcome =
  | { readonly status: "CREATED"; readonly reportId: UUID; readonly state: StorageState }
  | { readonly status: "DUPLICATE"; readonly reportId: UUID; readonly state: StorageState }
  | { readonly status: "SEMANTIC_REVIEW"; readonly candidateReportIds: readonly UUID[]; readonly state: StorageState };

export interface SheetWriteStep {
  readonly order: number;
  readonly operation: "APPEND_PENDING_REPORT" | "APPEND_SUBJECT_SCORES" | "APPEND_PAYLOAD_CHUNKS" | "VERIFY_READBACK" | "ACTIVATE_REPORT";
  readonly rowCount: number;
}

export interface DataFileEntry {
  readonly fileKey: string;
  readonly academicYear: number;
  readonly part: number;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly estimatedCells: number;
  readonly createdAt: IsoDateTime;
}

export interface DataFileSelection {
  readonly entry: DataFileEntry;
  readonly created: boolean;
  readonly entries: readonly DataFileEntry[];
}
