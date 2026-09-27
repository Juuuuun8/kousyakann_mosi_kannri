import type {
  ExamEventId,
  IsoDateTime,
  LocationId,
  MissingReason,
  SchemaVersionId,
  SubjectDefinitionId,
} from "../../contracts/src/types.ts";
import type {
  ANALYTICS_DIMENSIONS,
  ANALYTICS_GROUPINGS,
  ANALYTICS_METRIC_IDS,
  ANALYTICS_ROLES,
  SUPPRESSION_REASONS,
} from "./constants.ts";

export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];
export type AnalyticsGrouping = (typeof ANALYTICS_GROUPINGS)[number];
export type AnalyticsMetricId = (typeof ANALYTICS_METRIC_IDS)[number];
export type AnalyticsRole = (typeof ANALYTICS_ROLES)[number];
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export interface AnalyticsFilter {
  readonly examEventIds?: readonly ExamEventId[];
  readonly locationIds?: readonly LocationId[];
  readonly schoolCodes?: readonly string[];
  readonly gradeRaws?: readonly string[];
  readonly subjectDefinitionIds?: readonly SubjectDefinitionId[];
  readonly targetUniversityIds?: readonly string[];
  readonly targetPreferenceOrders?: readonly number[];
  readonly schemaVersionIds?: readonly SchemaVersionId[];
  readonly missingReasons?: readonly MissingReason[];
  readonly importedAtFrom?: IsoDateTime;
  readonly importedAtTo?: IsoDateTime;
}

export interface AnalyticsComparison {
  readonly baseline: AnalyticsFilter;
  readonly comparison: AnalyticsFilter;
  readonly label?: string;
}

export interface AnalyticsQuery {
  readonly resultVersion: string;
  readonly actorRole: AnalyticsRole;
  readonly filter: AnalyticsFilter;
  readonly groupBy: readonly AnalyticsGrouping[];
  readonly metricIds: readonly AnalyticsMetricId[];
  readonly comparison?: AnalyticsComparison;
  readonly suppressionThreshold: number;
}

export interface MissingCount {
  readonly reason: MissingReason;
  readonly count: number;
}

export interface AnalyticsGroup {
  /** Stable IDs only; display labels are resolved from approved master data. */
  readonly groupKey: string;
  readonly dimensions: Readonly<Partial<Record<AnalyticsDimension, string>>>;
  readonly subjectDefinitionId: SubjectDefinitionId | null;
  readonly sampleCount: number;
  readonly excludedCount: number;
  readonly missingCounts: readonly MissingCount[];
}

export interface AnalyticsMetricValue {
  readonly metricId: AnalyticsMetricId;
  readonly value: number | null;
  readonly unit: "count" | "score" | "rate" | "deviation" | "distribution" | "text";
  readonly denominator: number | null;
  readonly suppressed: boolean;
  readonly suppressionReason: SuppressionReason | null;
}

export interface AnalyticsGroupResult {
  readonly group: AnalyticsGroup;
  readonly metrics: readonly AnalyticsMetricValue[];
}

export interface AnalyticsResult {
  readonly resultVersion: string;
  readonly generatedAt: IsoDateTime;
  readonly query: AnalyticsQuery;
  readonly groups: readonly AnalyticsGroupResult[];
  readonly warnings: readonly string[];
}

export interface AnalyticsValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AnalyticsValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AnalyticsValidationIssue[];
}
