import {
  Intervention, InterventionStrategy, InterventionResult,
  GovernanceState, InterventionType,
} from "../types";
import { formatInterventionPrompt } from "../interventionPrompt";

/** Mulberry32 seeded PRNG — replaces Math.random() for reproducibility */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class IntroduceDiversityIntervention implements InterventionStrategy {
  name: string = "introduce_diversity";
  type: InterventionType = "introduce_diversity";

  apply(
    intervention: Intervention,
    state: GovernanceState,
    _agentKnowledge?: Map<string, string[]>
  ): InterventionResult {
    if (intervention.type !== "introduce_diversity") {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const targetAgents = intervention.targetAgents || [];
    if (targetAgents.length === 0) {
      return { success: false, intervention: { ...intervention, applied: false } };
    }

    const perturbationAmount = (intervention.parameters?.perturbationAmount as number) || 0.3;
    // Seeded RNG from intervention parameters (falls back to Math.random if no seed)
    const seed = intervention.parameters?.seed as number | undefined;
    const rng = seed !== undefined ? mulberry32(seed) : Math.random;
    const updatedBeliefs = state.agentBeliefs.map(belief => {
      if (targetAgents.includes(belief.agentId)) {
        const perturbation = (rng() - 0.5) * perturbationAmount * 2;
        return { ...belief, belief: Math.max(-1, Math.min(1, belief.belief + perturbation)) };
      }
      return belief;
    });

    const prompt = formatInterventionPrompt(
      `⚠️ CRITICAL: Echo chamber detected. Multiple agents are expressing nearly identical views.\n` +
      `This is dangerous. You may be missing important counter-evidence.\n` +
      `MANDATORY: State at least ONE scenario where your current conclusion would be WRONG.\n` +
      `If you cannot think of any, you are not thinking critically enough.`
    );

    return {
      success: true,
      intervention: { ...intervention, applied: true,
        effect: `Diversity prompt injected to ${targetAgents.length} agents` },
      stateChanges: { updatedBeliefs },
      prompt,
      promptTargets: [...targetAgents],
    };
  }
}
