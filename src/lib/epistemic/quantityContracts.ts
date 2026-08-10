import type { EpistemicQuantityLayer } from "./semantics";

export interface VersionedEpistemicRef {
  id: string;
  version: string;
}

export type EpistemicClaimCeiling = "C0" | "C1" | "C2" | "C3";

export type EpistemicQuantityUse =
  | "descriptive"
  | "monitoring"
  | "eligibility"
  | "operational_control"
  | "outcome"
  | "settlement";

export type EpistemicQuantityValueDomain =
  | { kind: "bounded_scalar"; min: number; max: number }
  | { kind: "probability" }
  | { kind: "nonnegative_count" }
  | { kind: "boolean" }
  | { kind: "probability_distribution"; beliefKind: "binary" | "categorical" }
  | { kind: "structured"; schemaRef: VersionedEpistemicRef };

export type EpistemicQuantityConstructValidity =
  | { status: "descriptive_only" }
  | {
      status: "operationalized";
      rationale: string;
      preregistrationRef?: VersionedEpistemicRef;
    }
  | {
      status: "held_out_supported";
      evidenceRef: VersionedEpistemicRef;
    };

export type EpistemicQuantityCalibration =
  | { status: "not_applicable"; rationale: string }
  | { status: "uncalibrated" }
  | {
      status: "held_out_evaluated";
      artifactRef: VersionedEpistemicRef;
      calibrationDomain: string;
    };

export interface EpistemicQuantityContractV1 {
  id: string;
  version: string;
  label: string;
  semanticLayer: EpistemicQuantityLayer;
  constructDefinition: string;
  valueDomain: EpistemicQuantityValueDomain;
  sourceLayers: readonly EpistemicQuantityLayer[];
  estimatorRef: VersionedEpistemicRef;
  availableFrom:
    | "pre_discussion"
    | "during_discussion"
    | "post_discussion_pre_resolution"
    | "post_resolution";
  truthAccess: "forbidden" | "required";
  domainScope:
    | { kind: "all_registered_claim_domains" }
    | { kind: "allowlist"; domains: readonly string[] };
  comparability: {
    mode: "within_contract_version" | "within_calibration_domain";
    keys: readonly string[];
  };
  reliability:
    | { status: "unknown" }
    | {
        status: "estimated" | "validated";
        methodRef: VersionedEpistemicRef;
        score: number;
      };
  constructValidity: EpistemicQuantityConstructValidity;
  calibration: EpistemicQuantityCalibration;
  missingness: {
    representation: "explicit_missing_record";
    zeroMeansMissing: false;
    allowedReasons: readonly string[];
  };
  allowedUses: readonly EpistemicQuantityUse[];
  forbiddenInterpretations: readonly string[];
  limitations: readonly string[];
  claimCeiling: EpistemicClaimCeiling;
}

const ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
  for (const value of values) requireNonEmpty(value, field);
  if (new Set(values).size !== values.length) {
    throw new Error(`${field} must not contain duplicates`);
  }
}

function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function epistemicRefKey(ref: VersionedEpistemicRef): string {
  return `${ref.id}@${ref.version}`;
}

export function validateEpistemicRef(ref: VersionedEpistemicRef, field: string): void {
  if (!ref || typeof ref !== "object") throw new Error(`${field} must be an object`);
  requireNonEmpty(ref.id, `${field}.id`);
  if (!VERSION_RE.test(ref.version)) throw new Error(`${field}.version must be semantic x.y.z`);
}

export function validateEpistemicQuantityContract(contract: EpistemicQuantityContractV1): void {
  if (!contract || typeof contract !== "object") throw new Error("quantity contract must be an object");
  if (!ID_RE.test(contract.id)) throw new Error(`Invalid epistemic quantity id: ${contract.id}`);
  if (!VERSION_RE.test(contract.version)) {
    throw new Error(`Invalid epistemic quantity version: ${contract.version}`);
  }
  requireNonEmpty(contract.label, "quantity.label");
  requireNonEmpty(contract.constructDefinition, "quantity.constructDefinition");
  assertOneOf(contract.semanticLayer, [
    "reported_belief",
    "reported_state",
    "derived_epistemic",
    "governance_estimate",
    "behavioral_telemetry",
    "outcome_evaluation",
    "governance_state",
  ], "quantity.semanticLayer");
  requireUniqueNonEmpty(contract.sourceLayers, "quantity.sourceLayers");
  for (const [index, layer] of contract.sourceLayers.entries()) {
    assertOneOf(layer, [
      "reported_belief",
      "reported_state",
      "derived_epistemic",
      "governance_estimate",
      "behavioral_telemetry",
      "outcome_evaluation",
      "governance_state",
    ], `quantity.sourceLayers[${index}]`);
  }
  validateEpistemicRef(contract.estimatorRef, "quantity.estimatorRef");
  assertOneOf(contract.availableFrom, [
    "pre_discussion",
    "during_discussion",
    "post_discussion_pre_resolution",
    "post_resolution",
  ], "quantity.availableFrom");
  assertOneOf(contract.truthAccess, ["forbidden", "required"], "quantity.truthAccess");
  if (contract.truthAccess === "required" && contract.availableFrom !== "post_resolution") {
    throw new Error("truth-dependent quantities must only become available post-resolution");
  }
  if (contract.truthAccess === "required"
    && contract.allowedUses.some(use => use === "eligibility" || use === "operational_control")) {
    throw new Error("truth-dependent quantities cannot drive pre-resolution eligibility or control");
  }

  assertOneOf(contract.valueDomain.kind, [
    "bounded_scalar",
    "probability",
    "nonnegative_count",
    "boolean",
    "probability_distribution",
    "structured",
  ], "quantity.valueDomain.kind");
  if (contract.valueDomain.kind === "bounded_scalar") {
    if (!Number.isFinite(contract.valueDomain.min)
      || !Number.isFinite(contract.valueDomain.max)
      || contract.valueDomain.min > contract.valueDomain.max) {
      throw new Error("bounded scalar quantity domain must have finite min <= max");
    }
  } else if (contract.valueDomain.kind === "probability_distribution") {
    assertOneOf(contract.valueDomain.beliefKind, ["binary", "categorical"], "quantity.valueDomain.beliefKind");
  } else if (contract.valueDomain.kind === "structured") {
    validateEpistemicRef(contract.valueDomain.schemaRef, "quantity.valueDomain.schemaRef");
  }

  assertOneOf(contract.domainScope.kind, ["all_registered_claim_domains", "allowlist"], "quantity.domainScope.kind");
  if (contract.domainScope.kind === "allowlist") {
    requireUniqueNonEmpty(contract.domainScope.domains, "quantity.domainScope.domains");
  }
  assertOneOf(contract.comparability.mode, [
    "within_contract_version",
    "within_calibration_domain",
  ], "quantity.comparability.mode");
  requireUniqueNonEmpty(contract.comparability.keys, "quantity.comparability.keys");

  assertOneOf(contract.reliability.status, ["unknown", "estimated", "validated"], "quantity.reliability.status");
  if (contract.reliability.status !== "unknown") {
    validateEpistemicRef(contract.reliability.methodRef, "quantity.reliability.methodRef");
    if (!Number.isFinite(contract.reliability.score)
      || contract.reliability.score < 0
      || contract.reliability.score > 1) {
      throw new Error("quantity reliability score must be finite within [0,1]");
    }
  }

  assertOneOf(contract.constructValidity.status, [
    "descriptive_only",
    "operationalized",
    "held_out_supported",
  ], "quantity.constructValidity.status");
  if (contract.constructValidity.status === "operationalized") {
    requireNonEmpty(contract.constructValidity.rationale, "quantity.constructValidity.rationale");
    if (contract.constructValidity.preregistrationRef) {
      validateEpistemicRef(
        contract.constructValidity.preregistrationRef,
        "quantity.constructValidity.preregistrationRef",
      );
    }
  } else if (contract.constructValidity.status === "held_out_supported") {
    validateEpistemicRef(contract.constructValidity.evidenceRef, "quantity.constructValidity.evidenceRef");
  }

  assertOneOf(contract.calibration.status, [
    "not_applicable",
    "uncalibrated",
    "held_out_evaluated",
  ], "quantity.calibration.status");
  if (contract.calibration.status === "not_applicable") {
    requireNonEmpty(contract.calibration.rationale, "quantity.calibration.rationale");
  } else if (contract.calibration.status === "held_out_evaluated") {
    validateEpistemicRef(contract.calibration.artifactRef, "quantity.calibration.artifactRef");
    requireNonEmpty(contract.calibration.calibrationDomain, "quantity.calibration.calibrationDomain");
  }

  if (contract.missingness.representation !== "explicit_missing_record"
    || contract.missingness.zeroMeansMissing !== false) {
    throw new Error("quantity missingness must use explicit records and must not encode missing as zero");
  }
  requireUniqueNonEmpty(contract.missingness.allowedReasons, "quantity.missingness.allowedReasons");
  requireUniqueNonEmpty(contract.allowedUses, "quantity.allowedUses");
  for (const [index, use] of contract.allowedUses.entries()) {
    assertOneOf(use, [
      "descriptive",
      "monitoring",
      "eligibility",
      "operational_control",
      "outcome",
      "settlement",
    ], `quantity.allowedUses[${index}]`);
  }
  if (contract.allowedUses.includes("operational_control")
    && (contract.constructValidity.status !== "held_out_supported"
      || contract.calibration.status !== "held_out_evaluated")) {
    throw new Error("operational control requires held-out construct support and calibration evaluation");
  }
  if ((contract.allowedUses.includes("outcome") || contract.allowedUses.includes("settlement"))
    && contract.availableFrom !== "post_resolution") {
    throw new Error("outcome and settlement quantities must only become available post-resolution");
  }
  requireUniqueNonEmpty(contract.forbiddenInterpretations, "quantity.forbiddenInterpretations");
  requireUniqueNonEmpty(contract.limitations, "quantity.limitations");
  assertOneOf(contract.claimCeiling, ["C0", "C1", "C2", "C3"], "quantity.claimCeiling");
  if (contract.claimCeiling === "C2" || contract.claimCeiling === "C3") {
    throw new Error("a quantity contract alone cannot authorize causal or mechanism claims above C1");
  }
  if (contract.constructValidity.status !== "held_out_supported" && contract.claimCeiling !== "C0") {
    throw new Error("quantities without held-out construct support cannot exceed claim ceiling C0");
  }
}

export function defineEpistemicQuantity(
  contract: EpistemicQuantityContractV1,
): Readonly<EpistemicQuantityContractV1> {
  validateEpistemicQuantityContract(contract);
  return deepFreeze(structuredClone(contract));
}

export class EpistemicQuantityRegistry {
  private readonly contracts = new Map<string, Readonly<EpistemicQuantityContractV1>>();
  private sealed = false;

  constructor(initialContracts: readonly EpistemicQuantityContractV1[] = []) {
    for (const contract of initialContracts) this.register(contract);
  }

  register(contract: EpistemicQuantityContractV1): void {
    if (this.sealed) throw new Error("EpistemicQuantityRegistry is sealed");
    const defined = defineEpistemicQuantity(contract);
    const key = epistemicRefKey(defined);
    if (this.contracts.has(key)) throw new Error(`Epistemic quantity ${key} already exists`);
    this.contracts.set(key, defined);
  }

  get(ref: VersionedEpistemicRef): Readonly<EpistemicQuantityContractV1> {
    validateEpistemicRef(ref, "quantityRef");
    const contract = this.contracts.get(epistemicRefKey(ref));
    if (!contract) throw new Error(`Epistemic quantity ${epistemicRefKey(ref)} is not registered`);
    return contract;
  }

  list(): VersionedEpistemicRef[] {
    return [...this.contracts.values()].map(contract => ({ id: contract.id, version: contract.version }));
  }

  snapshot(): EpistemicQuantityRegistry {
    return new EpistemicQuantityRegistry([...this.contracts.values()].map(contract => structuredClone(contract)));
  }

  seal(): this {
    this.sealed = true;
    return this;
  }
}

export const REPORTED_BELIEF_CERTAINTY_V1 = defineEpistemicQuantity({
  id: "swarmalpha.reported-belief-certainty",
  version: "1.0.0",
  label: "Reported belief certainty",
  semanticLayer: "derived_epistemic",
  constructDefinition: "Maximum probability mass in an explicit claim-relative belief report.",
  valueDomain: { kind: "probability" },
  sourceLayers: ["reported_belief"],
  estimatorRef: { id: "swarmalpha.estimator.reported-belief-geometry", version: "1.0.0" },
  availableFrom: "during_discussion",
  truthAccess: "forbidden",
  domainScope: { kind: "all_registered_claim_domains" },
  comparability: {
    mode: "within_contract_version",
    keys: ["belief_kind", "claim_option_count"],
  },
  reliability: { status: "validated", methodRef: { id: "swarmalpha.method.exact-ledger-projection", version: "1.0.0" }, score: 1 },
  constructValidity: {
    status: "operationalized",
    rationale: "Certainty is defined geometrically from the reported probability distribution; it is not a correctness-risk predictor.",
  },
  calibration: {
    status: "not_applicable",
    rationale: "The descriptive geometry is exact; any prediction of error from certainty requires a separate calibrated risk quantity.",
  },
  missingness: {
    representation: "explicit_missing_record",
    zeroMeansMissing: false,
    allowedReasons: ["report_absent", "report_invalid", "claim_unknown"],
  },
  allowedUses: ["descriptive", "monitoring", "eligibility"],
  forbiddenInterpretations: [
    "latent belief",
    "probability of correctness",
    "miscalibration before resolution",
  ],
  limitations: [
    "Certainty ignores whether evidence is sufficient or independent.",
    "Categorical certainty is only comparable when option geometry is declared.",
  ],
  claimCeiling: "C0",
});

export const defaultEpistemicQuantityRegistry = new EpistemicQuantityRegistry([
  REPORTED_BELIEF_CERTAINTY_V1,
]).seal();
