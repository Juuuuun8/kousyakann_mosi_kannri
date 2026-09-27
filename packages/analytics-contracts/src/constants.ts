export const ANALYTICS_DIMENSIONS = [
  "exam_event",
  "location",
  "school",
  "grade",
  "subject",
  "domain",
  "target_school",
  "target_rank",
  "ability_level",
] as const;

export const ANALYTICS_GROUPINGS = [
  "overall",
  "exam_event",
  "location",
  "school",
  "grade",
  "subject",
  "domain",
  "target_school",
  "target_rank",
  "ability_level",
] as const;

export const ANALYTICS_METRIC_IDS = [
  "report_count",
  "person_count",
  "subject_taker_count",
  "score_mean",
  "score_median",
  "score_rate_mean",
  "deviation_mean",
  "deviation_median",
  "score_standard_deviation",
  "score_quantiles",
  "missing_rate",
  "domain_score_rate_mean",
  "item_correct_rate",
  "item_no_answer_rate",
  "target_judgement_distribution",
  "target_border_gap",
  "change_from_previous_event",
] as const;

export const ANALYTICS_ROLES = ["ADMIN"] as const;
export const SUPPRESSION_REASONS = ["SMALL_GROUP", "INSUFFICIENT_DATA", "IDENTITY_UNRESOLVED"] as const;
export const ANALYTICS_RESULT_VERSION = "analytics-result.v1";
export const DEFAULT_SUPPRESSION_THRESHOLD = 5;
