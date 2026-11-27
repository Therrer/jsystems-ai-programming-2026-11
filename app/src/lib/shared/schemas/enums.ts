// Enumerations shared by client, server and model-facing schemas (PRD AC-02, AC-03, AC-20 – AC-22;
// ADR-001 §3.2, §4; ADR-002 §4.1, §5.6). Order matters where the UI lists them.

export const CASE_TYPES = ["complaint", "return"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** AC-03 order. */
export const CATEGORIES = [
  "smartphone",
  "laptop",
  "tablet",
  "tv",
  "audio",
  "wearable",
  "camera",
  "small_appliance",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DETECTED_CATEGORIES = [...CATEGORIES, "other_device", "no_device"] as const;
export type DetectedCategory = (typeof DETECTED_CATEGORIES)[number];

export const CATEGORY_MATCHES = ["match", "mismatch", "unsure"] as const;
export type CategoryMatch = (typeof CATEGORY_MATCHES)[number];

export const UNUSABLE_REASONS = ["blurry", "too_dark", "device_not_visible", "partial_view", "other"] as const;

export const DAMAGE_TYPES = [
  "none",
  "cracked_glass",
  "display_defect",
  "dent_or_deformation",
  "liquid_damage",
  "burn_or_melt",
  "scratches_or_wear",
  "broken_port_or_button",
  "other",
] as const;

export const DAMAGE_SEVERITIES = ["minor", "moderate", "severe"] as const;

export const LIKELY_CAUSES = ["manufacturing_defect", "impact", "liquid", "heat", "normal_wear", "unclear"] as const;
export type LikelyCause = (typeof LIKELY_CAUSES)[number];

export const SIGNS_OF_USE = ["none", "light", "clear", "heavy"] as const;

/** AC-20 order. */
export const OUTCOMES = ["ACCEPT", "REJECT", "MANUAL_REVIEW"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const REMEDIES = [
  "FULL_REFUND",
  "REDUCED_REFUND",
  "REPAIR",
  "REPLACEMENT",
  "PRICE_REDUCTION_OR_REFUND",
  "PAID_REPAIR",
] as const;
export type Remedy = (typeof REMEDIES)[number];

export const DECISION_SOURCES = ["initial", "chat_update"] as const;

export const TIMING_STATUSES = ["within", "buffer", "outside"] as const;
export type TimingStatusValue = (typeof TIMING_STATUSES)[number];

/** Luna Decisions question keys (ADR-001 §3.2). */
export const LUNA_KEYS = [
  "device_visible",
  "image_usable",
  "category",
  "damage_visible",
  "damage_type",
  "likely_cause",
  "description_supported",
  "condition",
  "resellable_as_new",
] as const;
export type LunaKey = (typeof LUNA_KEYS)[number];

export const LUNA_SIGNAL_STATUSES = ["answered", "low_confidence", "not_answered"] as const;
export const LUNA_STATUSES = ["ok", "partial", "unavailable"] as const;

export const FIELD_ERROR_CODES = [
  "REQUIRED",
  "MODEL_NAME",
  "PURCHASE_DATE",
  "DESCRIPTION_MIN",
  "DESCRIPTION_MAX",
  "IMAGE_REQUIRED",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_IMAGE",
  "IMAGE_UNREADABLE",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

/** ADR-002 §5 error codes returned by the API. */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_IMAGE",
  "IMAGE_UNREADABLE",
  "CASE_NOT_FOUND",
  "CASE_BUSY",
  "CASE_NOT_READY",
  "CHAT_LIMIT",
  "ATTACHMENTS_NOT_ALLOWED",
  "MESSAGE_LENGTH",
  "DUPLICATE_MESSAGE",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "INTERNAL",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
