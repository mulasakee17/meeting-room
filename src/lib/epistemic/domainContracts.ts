import {
  defaultBeliefContractRegistry,
  validateEpistemicClaim,
  type BeliefContractRegistry,
} from "./contracts";
import {
  epistemicRefKey,
  validateEpistemicRef,
  type VersionedEpistemicRef,
} from "./quantityContracts";
import type { BeliefKind, EpistemicClaim } from "./types";

export interface EpistemicDomainContractV1 {
  id: string;
  version: string;
  /** Exact value permitted in EpistemicClaim.domain. */
  domain: string;
  label: string;
  supportedClaimKinds: readonly BeliefKind[];
  resolverRefs: readonly VersionedEpistemicRef[];
  scoringRuleRefs: readonly VersionedEpistemicRef[];
  quantityRefs: readonly VersionedEpistemicRef[];
  truthBoundary: "resolver_only_after_final_elicitation";
  extensionStatus: "paper_supported" | "exploratory";
  limitations: readonly string[];
}

const ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (!Array.isArray(values) || values.length === 0
    || values.some(value => typeof value !== "string" || value.trim().length === 0)
    || new Set(values).size !== values.length) {
    throw new Error(`${field} must contain unique non-empty values`);
  }
}

function validateUniqueRefs(refs: readonly VersionedEpistemicRef[], field: string): void {
  if (!Array.isArray(refs) || refs.length === 0) throw new Error(`${field} must be non-empty`);
  for (const [index, ref] of refs.entries()) validateEpistemicRef(ref, `${field}[${index}]`);
  if (new Set(refs.map(epistemicRefKey)).size !== refs.length) {
    throw new Error(`${field} must not contain duplicate versioned refs`);
  }
}

export function validateEpistemicDomainContract(contract: EpistemicDomainContractV1): void {
  if (!contract || typeof contract !== "object") throw new Error("domain contract must be an object");
  if (!ID_RE.test(contract.id)) throw new Error(`Invalid epistemic domain contract id: ${contract.id}`);
  if (!VERSION_RE.test(contract.version)) throw new Error("domain contract version must be semantic x.y.z");
  requireNonEmpty(contract.domain, "domainContract.domain");
  requireNonEmpty(contract.label, "domainContract.label");
  if (!Array.isArray(contract.supportedClaimKinds)
    || contract.supportedClaimKinds.length === 0
    || contract.supportedClaimKinds.some(kind => kind !== "binary" && kind !== "categorical")
    || new Set(contract.supportedClaimKinds).size !== contract.supportedClaimKinds.length) {
    throw new Error("domainContract.supportedClaimKinds must contain unique supported belief kinds");
  }
  validateUniqueRefs(contract.resolverRefs, "domainContract.resolverRefs");
  validateUniqueRefs(contract.scoringRuleRefs, "domainContract.scoringRuleRefs");
  validateUniqueRefs(contract.quantityRefs, "domainContract.quantityRefs");
  if (contract.truthBoundary !== "resolver_only_after_final_elicitation") {
    throw new Error("domain contracts must enforce the final-elicitation truth boundary");
  }
  if (contract.extensionStatus !== "paper_supported" && contract.extensionStatus !== "exploratory") {
    throw new Error("domainContract.extensionStatus is not supported");
  }
  requireUniqueNonEmpty(contract.limitations, "domainContract.limitations");
}

export function defineEpistemicDomain(
  contract: EpistemicDomainContractV1,
): Readonly<EpistemicDomainContractV1> {
  validateEpistemicDomainContract(contract);
  return deepFreeze(structuredClone(contract));
}

export class EpistemicDomainRegistry {
  private readonly contracts = new Map<string, Readonly<EpistemicDomainContractV1>>();
  private sealed = false;

  constructor(initialContracts: readonly EpistemicDomainContractV1[] = []) {
    for (const contract of initialContracts) this.register(contract);
  }

  register(contract: EpistemicDomainContractV1): void {
    if (this.sealed) throw new Error("EpistemicDomainRegistry is sealed");
    const defined = defineEpistemicDomain(contract);
    if (this.contracts.has(defined.domain)) {
      throw new Error(`Epistemic claim domain ${defined.domain} already has an active contract`);
    }
    this.contracts.set(defined.domain, defined);
  }

  get(domain: string): Readonly<EpistemicDomainContractV1> {
    requireNonEmpty(domain, "claim.domain");
    const contract = this.contracts.get(domain);
    if (!contract) throw new Error(`Epistemic claim domain ${domain} is not registered`);
    return contract;
  }

  list(): VersionedEpistemicRef[] {
    return [...this.contracts.values()].map(contract => ({ id: contract.id, version: contract.version }));
  }

  snapshot(): EpistemicDomainRegistry {
    return new EpistemicDomainRegistry([...this.contracts.values()].map(contract => structuredClone(contract)));
  }

  seal(): this {
    this.sealed = true;
    return this;
  }
}

export function validateClaimAgainstDomain(
  claim: EpistemicClaim,
  domainRegistry: EpistemicDomainRegistry,
  beliefRegistry: BeliefContractRegistry = defaultBeliefContractRegistry,
): Readonly<EpistemicDomainContractV1> {
  validateEpistemicClaim(claim, beliefRegistry);
  const domain = domainRegistry.get(claim.domain);
  if (!domain.supportedClaimKinds.includes(claim.resolutionPolicy.kind)) {
    throw new Error(`Domain ${domain.domain} does not support ${claim.resolutionPolicy.kind} claims`);
  }
  if (!domain.resolverRefs.some(ref => ref.id === claim.resolutionPolicy.resolverId)) {
    throw new Error(`Resolver ${claim.resolutionPolicy.resolverId} is not allowed by domain ${domain.domain}`);
  }
  return domain;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
