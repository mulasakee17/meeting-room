/**
 * Un-discussed evidence disclosure — deterministic pure-selector tests (zero provider).
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildUnDiscussedEvidenceMessageV1,
  createUnDiscussedEvidenceSelectorV1,
  selectUnDiscussedEvidenceV1,
  UN_DISCUSSED_COVERAGE_THRESHOLD,
} from "../experiments/campaign/v6/undiscussedEvidenceDisclosureV1";

const hashOf = (s: string): string => `sha256:${createHash("sha256").update(s, "utf8").digest("hex")}`;

describe("selectUnDiscussedEvidenceV1", () => {
  it("selects only the private information never referenced verbatim in round 1", () => {
    const privateInformation = [
      { agentId: "a", privateInformation: "info A" },
      { agentId: "b", privateInformation: "info B" },
      { agentId: "c", privateInformation: "info C" },
    ];
    const getEvidenceContentHash = (id: string): string | undefined => {
      if (id === "e1") return hashOf("info A");
      if (id === "e2") return hashOf("info B");
      return undefined;
    };
    const roundOneReports = [
      { agentId: "a", evidenceRefs: [{ evidenceId: "e1" }] },
      { agentId: "b", evidenceRefs: [{ evidenceId: "e2" }] },
      { agentId: "c", evidenceRefs: [] },
    ];
    const result = selectUnDiscussedEvidenceV1({ roundOneReports, getEvidenceContentHash, privateInformation });
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("c");
    expect(result[0].privateInformation).toBe("info C");
    expect(result[0].privateInformationHash).toBe(hashOf("info C"));
  });

  it("treats a paraphrased (non-verbatim) citation as still un-discussed", () => {
    const privateInformation = [{ agentId: "a", privateInformation: "exact wording" }];
    // The agent cited a paraphrase; its content hash differs from the committed hash.
    const getEvidenceContentHash = () => hashOf("a paraphrase, not exact wording");
    const roundOneReports = [{ agentId: "a", evidenceRefs: [{ evidenceId: "e1" }] }];
    const result = selectUnDiscussedEvidenceV1({ roundOneReports, getEvidenceContentHash, privateInformation });
    expect(result).toHaveLength(1); // verbatim-only detection
  });

  it("fails closed (empty) on duplicate private-information hashes", () => {
    const privateInformation = [
      { agentId: "a", privateInformation: "same info" },
      { agentId: "b", privateInformation: "same info" },
    ];
    const result = selectUnDiscussedEvidenceV1({
      roundOneReports: [],
      getEvidenceContentHash: () => undefined,
      privateInformation,
    });
    expect(result).toEqual([]);
  });

  it("returns empty when every private information was referenced", () => {
    const privateInformation = [{ agentId: "a", privateInformation: "info A" }];
    const getEvidenceContentHash = () => hashOf("info A");
    const roundOneReports = [{ agentId: "a", evidenceRefs: [{ evidenceId: "e1" }] }];
    expect(selectUnDiscussedEvidenceV1({ roundOneReports, getEvidenceContentHash, privateInformation })).toEqual([]);
  });
});

describe("buildUnDiscussedEvidenceMessageV1", () => {
  it("uses neutral, non-certificate framing and includes content + hash", () => {
    const msg = buildUnDiscussedEvidenceMessageV1([{
      agentId: "agent:x",
      privateInformation: "some unique clue",
      privateInformationHash: hashOf("some unique clue"),
    }]);
    expect(msg).toContain("[Experiment-authorized un-discussed evidence disclosure]");
    expect(msg).toContain("not a correctness certificate");
    expect(msg).toContain("sourceAgentId: agent:x");
    expect(msg).toContain("some unique clue");
    expect(msg).toContain(hashOf("some unique clue"));
  });
});

describe("createUnDiscussedEvidenceSelectorV1", () => {
  const selector = createUnDiscussedEvidenceSelectorV1();

  it("returns null when nothing is un-discussed", () => {
    const privateInformation = [{ agentId: "a", privateInformation: "info A" }];
    const out = selector({
      roundOneReports: [{ agentId: "a", evidenceRefs: [{ evidenceId: "e1" }] }],
      getEvidenceContentHash: () => hashOf("info A"),
      privateInformation,
    });
    expect(out).toBeNull();
  });

  it("returns a message when private information is un-discussed", () => {
    const privateInformation = [{ agentId: "a", privateInformation: "hidden clue" }];
    const out = selector({
      roundOneReports: [],
      getEvidenceContentHash: () => undefined,
      privateInformation,
    });
    expect(out).not.toBeNull();
    expect(out).toContain("hidden clue");
  });

  it("freezes the coverage threshold at 0", () => {
    expect(UN_DISCUSSED_COVERAGE_THRESHOLD).toBe(0);
  });
});
