import { describe, expect, it } from "vitest";
import {
  canonicalizeOpinionOptions,
  matchCanonicalOption,
} from "@/lib/observation/optionCanonicalization";
import { extractRanking } from "../experiments/v2/statsShared";

const OPTIONS = ["West City", "East City", "South City"];

describe("option canonicalization — fail closed", () => {
  it("接受规范名、预注册别名和唯一包含匹配", () => {
    expect(matchCanonicalOption("west city", OPTIONS).canonical).toBe("West City");
    expect(matchCanonicalOption("West", OPTIONS, { "West City": ["West"] }).canonical).toBe("West City");
  });

  it("无语义关系的 Company A/B/C 不按位置映射", () => {
    expect(matchCanonicalOption("Company A", OPTIONS).status).toBe("unmatched");
    expect(matchCanonicalOption("Company B", OPTIONS).status).toBe("unmatched");
  });

  it("一个标签命中多个候选时返回 ambiguous", () => {
    const match = matchCanonicalOption("startup", [
      "Biomedical startup",
      "AI hardware startup",
    ]);
    expect(match.status).toBe("ambiguous");
    expect(match.candidates).toHaveLength(2);
  });

  it("在进入认知状态前统一 item、utility 和 evidence.supports", () => {
    const opinion = canonicalizeOpinionOptions({
      agentId: "a1",
      reasoning: "r",
      evidence: ["e"],
      belief: 0.2,
      confidence: 80,
      nextOpinion: "",
      referencedAgents: [],
      itemBeliefs: [
        { item: "West", rank: 1, belief: 0.8, confidence: 90 },
        { item: "East", rank: 2, belief: 0.2, confidence: 70 },
        { item: "South", rank: 3, belief: -0.2, confidence: 60 },
      ],
      cognitiveState: {
        utility: { West: 0.8, East: 0.2, South: -0.2 },
        evidenceCoverage: 0.8,
        evidenceQuality: 0.7,
      },
      structuredEvidence: [
        { content: "west evidence", supports: "West", strength: 0.9 },
      ],
    }, OPTIONS, {
      "West City": ["West"],
      "East City": ["East"],
      "South City": ["South"],
    });

    expect(opinion.optionParseStatus).toBe("valid");
    expect(opinion.itemBeliefs?.map(item => item.item)).toEqual(OPTIONS);
    expect(Object.keys(opinion.cognitiveState?.utility ?? {})).toEqual(OPTIONS);
    expect(opinion.structuredEvidence?.[0].supports).toBe("West City");
  });

  it("缺少规范选项时标记 incomplete", () => {
    const opinion = canonicalizeOpinionOptions({
      agentId: "a1",
      reasoning: "r",
      evidence: [],
      belief: 0,
      confidence: 50,
      nextOpinion: "",
      referencedAgents: [],
      itemBeliefs: [{ item: "West City", rank: 1, belief: 0.8, confidence: 90 }],
    }, OPTIONS);
    expect(opinion.optionParseStatus).toBe("incomplete");
  });

  it("rejects duplicate or out-of-range ranks before metric aggregation", () => {
    const opinion = canonicalizeOpinionOptions({
      agentId: "a1",
      reasoning: "r",
      evidence: [],
      belief: 0,
      confidence: 50,
      nextOpinion: "",
      referencedAgents: [],
      itemBeliefs: OPTIONS.map(item => ({ item, rank: 1, belief: 0, confidence: 50 })),
    }, OPTIONS);
    expect(opinion.optionParseStatus).toBe("invalid");
  });

  it("extractRanking 遇到位置标签时抛错，不受 canonical 顺序影响", () => {
    const beliefs = [
      { item: "Company A", rank: 1, belief: 0.8, confidence: 90 },
      { item: "Company B", rank: 2, belief: 0.2, confidence: 70 },
      { item: "Company C", rank: 3, belief: -0.2, confidence: 60 },
    ];
    expect(() => extractRanking("", OPTIONS, beliefs)).toThrow(/无法唯一映射/);
    expect(() => extractRanking("", [...OPTIONS].reverse(), beliefs)).toThrow(/无法唯一映射/);
  });

  it("extractRanking 对不完整排名抛错，不补 ground-truth 顺序", () => {
    expect(() => extractRanking("", OPTIONS, [
      { item: "West City", rank: 1, belief: 0.8, confidence: 90 },
    ])).toThrow(/排名不完整/);
  });

  it("does not break aggregate rank ties using canonical option order", () => {
    const tied = [
      { item: "West City", rank: 1, belief: 0, confidence: 50 },
      { item: "East City", rank: 2, belief: 0, confidence: 50 },
      { item: "South City", rank: 3, belief: 0, confidence: 50 },
      { item: "West City", rank: 3, belief: 0, confidence: 50 },
      { item: "East City", rank: 2, belief: 0, confidence: 50 },
      { item: "South City", rank: 1, belief: 0, confidence: 50 },
    ];
    expect(() => extractRanking("", OPTIONS, tied)).toThrow(/unresolved average-rank tie/);
  });
});
