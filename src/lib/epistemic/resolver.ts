import { getBeliefContract } from "./contracts";
import type { BeliefKind, ClaimResolution, EpistemicClaim, EvidenceId } from "./types";

/** Converts task-specific oracle input into one canonical claim outcome. */
export interface ClaimResolver {
  readonly id: string;
  readonly kind: BeliefKind;
  resolve(claim: EpistemicClaim, input: unknown): unknown;
}

export interface ResolutionMetadata {
  resolvedAt: string;
  evidenceIds?: EvidenceId[];
}

export class ResolverRegistry {
  private readonly resolvers = new Map<string, ClaimResolver>();

  register(resolver: ClaimResolver): void {
    if (resolver.id.trim().length === 0) throw new Error("resolver.id must not be empty");
    if (this.resolvers.has(resolver.id)) throw new Error(`Resolver ${resolver.id} already exists`);
    this.resolvers.set(resolver.id, resolver);
  }

  resolve(
    claim: EpistemicClaim,
    input: unknown,
    metadata: ResolutionMetadata,
  ): ClaimResolution {
    const resolver = this.resolvers.get(claim.resolutionPolicy.resolverId);
    if (!resolver) throw new Error(`Resolver ${claim.resolutionPolicy.resolverId} is not registered`);
    if (resolver.kind !== claim.resolutionPolicy.kind) {
      throw new Error(`Resolver ${resolver.id} kind does not match claim ${claim.id}`);
    }
    const outcome = resolver.resolve(structuredClone(claim), input);
    const common = {
      claimId: claim.id,
      resolverId: resolver.id,
      resolvedAt: metadata.resolvedAt,
      evidenceIds: metadata.evidenceIds,
    };
    const resolution: ClaimResolution = claim.resolutionPolicy.kind === "binary"
      ? { ...common, kind: "binary", outcome: outcome as boolean }
      : { ...common, kind: "categorical", outcome: outcome as string };
    getBeliefContract(claim.resolutionPolicy.kind).validateResolution(claim, resolution);
    return resolution;
  }
}
