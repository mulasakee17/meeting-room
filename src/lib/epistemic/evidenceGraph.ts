import { createHash } from "node:crypto";
import type { EpistemicEvidence } from "./types";

export interface EpistemicSourceLineage {
  id: string;
  label: string;
  sourceIds: string[];
  createdAt: string;
}

export interface EvidenceLineageMembership {
  id: string;
  evidenceId: string;
  lineageId: string;
  basis: "declared" | "ingestion" | "estimated";
  methodRef?: { id: string; version: string };
  createdAt: string;
}

export type EvidenceRelationKind = "derived_from" | "duplicates" | "contradicts";

export interface EvidenceRelationRecord {
  id: string;
  subjectEvidenceId: string;
  objectEvidenceId: string;
  relation: EvidenceRelationKind;
  basis: "declared" | "deterministic" | "estimated";
  methodRef: { id: string; version: string };
  sourceEventIds: string[];
  createdAt: string;
}

export interface EvidenceVerificationRecord {
  id: string;
  evidenceId: string;
  verifierRef: { id: string; version: string };
  verificationKind: "identity" | "provenance" | "factual_support";
  verdict: "passed" | "failed" | "inconclusive";
  artifactHash?: string;
  sourceEventIds: string[];
  verifiedAt: string;
}

export type EvidenceGraphEvent =
  | { type: "evidence_ingested"; evidence: EpistemicEvidence }
  | { type: "lineage_registered"; lineage: EpistemicSourceLineage }
  | { type: "lineage_membership_recorded"; membership: EvidenceLineageMembership }
  | { type: "evidence_relation_recorded"; relation: EvidenceRelationRecord }
  | { type: "evidence_verified"; verification: EvidenceVerificationRecord };

export interface EvidenceGraphBatch {
  evidence?: EpistemicEvidence[];
  lineages?: EpistemicSourceLineage[];
  memberships?: EvidenceLineageMembership[];
  relations?: EvidenceRelationRecord[];
  verifications?: EvidenceVerificationRecord[];
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  if (values.some(value => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${field} must not contain duplicates`);
}

function validateRef(ref: { id: string; version: string }, field: string): void {
  requireNonEmpty(ref.id, `${field}.id`);
  if (!VERSION_RE.test(ref.version)) throw new Error(`${field}.version must be semantic x.y.z`);
}

export function computeEvidenceContentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function validateEvidenceContentIdentity(evidence: EpistemicEvidence): void {
  requireNonEmpty(evidence.id, "evidence.id");
  requireNonEmpty(evidence.content, "evidence.content");
  requireNonEmpty(evidence.provenance.sourceId, "evidence.provenance.sourceId");
  if (!["agent", "tool", "dataset", "external"].includes(evidence.provenance.sourceKind)) {
    throw new Error("evidence.provenance.sourceKind is invalid");
  }
  if (!SHA256_RE.test(evidence.provenance.contentHash)) {
    throw new Error("evidence.provenance.contentHash must be a canonical sha256 digest");
  }
  const actual = computeEvidenceContentHash(evidence.content);
  if (actual !== evidence.provenance.contentHash) {
    throw new Error(`Evidence ${evidence.id} content hash does not match its content`);
  }
  if (evidence.provenance.lineageId !== undefined) {
    requireNonEmpty(evidence.provenance.lineageId, "evidence.provenance.lineageId");
  }
  requireNonEmpty(evidence.createdAt, "evidence.createdAt");
}

/**
 * Append-only evidence identity/lineage/verification graph.
 *
 * `duplicates` and lineage membership describe dependence, not truth.
 * `factual_support` verdicts are scoped to an explicit verifier and never
 * rewrite the original evidence record.
 */
export class EpistemicEvidenceGraph {
  private readonly evidence = new Map<string, EpistemicEvidence>();
  private readonly lineages = new Map<string, EpistemicSourceLineage>();
  private readonly memberships = new Map<string, EvidenceLineageMembership>();
  private readonly relations = new Map<string, EvidenceRelationRecord>();
  private readonly verifications = new Map<string, EvidenceVerificationRecord>();
  private readonly events: EvidenceGraphEvent[] = [];

  ingestEvidence(item: EpistemicEvidence): void {
    validateEvidenceContentIdentity(item);
    if (this.evidence.has(item.id)) throw new Error(`Evidence ${item.id} already exists in evidence graph`);
    if (item.provenance.lineageId && !this.lineages.has(item.provenance.lineageId)) {
      throw new Error(`Unknown declared lineage ${item.provenance.lineageId}`);
    }
    const stored = clone(item);
    this.evidence.set(stored.id, stored);
    this.events.push({ type: "evidence_ingested", evidence: stored });
  }

  registerLineage(lineage: EpistemicSourceLineage): void {
    requireNonEmpty(lineage.id, "lineage.id");
    requireNonEmpty(lineage.label, "lineage.label");
    requireUniqueNonEmpty(lineage.sourceIds, "lineage.sourceIds");
    if (lineage.sourceIds.length === 0) throw new Error("lineage.sourceIds must be non-empty");
    requireNonEmpty(lineage.createdAt, "lineage.createdAt");
    if (this.lineages.has(lineage.id)) throw new Error(`Lineage ${lineage.id} already exists`);
    const stored = clone(lineage);
    this.lineages.set(stored.id, stored);
    this.events.push({ type: "lineage_registered", lineage: stored });
  }

  recordMembership(membership: EvidenceLineageMembership): void {
    requireNonEmpty(membership.id, "membership.id");
    requireNonEmpty(membership.createdAt, "membership.createdAt");
    if (this.memberships.has(membership.id)) throw new Error(`Lineage membership ${membership.id} already exists`);
    if (!this.evidence.has(membership.evidenceId)) throw new Error(`Unknown evidence ${membership.evidenceId}`);
    if (!this.lineages.has(membership.lineageId)) throw new Error(`Unknown lineage ${membership.lineageId}`);
    if (!["declared", "ingestion", "estimated"].includes(membership.basis)) {
      throw new Error("membership.basis is invalid");
    }
    if (membership.basis === "estimated") {
      if (!membership.methodRef) throw new Error("estimated lineage membership requires methodRef");
      validateRef(membership.methodRef, "membership.methodRef");
    } else if (membership.methodRef) {
      validateRef(membership.methodRef, "membership.methodRef");
    }
    const duplicate = [...this.memberships.values()].some(existing =>
      existing.evidenceId === membership.evidenceId && existing.lineageId === membership.lineageId);
    if (duplicate) throw new Error("Evidence-lineage membership already exists");
    const stored = clone(membership);
    this.memberships.set(stored.id, stored);
    this.events.push({ type: "lineage_membership_recorded", membership: stored });
  }

  recordRelation(relation: EvidenceRelationRecord): void {
    requireNonEmpty(relation.id, "evidenceRelation.id");
    if (this.relations.has(relation.id)) throw new Error(`Evidence relation ${relation.id} already exists`);
    if (!["derived_from", "duplicates", "contradicts"].includes(relation.relation)) {
      throw new Error("evidenceRelation.relation is invalid");
    }
    if (!["declared", "deterministic", "estimated"].includes(relation.basis)) {
      throw new Error("evidenceRelation.basis is invalid");
    }
    if (!this.evidence.has(relation.subjectEvidenceId)) throw new Error(`Unknown evidence ${relation.subjectEvidenceId}`);
    if (!this.evidence.has(relation.objectEvidenceId)) throw new Error(`Unknown evidence ${relation.objectEvidenceId}`);
    if (relation.subjectEvidenceId === relation.objectEvidenceId) {
      throw new Error("evidence relation cannot be self-referential");
    }
    validateRef(relation.methodRef, "evidenceRelation.methodRef");
    requireUniqueNonEmpty(relation.sourceEventIds, "evidenceRelation.sourceEventIds");
    requireNonEmpty(relation.createdAt, "evidenceRelation.createdAt");
    if (relation.relation === "derived_from"
      && this.hasDerivationPath(relation.objectEvidenceId, relation.subjectEvidenceId)) {
      throw new Error("derived_from relation would create a cycle");
    }
    const semanticDuplicate = [...this.relations.values()].some(existing => {
      if (existing.relation !== relation.relation) return false;
      const sameDirection = existing.subjectEvidenceId === relation.subjectEvidenceId
        && existing.objectEvidenceId === relation.objectEvidenceId;
      const symmetricReverse = relation.relation !== "derived_from"
        && existing.subjectEvidenceId === relation.objectEvidenceId
        && existing.objectEvidenceId === relation.subjectEvidenceId;
      return sameDirection || symmetricReverse;
    });
    if (semanticDuplicate) throw new Error("Equivalent evidence relation already exists");
    const stored = clone(relation);
    this.relations.set(stored.id, stored);
    this.events.push({ type: "evidence_relation_recorded", relation: stored });
  }

  recordVerification(verification: EvidenceVerificationRecord): void {
    requireNonEmpty(verification.id, "verification.id");
    if (this.verifications.has(verification.id)) throw new Error(`Verification ${verification.id} already exists`);
    if (!this.evidence.has(verification.evidenceId)) throw new Error(`Unknown evidence ${verification.evidenceId}`);
    if (!["identity", "provenance", "factual_support"].includes(verification.verificationKind)) {
      throw new Error("verification.verificationKind is invalid");
    }
    if (!["passed", "failed", "inconclusive"].includes(verification.verdict)) {
      throw new Error("verification.verdict is invalid");
    }
    validateRef(verification.verifierRef, "verification.verifierRef");
    if (verification.artifactHash !== undefined && !SHA256_RE.test(verification.artifactHash)) {
      throw new Error("verification.artifactHash must be a canonical sha256 digest");
    }
    requireUniqueNonEmpty(verification.sourceEventIds, "verification.sourceEventIds");
    requireNonEmpty(verification.verifiedAt, "verification.verifiedAt");
    const stored = clone(verification);
    this.verifications.set(stored.id, stored);
    this.events.push({ type: "evidence_verified", verification: stored });
  }

  commit(batch: EvidenceGraphBatch): void {
    const snapshot = clone(batch);
    const staged = this.clone();
    staged.applyBatch(snapshot);
    this.applyBatch(snapshot);
  }

  getEvents(): EvidenceGraphEvent[] {
    return clone(this.events);
  }

  getLineageIdsForEvidence(evidenceId: string): string[] {
    if (!this.evidence.has(evidenceId)) throw new Error(`Unknown evidence ${evidenceId}`);
    const explicit = [...this.memberships.values()]
      .filter(membership => membership.evidenceId === evidenceId)
      .map(membership => membership.lineageId);
    const declared = this.evidence.get(evidenceId)?.provenance.lineageId;
    return [...new Set([...explicit, ...(declared ? [declared] : [])])].sort();
  }

  getVerificationsForEvidence(evidenceId: string): EvidenceVerificationRecord[] {
    if (!this.evidence.has(evidenceId)) throw new Error(`Unknown evidence ${evidenceId}`);
    return [...this.verifications.values()]
      .filter(record => record.evidenceId === evidenceId)
      .map(clone)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private hasDerivationPath(fromEvidenceId: string, toEvidenceId: string): boolean {
    const visited = new Set<string>();
    const pending = [fromEvidenceId];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === toEvidenceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const relation of this.relations.values()) {
        if (relation.relation === "derived_from" && relation.subjectEvidenceId === current) {
          pending.push(relation.objectEvidenceId);
        }
      }
    }
    return false;
  }

  private applyBatch(batch: EvidenceGraphBatch): void {
    for (const lineage of batch.lineages ?? []) this.registerLineage(lineage);
    for (const item of batch.evidence ?? []) this.ingestEvidence(item);
    for (const membership of batch.memberships ?? []) this.recordMembership(membership);
    for (const relation of batch.relations ?? []) this.recordRelation(relation);
    for (const verification of batch.verifications ?? []) this.recordVerification(verification);
  }

  private clone(): EpistemicEvidenceGraph {
    const graph = new EpistemicEvidenceGraph();
    for (const event of this.events) {
      if (event.type === "evidence_ingested") graph.ingestEvidence(event.evidence);
      else if (event.type === "lineage_registered") graph.registerLineage(event.lineage);
      else if (event.type === "lineage_membership_recorded") graph.recordMembership(event.membership);
      else if (event.type === "evidence_relation_recorded") graph.recordRelation(event.relation);
      else graph.recordVerification(event.verification);
    }
    return graph;
  }
}
