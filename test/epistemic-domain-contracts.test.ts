import { describe, expect, it } from "vitest";
import {
  EpistemicDomainRegistry,
  defineEpistemicDomain,
  validateClaimAgainstDomain,
  type EpistemicClaim,
  type EpistemicDomainContractV1,
} from "@/lib/epistemic";

const RESOLVER = { id: "swarmalpha.resolver.test", version: "1.0.0" };

function domain(
  overrides: Partial<EpistemicDomainContractV1> = {},
): EpistemicDomainContractV1 {
  return {
    id: "swarmalpha.domain.test",
    version: "1.0.0",
    domain: "test-domain",
    label: "Test domain",
    supportedClaimKinds: ["binary", "categorical"],
    resolverRefs: [RESOLVER],
    scoringRuleRefs: [{ id: "swarmalpha.scoring.brier", version: "1.0.0" }],
    quantityRefs: [{ id: "swarmalpha.reported-belief-certainty", version: "1.0.0" }],
    truthBoundary: "resolver_only_after_final_elicitation",
    extensionStatus: "paper_supported",
    limitations: ["Fixture only."],
    ...overrides,
  };
}

function binaryClaim(overrides: Partial<Extract<EpistemicClaim, { resolutionPolicy: { kind: "binary" } }>> = {}) {
  return {
    id: "claim:binary",
    proposition: "The proposition is true.",
    domain: "test-domain",
    createdAt: "2026-08-10T00:00:00.000Z",
    resolutionPolicy: { kind: "binary" as const, resolverId: RESOLVER.id },
    ...overrides,
  };
}

function categoricalClaim(): EpistemicClaim {
  return {
    id: "claim:categorical",
    proposition: "Which option is correct?",
    domain: "test-domain",
    createdAt: "2026-08-10T00:00:00.000Z",
    options: ["a", "b"],
    resolutionPolicy: { kind: "categorical", resolverId: RESOLVER.id },
  };
}

describe("EpistemicDomainRegistry", () => {
  it("registers a domain and validates a conforming claim", () => {
    const registry = new EpistemicDomainRegistry([domain()]);
    expect(validateClaimAgainstDomain(binaryClaim(), registry).domain).toBe("test-domain");
  });

  it("fails closed for an unknown domain", () => {
    const registry = new EpistemicDomainRegistry([domain()]);
    expect(() => validateClaimAgainstDomain(
      binaryClaim({ domain: "unknown" }),
      registry,
    )).toThrow("is not registered");
  });

  it("rejects unsupported claim kinds and resolvers", () => {
    const registry = new EpistemicDomainRegistry([domain({ supportedClaimKinds: ["binary"] })]);
    expect(() => validateClaimAgainstDomain(categoricalClaim(), registry))
      .toThrow("does not support categorical claims");
    expect(() => validateClaimAgainstDomain(binaryClaim({
      resolutionPolicy: { kind: "binary", resolverId: "resolver:other" },
    }), registry)).toThrow("is not allowed by domain");
  });

  it("allows exactly one active contract per claim-domain string", () => {
    const registry = new EpistemicDomainRegistry([domain()]);
    expect(() => registry.register(domain({ version: "2.0.0" })))
      .toThrow("already has an active contract");
  });

  it("rejects invalid truth boundaries and duplicate refs", () => {
    expect(() => defineEpistemicDomain(domain({
      truthBoundary: "resolver_before_discussion" as never,
    }))).toThrow("final-elicitation truth boundary");
    expect(() => defineEpistemicDomain(domain({ resolverRefs: [RESOLVER, RESOLVER] })))
      .toThrow("duplicate versioned refs");
  });

  it("rejects registration after sealing", () => {
    const registry = new EpistemicDomainRegistry().seal();
    expect(() => registry.register(domain())).toThrow("sealed");
  });
});
