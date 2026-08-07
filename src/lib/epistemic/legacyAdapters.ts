import type { BehavioralTelemetry } from "./semantics";

/**
 * How a legacy scalar entered the runtime. This is provenance, not a claim
 * about the scalar's truth, calibration, or epistemic authority.
 */
export type LegacyQuantitySource =
  | "agent_reported"
  | "framework_reported"
  | "model_inferred"
  | "derived_from_item_preferences"
  | "compatibility_carry_forward"
  | "runtime_default"
  | "unspecified_parser_output";

export type LegacyQuantityName =
  | "legacy_stance"
  | "legacy_confidence"
  | "legacy_utility"
  | "legacy_evidence_coverage"
  | "legacy_evidence_quality";

export type LegacySemanticRole =
  | "task_stance"
  | "metacognitive_signal"
  | "task_preference"
  | "claimed_evidence_coverage"
  | "claimed_evidence_quality";

export interface LegacyQuantityValue {
  /** Semantic role of the original field; never probability semantics. */
  semanticRole: LegacySemanticRole;
  source: LegacyQuantitySource;
  /** Required for inference/derivation sources; identifies the projection. */
  methodId?: string;
  scale: "[-1,1]" | "[0,100]" | "[0,1]" | "option_scores[-1,1]";
  value: number | Record<string, number>;
}

export type LegacySemanticTelemetry = BehavioralTelemetry<LegacyQuantityValue> & {
  name: LegacyQuantityName;
  /** Previous observation replaced by this later estimate, if any. */
  supersedesEventId?: string;
};

export interface LegacyQuantitySources {
  stance?: LegacyQuantitySource;
  confidence?: LegacyQuantitySource;
  utility?: LegacyQuantitySource;
  evidenceCoverage?: LegacyQuantitySource;
  evidenceQuality?: LegacyQuantitySource;
}

export type LegacyQuantityMethods = Partial<Record<keyof LegacyQuantitySources, string>>;
export type LegacyQuantitySupersedes = Partial<Record<keyof LegacyQuantitySources, string>>;

export interface LegacyQuantityObservationInput {
  eventId: string;
  observedAt: string;
  stance?: number;
  confidence?: number;
  utility?: Record<string, number>;
  evidenceCoverage?: number;
  evidenceQuality?: number;
  sources?: LegacyQuantitySources;
  methods?: LegacyQuantityMethods;
  supersedes?: LegacyQuantitySupersedes;
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
}

function requireIsoTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("observedAt must be a valid timestamp");
  }
}

function requireRange(value: number, min: number, max: number, field: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be finite and within [${min}, ${max}]`);
  }
}

function observation(
  input: LegacyQuantityObservationInput,
  name: LegacyQuantityName,
  semanticRole: LegacySemanticRole,
  scale: LegacyQuantityValue["scale"],
  value: LegacyQuantityValue["value"],
  source: LegacyQuantitySource | undefined,
  methodId: string | undefined,
  supersedesEventId: string | undefined,
): LegacySemanticTelemetry {
  const resolvedSource = source ?? "unspecified_parser_output";
  const resolvedMethodId = methodId ?? defaultMethodId(resolvedSource);
  if (resolvedMethodId !== undefined) requireNonEmpty(resolvedMethodId, `${name} methodId`);
  return {
    layer: "behavioral_telemetry",
    name,
    eventId: `${input.eventId}:${name}`,
    observedAt: input.observedAt,
    ...(supersedesEventId === undefined ? {} : { supersedesEventId }),
    value: {
      semanticRole,
      source: resolvedSource,
      ...(resolvedMethodId === undefined ? {} : { methodId: resolvedMethodId }),
      scale,
      value: typeof value === "number" ? value : { ...value },
    },
  };
}

function defaultMethodId(source: LegacyQuantitySource): string | undefined {
  switch (source) {
    case "derived_from_item_preferences":
      return "legacy.stance_from_item_preferences.v1";
    case "compatibility_carry_forward":
      return "legacy.compatibility_carry_forward.v1";
    case "model_inferred":
      return "legacy.unspecified_model_inference.v1";
    default:
      return undefined;
  }
}

/**
 * Adapt compatibility-era fields into auditable telemetry. This function is
 * intentionally one-way: it never manufactures a BeliefValue or report.
 */
export function observeLegacyQuantities(
  input: LegacyQuantityObservationInput,
): LegacySemanticTelemetry[] {
  requireNonEmpty(input.eventId, "eventId");
  requireIsoTimestamp(input.observedAt);

  const observations: LegacySemanticTelemetry[] = [];
  if (input.stance !== undefined) {
    requireRange(input.stance, -1, 1, "stance");
    observations.push(observation(
      input,
      "legacy_stance",
      "task_stance",
      "[-1,1]",
      input.stance,
      input.sources?.stance,
      input.methods?.stance,
      input.supersedes?.stance,
    ));
  }
  if (input.confidence !== undefined) {
    requireRange(input.confidence, 0, 100, "confidence");
    observations.push(observation(
      input,
      "legacy_confidence",
      "metacognitive_signal",
      "[0,100]",
      input.confidence,
      input.sources?.confidence,
      input.methods?.confidence,
      input.supersedes?.confidence,
    ));
  }

  if (input.utility !== undefined) {
    for (const [option, value] of Object.entries(input.utility)) {
      requireNonEmpty(option, "utility option");
      requireRange(value, -1, 1, `utility.${option}`);
    }
    observations.push(observation(
      input,
      "legacy_utility",
      "task_preference",
      "option_scores[-1,1]",
      input.utility,
      input.sources?.utility,
      input.methods?.utility,
      input.supersedes?.utility,
    ));
  }

  if (input.evidenceCoverage !== undefined) {
    requireRange(input.evidenceCoverage, 0, 1, "evidenceCoverage");
    observations.push(observation(
      input,
      "legacy_evidence_coverage",
      "claimed_evidence_coverage",
      "[0,1]",
      input.evidenceCoverage,
      input.sources?.evidenceCoverage,
      input.methods?.evidenceCoverage,
      input.supersedes?.evidenceCoverage,
    ));
  }

  if (input.evidenceQuality !== undefined) {
    requireRange(input.evidenceQuality, 0, 1, "evidenceQuality");
    observations.push(observation(
      input,
      "legacy_evidence_quality",
      "claimed_evidence_quality",
      "[0,1]",
      input.evidenceQuality,
      input.sources?.evidenceQuality,
      input.methods?.evidenceQuality,
      input.supersedes?.evidenceQuality,
    ));
  }

  if (observations.length === 0) {
    throw new Error("at least one legacy quantity must be observed");
  }

  return observations;
}

/** Latest append-only observation for a quantity; superseded records remain auditable. */
export function latestLegacyTelemetry(
  records: readonly LegacySemanticTelemetry[],
  name: LegacyQuantityName,
): LegacySemanticTelemetry | undefined {
  for (let index = records.length - 1; index >= 0; index--) {
    if (records[index].name === name) return records[index];
  }
  return undefined;
}
