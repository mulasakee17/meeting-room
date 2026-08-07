import { createHash } from "node:crypto";
import type { GovernanceEstimate } from "./semantics";

export type EstimatorDeterminism =
  | { kind: "deterministic" }
  | { kind: "seeded"; seedField: string };

export interface GovernanceEstimatorContract<Input, Output, Config extends object> {
  readonly id: string;
  readonly version: string;
  readonly determinism: EstimatorDeterminism;
  readonly defaultConfig: Config;
  validateInput(input: unknown): void;
  validateConfig(config: unknown): void;
  estimate(input: Input, config: Config): Output;
  validateOutput(output: unknown): void;
}

export interface GovernanceProjectionRequest<Input, Config extends object> {
  name: string;
  input: Input;
  sourceEventIds: string[];
  /** Full configuration, not a partial merge. Omit to use the contract default. */
  config?: Config;
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
}

/**
 * Deterministic JSON-compatible serialization for experiment fingerprints.
 * This intentionally rejects values whose cross-run representation is unclear.
 */
export function canonicalizeEstimatorValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("estimator values must contain only finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const entries: string[] = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new Error("estimator values must not contain sparse arrays");
      }
      entries.push(canonicalizeEstimatorValue(value[index]));
    }
    return `[${entries.join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("estimator values must contain only plain objects and arrays");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("estimator values must not contain symbol keys");
    }
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().map(key => {
      if (record[key] === undefined) {
        throw new Error(`estimator value ${key} must not be undefined`);
      }
      return `${JSON.stringify(key)}:${canonicalizeEstimatorValue(record[key])}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new Error(`unsupported estimator value type: ${typeof value}`);
}

export function fingerprintEstimatorValue(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeEstimatorValue(value), "utf8")
    .digest("hex")}`;
}

function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalizeEstimatorValue(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function contractKey(id: string, version: string): string {
  return `${id}@${version}`;
}

/** Versioned estimator registry. Every projection selects an exact id + version. */
export class GovernanceEstimatorRegistry {
  private readonly contracts = new Map<string, GovernanceEstimatorContract<any, any, any>>();
  private sealed = false;

  constructor(initialContracts: GovernanceEstimatorContract<any, any, any>[] = []) {
    for (const contract of initialContracts) this.register(contract);
  }

  register<Input, Output, Config extends object>(
    contract: GovernanceEstimatorContract<Input, Output, Config>,
  ): void {
    if (this.sealed) throw new Error("GovernanceEstimatorRegistry is sealed");
    requireNonEmpty(contract.id, "estimator.id");
    requireNonEmpty(contract.version, "estimator.version");
    contract.validateConfig(contract.defaultConfig);
    canonicalizeEstimatorValue(contract.defaultConfig);
    if (contract.determinism.kind === "seeded") {
      requireNonEmpty(contract.determinism.seedField, "estimator.determinism.seedField");
    }
    const key = contractKey(contract.id, contract.version);
    if (this.contracts.has(key)) throw new Error(`Governance estimator ${key} already exists`);
    this.contracts.set(key, contract);
  }

  get<Input, Output, Config extends object>(
    id: string,
    version: string,
  ): GovernanceEstimatorContract<Input, Output, Config> {
    const contract = this.contracts.get(contractKey(id, version));
    if (!contract) throw new Error(`Governance estimator ${contractKey(id, version)} is not registered`);
    return contract;
  }

  list(): Array<{ id: string; version: string }> {
    return [...this.contracts.values()]
      .map(contract => ({ id: contract.id, version: contract.version }))
      .sort((left, right) => contractKey(left.id, left.version).localeCompare(contractKey(right.id, right.version)));
  }

  project<Input, Output, Config extends object>(
    id: string,
    version: string,
    request: GovernanceProjectionRequest<Input, Config>,
  ): GovernanceEstimate<Output> {
    requireNonEmpty(request.name, "projection.name");
    const contract = this.get<Input, Output, Config>(id, version);
    contract.validateInput(request.input);
    const selectedConfig = request.config ?? contract.defaultConfig;
    contract.validateConfig(selectedConfig);

    const input = deepFreeze(cloneCanonical(request.input));
    const config = deepFreeze(cloneCanonical(selectedConfig));
    const inputFingerprint = fingerprintEstimatorValue(input);
    const configFingerprint = fingerprintEstimatorValue(config);

    let determinism: GovernanceEstimate<Output>["determinism"];
    if (contract.determinism.kind === "deterministic") {
      determinism = { kind: "deterministic" };
    } else {
      const seed = (config as Record<string, unknown>)[contract.determinism.seedField];
      if (!Number.isSafeInteger(seed)) {
        throw new Error(`seeded estimator config.${contract.determinism.seedField} must be a safe integer`);
      }
      determinism = {
        kind: "seeded",
        seed: seed as number,
        seedField: contract.determinism.seedField,
      };
    }

    const rawOutput = contract.estimate(input, config);
    contract.validateOutput(rawOutput);
    const output = cloneCanonical(rawOutput);
    const sourceEventIds = [...new Set(request.sourceEventIds)];
    for (const eventId of sourceEventIds) requireNonEmpty(eventId, "projection.sourceEventId");
    sourceEventIds.sort();

    return {
      layer: "governance_estimate",
      name: request.name,
      estimatorId: contract.id,
      estimatorVersion: contract.version,
      sourceEventIds,
      inputFingerprint,
      config: cloneCanonical(config),
      configFingerprint,
      outputFingerprint: fingerprintEstimatorValue(output),
      determinism,
      value: output,
    };
  }

  snapshot(): GovernanceEstimatorRegistry {
    return new GovernanceEstimatorRegistry([...this.contracts.values()].map(contract => ({
      ...contract,
      determinism: { ...contract.determinism },
      defaultConfig: cloneCanonical(contract.defaultConfig),
    })));
  }

  seal(): this {
    for (const contract of this.contracts.values()) {
      deepFreeze(contract.defaultConfig);
      Object.freeze(contract.determinism);
      Object.freeze(contract);
    }
    this.sealed = true;
    return this;
  }
}
