import type {
  AbilityLevel,
  ExamEventId,
  IsoDateTime,
  LocationId,
  MetricDefinitionId,
  MissingReason,
  SubjectDefinitionId,
} from "../../contracts/src/types.ts";
import type { ML_EXPORT_ALLOWED_IDENTITY_STATUSES, ML_EXPORT_ROLES } from "./constants.ts";

export type MlExportIdentityStatus = (typeof ML_EXPORT_ALLOWED_IDENTITY_STATUSES)[number];
export type MlExportRole = (typeof ML_EXPORT_ROLES)[number];

/** Internal row; direct identifiers are deliberately not representable here. */
export interface MlExportRow {
  readonly exportSchemaVersion: string;
  readonly mlId: string;
  readonly identityStatus: MlExportIdentityStatus;
  readonly examEventId: ExamEventId;
  readonly locationId: LocationId;
  readonly subjectDefinitionId: SubjectDefinitionId;
  readonly metricDefinitionId: MetricDefinitionId;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly scoreRate: number | null;
  readonly deviation: number | null;
  readonly abilityLevel: AbilityLevel | null;
  readonly missingReason: MissingReason | null;
  readonly parserVersion: string;
  readonly payloadFormatVersion: string | null;
  readonly featureAsOf: IsoDateTime;
}

export interface MlExportFilter {
  readonly examEventIds?: readonly ExamEventId[];
  readonly locationIds?: readonly LocationId[];
  readonly subjectDefinitionIds?: readonly SubjectDefinitionId[];
  readonly importedAtFrom?: IsoDateTime;
  readonly importedAtTo?: IsoDateTime;
}

export interface MlExportRequest {
  readonly actorRole: MlExportRole;
  readonly exportSchemaVersion: string;
  readonly purpose: string;
  readonly requestedAt: IsoDateTime;
  readonly filter: MlExportFilter;
  readonly rows: readonly MlExportRow[];
}

export interface MlExportAuditRecord {
  readonly auditId: string;
  readonly actorId: string;
  readonly purpose: string;
  readonly requestedAt: IsoDateTime;
  readonly exportSchemaVersion: string;
  readonly rowCount: number;
  readonly columns: readonly string[];
  readonly filterSummary: string;
}

export interface ExportValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ExportValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ExportValidationIssue[];
}
