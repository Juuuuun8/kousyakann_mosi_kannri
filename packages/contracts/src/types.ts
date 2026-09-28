import type {
  ABILITY_LEVELS,
  ANSWER_CORRECTNESS_CODES,
  IDENTITY_STATUSES,
  MISSING_REASONS,
  PAYLOAD_TYPES,
  PERSON_STATUSES,
  REPORT_STATUSES,
} from "./constants.ts";

export type OneOf<T extends readonly string[]> = T[number];
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type UUID = Brand<string, "UUID">;
export type Sha256Hex = Brand<string, "Sha256Hex">;
export type IsoDateTime = Brand<string, "IsoDateTime">;
export type LocationId = Brand<string, "LocationId">;
export type ExamDefinitionId = Brand<string, "ExamDefinitionId">;
export type ExamEventId = Brand<string, "ExamEventId">;
export type SchemaVersionId = Brand<string, "SchemaVersionId">;
export type PersonId = Brand<string, "PersonId">;
export type SubjectDefinitionId = Brand<string, "SubjectDefinitionId">;
export type MetricDefinitionId = Brand<string, "MetricDefinitionId">;

export type ReportStatus = OneOf<typeof REPORT_STATUSES>;
export type IdentityStatus = OneOf<typeof IDENTITY_STATUSES>;
export type PersonStatus = OneOf<typeof PERSON_STATUSES>;
export type MissingReason = OneOf<typeof MISSING_REASONS>;
export type PayloadType = OneOf<typeof PAYLOAD_TYPES>;
export type AnswerCorrectnessCode = OneOf<typeof ANSWER_CORRECTNESS_CODES>;
export type AbilityLevel = OneOf<typeof ABILITY_LEVELS>;

export type NullableNumber = number | null;
export type NullableText = string | null;

export interface ReportRecord {
  reportId: UUID;
  status: ReportStatus;
  locationId: LocationId;
  examEventId: ExamEventId;
  personId: PersonId | null;
  identityStatus: IdentityStatus;
  examCandidateId: string | null;
  schoolCodeRaw: string | null;
  schoolNameRaw: string | null;
  gradeRaw: string | null;
  classRaw: string | null;
  localNumberRaw: string | null;
  studentNameKanaRaw: string | null;
  schemaVersionId: SchemaVersionId;
  parserVersion: string;
  normalizationVersion: string;
  pdfHash: Sha256Hex;
  semanticFingerprint: Sha256Hex;
  pageCount: number;
  subjectCount: number;
  payloadCount: number;
  importedAt: IsoDateTime;
  importedBy: string;
  supersedesReportId: UUID | null;
}

export interface SubjectScoreRecord {
  recordId: UUID;
  reportId: UUID;
  subjectDefinitionId: SubjectDefinitionId;
  metricDefinitionId: MetricDefinitionId;
  score: NullableNumber;
  maxScore: NullableNumber;
  scoreRate: NullableNumber;
  deviation: NullableNumber;
  abilityLevel: AbilityLevel | null;
  nationalAverage: NullableNumber;
  nationalRank: NullableNumber;
  nationalPopulation: NullableNumber;
  currentStudentAverage: NullableNumber;
  graduateAverage: NullableNumber;
  currentRank: NullableNumber;
  currentPopulation: NullableNumber;
  schoolDeviation: NullableNumber;
  schoolAverage: NullableNumber;
  schoolRank: NullableNumber;
  schoolPopulation: NullableNumber;
  missingReason: MissingReason | null;
  sourceLabelRaw: string | null;
  valueHash: Sha256Hex | null;
  schemaVersionId: SchemaVersionId;
  parserVersion: string;
  normalizationVersion: string;
}

export interface PayloadRecord {
  payloadId: UUID;
  reportId: UUID;
  payloadType: PayloadType;
  subjectDefinitionId: SubjectDefinitionId | null;
  payloadFormatVersion: string;
  chunkIndex: number;
  chunkCount: number;
  itemCount: number;
  payloadHash: Sha256Hex;
  chunkHash: Sha256Hex;
  jsonText: string;
  createdAt: IsoDateTime;
}

export type AnswerMarkTuple = readonly [
  majorQuestion: number | null,
  answerNumberRaw: string,
  correctnessRaw: string | null,
  correctnessCode: AnswerCorrectnessCode | null,
  markRaw: string | null,
  missingReason: MissingReason | null,
];

export interface AnswerMarksPayload {
  readonly v: 1;
  readonly type: "answer_marks";
  readonly subject: string;
  readonly items: readonly AnswerMarkTuple[];
}

export interface DomainResultItem {
  readonly questionNumberRaw: string;
  readonly domainRaw: string;
  readonly domainId: string | null;
  readonly score: NullableNumber;
  readonly maxScore: NullableNumber;
  readonly nationalAverage: NullableNumber;
  readonly schoolAverage: NullableNumber;
  readonly sameAbilityAverage: NullableNumber;
  readonly sameAbilityDifference: NullableNumber;
  readonly scoreRateDifference: NullableNumber;
  readonly evaluationCodeRaw: string | null;
  readonly nextLevelAverage: NullableNumber;
  readonly nextLevelDifference: NullableNumber;
  readonly commentaryRaw: string | null;
  readonly missingReason: MissingReason | null;
}

export interface DomainPayload {
  readonly v: 1;
  readonly type: "domain_results";
  readonly subject: string;
  readonly commentaryRaw: string | null;
  readonly items: readonly DomainResultItem[];
}

export interface TrendItem {
  readonly examEventIdRaw: string;
  readonly examEventId: ExamEventId | null;
  readonly subjectRaw: string;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly score: NullableNumber;
  readonly deviation: NullableNumber;
  readonly abilityLevel: AbilityLevel | null;
  readonly missingReason: MissingReason | null;
}

export interface TrendPayload {
  readonly v: 1;
  readonly type: "trend";
  readonly items: readonly TrendItem[];
}

export interface TargetSchoolItem {
  readonly preferenceOrder: number;
  readonly scheduleRaw: string | null;
  readonly universityRaw: string | null;
  readonly facultyRaw: string | null;
  readonly departmentMethodRaw: string | null;
  readonly universityId: string | null;
  readonly judgementRaw: string | null;
  readonly scoreMetricRaw: string | null;
  readonly scoreOrDeviation: NullableNumber;
  readonly fullScore: NullableNumber;
  readonly borderScore: NullableNumber;
  readonly firstChoiceRank: NullableNumber;
  readonly firstChoicePopulation: NullableNumber;
  readonly totalRank: NullableNumber;
  readonly totalPopulation: NullableNumber;
  readonly firstChoiceAverage: NullableNumber;
  readonly totalAverage: NullableNumber;
  readonly capacity: NullableNumber;
  readonly subjectResults: readonly TargetSubjectResult[];
  readonly evaluationBands: readonly TargetEvaluationBand[];
  readonly missingReason: MissingReason | null;
}

export interface TargetSubjectResult {
  readonly subjectRaw: string;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly averageDeviation: NullableNumber;
  readonly personalScore: NullableNumber;
  readonly universityAllocation: NullableNumber;
  readonly missingReason: MissingReason | null;
}

export interface TargetEvaluationBand {
  readonly thresholdRaw: string;
  readonly judgementRaw: string | null;
  readonly lowerBound: NullableNumber;
  readonly population: NullableNumber;
  readonly missingReason: MissingReason | null;
}

export interface TargetsPayload {
  readonly v: 1;
  readonly type: "targets";
  readonly items: readonly TargetSchoolItem[];
}

export interface NarrativeItem {
  readonly section: string;
  readonly subjectRaw: string | null;
  readonly textRaw: string;
}

export interface NarrativePayload {
  readonly v: 1;
  readonly type: "narrative";
  readonly items: readonly NarrativeItem[];
}

export interface RawLabelItem {
  readonly field: string;
  readonly page: number;
  readonly labelRaw: string;
  readonly valueRaw: string | null;
}

export interface RawLabelsPayload {
  readonly v: 1;
  readonly type: "raw_labels";
  readonly items: readonly RawLabelItem[];
}

export type PayloadJson =
  | AnswerMarksPayload
  | DomainPayload
  | TrendPayload
  | TargetsPayload
  | NarrativePayload
  | RawLabelsPayload;

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}
