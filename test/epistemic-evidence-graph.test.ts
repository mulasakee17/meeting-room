import { describe, expect, it } from "vitest";
import {
  computeEvidenceContentHash,
  EpistemicEvidenceGraph,
  type EpistemicEvidence,
  type EvidenceRelationRecord,
} from "@/lib/epistemic";

function evidence(id: string, content = `content:${id}`, lineageId?: string): EpistemicEvidence {
  return {
    id,
    content,
    createdAt: "2026-08-09T00:00:00.000Z",
    provenance: {
      sourceKind: "dataset",
      sourceId: `source:${id}`,
      contentHash: computeEvidenceContentHash(content),
      lineageId,
    },
  };
}

function derived(id: string, child: string, parent: string): EvidenceRelationRecord {
  return {
    id,
    subjectEvidenceId: child,
    objectEvidenceId: parent,
    relation: "derived_from",
    basis: "declared",
    methodRef: { id: "swarmalpha.method.declared-derivation", version: "1.0.0" },
    sourceEventIds: [],
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("EpistemicEvidenceGraph", () => {
  it("verifies content identity at ingestion instead of trusting a supplied hash", () => {
    const graph = new EpistemicEvidenceGraph();
    graph.ingestEvidence(evidence("e1"));
    expect(graph.getEvents()).toHaveLength(1);

    expect(() => graph.ingestEvidence({
      ...evidence("e2"),
      provenance: { ...evidence("e2").provenance, contentHash: computeEvidenceContentHash("other") },
    })).toThrow("content hash does not match");
    expect(graph.getEvents()).toHaveLength(1);
  });

  it("rejects invalid runtime union values from parsed artifacts", () => {
    const graph = new EpistemicEvidenceGraph();
    const malformed = evidence("e1");
    malformed.provenance.sourceKind = "filesystem" as never;

    expect(() => graph.ingestEvidence(malformed)).toThrow("sourceKind is invalid");
    expect(graph.getEvents()).toEqual([]);
  });

  it("records lineage as dependence metadata, not a truth verdict", () => {
    const graph = new EpistemicEvidenceGraph();
    graph.commit({
      evidence: [evidence("e1", "same", "lineage:declared")],
      lineages: [
        {
          id: "lineage:declared",
          label: "Declared generator lineage",
          sourceIds: ["source:e1"],
          createdAt: "2026-08-09T00:00:00.000Z",
        },
        {
          id: "lineage:registered",
          label: "Additional ingestion lineage",
          sourceIds: ["source:e1"],
          createdAt: "2026-08-09T00:00:00.000Z",
        },
      ],
      memberships: [{
        id: "membership:1",
        evidenceId: "e1",
        lineageId: "lineage:registered",
        basis: "ingestion",
        createdAt: "2026-08-09T00:00:00.000Z",
      }],
    });

    expect(graph.getLineageIdsForEvidence("e1")).toEqual([
      "lineage:declared",
      "lineage:registered",
    ]);
    expect(graph.getVerificationsForEvidence("e1")).toEqual([]);
  });

  it("keeps derived_from acyclic and rejects a bad batch atomically", () => {
    const graph = new EpistemicEvidenceGraph();
    graph.commit({ evidence: [evidence("e1"), evidence("e2"), evidence("e3")] });
    const before = graph.getEvents();

    expect(() => graph.commit({ relations: [
      derived("rel:1", "e2", "e1"),
      derived("rel:2", "e1", "e2"),
    ] })).toThrow("create a cycle");
    expect(graph.getEvents()).toEqual(before);
  });

  it("appends scoped verification without rewriting original evidence", () => {
    const graph = new EpistemicEvidenceGraph();
    const original = evidence("e1");
    graph.ingestEvidence(original);
    graph.recordVerification({
      id: "verification:1",
      evidenceId: "e1",
      verifierRef: { id: "oracle:test", version: "1.0.0" },
      verificationKind: "factual_support",
      verdict: "inconclusive",
      sourceEventIds: ["tool-call:1"],
      verifiedAt: "2026-08-09T00:00:01.000Z",
    });

    expect(graph.getVerificationsForEvidence("e1")).toMatchObject([
      { verdict: "inconclusive", verificationKind: "factual_support" },
    ]);
    const ingestion = graph.getEvents().find(event => event.type === "evidence_ingested");
    expect(ingestion).toEqual({ type: "evidence_ingested", evidence: original });
  });

  it("rejects malformed relation basis/kind and verification kind/verdict", () => {
    const graph = new EpistemicEvidenceGraph();
    graph.commit({ evidence: [evidence("e1"), evidence("e2")] });
    const before = graph.getEvents();

    expect(() => graph.recordRelation({
      ...derived("rel:kind", "e1", "e2"),
      relation: "supports" as never,
    })).toThrow("evidenceRelation.relation is invalid");
    expect(() => graph.recordRelation({
      ...derived("rel:basis", "e1", "e2"),
      basis: "inferred" as never,
    })).toThrow("evidenceRelation.basis is invalid");
    expect(() => graph.recordVerification({
      id: "verification:kind",
      evidenceId: "e1",
      verifierRef: { id: "oracle:test", version: "1.0.0" },
      verificationKind: "security" as never,
      verdict: "passed",
      sourceEventIds: [],
      verifiedAt: "2026-08-09T00:00:00.000Z",
    })).toThrow("verification.verificationKind is invalid");
    expect(() => graph.recordVerification({
      id: "verification:verdict",
      evidenceId: "e1",
      verifierRef: { id: "oracle:test", version: "1.0.0" },
      verificationKind: "identity",
      verdict: "maybe" as never,
      sourceEventIds: [],
      verifiedAt: "2026-08-09T00:00:00.000Z",
    })).toThrow("verification.verdict is invalid");

    expect(graph.getEvents()).toEqual(before);
  });

  it("keeps a multi-event evidence batch atomic when one item is malformed", () => {
    const graph = new EpistemicEvidenceGraph();
    const tampered = evidence("e2");
    tampered.provenance.contentHash = computeEvidenceContentHash("different-content");

    expect(() => graph.commit({
      evidence: [evidence("e1"), tampered],
    })).toThrow("content hash does not match");
    expect(graph.getEvents()).toEqual([]);
  });
});
