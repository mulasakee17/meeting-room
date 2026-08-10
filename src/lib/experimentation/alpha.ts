/**
 * Paired alpha metrics (WP3).
 *
 * All alphas are block-level paired contrasts at the unit
 * `task × model × replicateSeed`. A block must be complete (both arms scored
 * under the same evaluation contract) or the alpha is `null` with an explicit
 * `unavailable` reason. `round`/`report` never expand the sample.
 *
 *   swarm_alpha        = Q(vanilla) - Q(independent)
 *   governance_alpha   = Q(diagnostic) - Q(vanilla)
 *   specificity_alpha  = Q(diagnostic) - Q(random)
 *   oracle_gap         = Q(oracle) - Q(target)
 *   net_alpha          = delta_Q - λ_token·Δtokens - λ_time·Δlatency - λ_failure·Δinvalid
 *
 * `lambda` has no single "true" value; report a pre-registered sensitivity grid
 * and Pareto frontier. When a lambda is specified but the corresponding actual
 * cost is missing, `netAlpha` is `null` (unavailable), never an imputed 0.
 */

import {
  EXPERIMENTAL_ARMS,
  validateBlockOutcome,
  type BlockOutcome,
  type ExperimentalArm,
} from "./baseline";

export interface AlphaLambdas {
  token?: number;
  time?: number;
  failure?: number;
}

export interface PairedAlpha {
  swarmAlpha: number | null;
  governanceAlpha: number | null;
  specificityAlpha: number | null;
  oracleGap: number | null;
  netAlpha: number | null;
  unavailable: string[];
}

function qualityOf(outcome: BlockOutcome | undefined): number | null {
  if (!outcome) return null;
  if (outcome.status !== "scored") return null;
  return outcome.quality;
}

function diff(lhs: number | null, rhs: number | null): number | null {
  if (lhs === null || rhs === null) return null;
  return lhs - rhs;
}

function costDiff(a: number | undefined, b: number | undefined): number | null {
  if (a === undefined || b === undefined) return null;
  return a - b;
}

/**
 * 计算一个 block 的配对 alpha。`unavailable` 记录所有未配对的原因（失败闭合，
 * 不把 null/not_applicable 当作 0 平均）。
 */
export function computePairedAlpha(
  outcomes: BlockOutcome[],
  lambdas: AlphaLambdas = {},
): PairedAlpha {
  const unavailable: string[] = [];
  for (const [name, value] of Object.entries(lambdas)) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      return {
        swarmAlpha: null,
        governanceAlpha: null,
        specificityAlpha: null,
        oracleGap: null,
        netAlpha: null,
        unavailable: [`lambda ${name} must be non-negative and finite`],
      };
    }
  }

  const byArm = new Map<ExperimentalArm, BlockOutcome>();
  let invalidBlock = false;
  for (const outcome of outcomes) {
    try {
      validateBlockOutcome(outcome);
    } catch (error) {
      unavailable.push(error instanceof Error ? error.message : String(error));
      invalidBlock = true;
      continue;
    }
    if (!(EXPERIMENTAL_ARMS as readonly string[]).includes(outcome.arm)) {
      unavailable.push(`unknown arm ${outcome.arm}`);
      continue;
    }
    if (byArm.has(outcome.arm)) {
      unavailable.push(`duplicate outcome for arm ${outcome.arm}`);
      invalidBlock = true;
      continue;
    }
    byArm.set(outcome.arm, outcome);
  }

  // 同一 block 内所有 arm 必须共享 blockKey，否则不可配对（fail-closed：
  // 不跨 block 计算配对 alpha）。
  const keys = new Set(outcomes.map(o => o.blockKey));
  const identities = new Set(outcomes.map(o => JSON.stringify({
    taskId: o.taskId,
    modelId: o.modelId,
    replicateSeed: o.replicateSeed,
    evaluationContractRef: o.evaluationContractRef,
    metricRef: o.metricRef,
    budgetContractHash: o.budgetContractHash,
  })));
  const paired = keys.size <= 1 && identities.size <= 1 && !invalidBlock;
  if (keys.size > 1) unavailable.push(`mixed block keys: ${[...keys].join(", ")}`);
  if (identities.size > 1) unavailable.push("paired outcomes have mixed task/model/seed/metric/budget identity");

  const Q = (arm: ExperimentalArm): number | null => {
    if (!paired) {
      unavailable.push(`block not paired (mixed block keys)`);
      return null;
    }
    const q = qualityOf(byArm.get(arm));
    if (q === null) unavailable.push(`arm ${arm} not scored`);
    return q;
  };

  const swarmAlpha = diff(Q("vanilla_interaction"), Q("independent_ensemble"));
  const governanceAlpha = diff(Q("diagnostic_governance"), Q("vanilla_interaction"));
  const specificityAlpha = diff(Q("diagnostic_governance"), Q("random_governance"));
  const oracleGap = diff(Q("full_information_oracle"), Q("vanilla_interaction"));

  // net_alpha：governance vs vanilla 的成本敏感差值。
  let netAlpha: number | null = null;
  const gov = byArm.get("diagnostic_governance");
  const vanilla = byArm.get("vanilla_interaction");
  if (governanceAlpha !== null && gov && vanilla) {
    const needToken = lambdas.token !== undefined;
    const needTime = lambdas.time !== undefined;
    const needFailure = lambdas.failure !== undefined;
    const tokens = costDiff(gov.cost.totalTokens, vanilla.cost.totalTokens);
    const latency = costDiff(gov.cost.totalLatencyMs, vanilla.cost.totalLatencyMs);
    const invalid = costDiff(gov.cost.invalidOrFailed, vanilla.cost.invalidOrFailed);
    if ((needToken && tokens === null) || (needTime && latency === null) || (needFailure && invalid === null)) {
      unavailable.push("actual cost missing for net alpha");
    } else {
      netAlpha = governanceAlpha
        - (lambdas.token ?? 0) * (tokens ?? 0)
        - (lambdas.time ?? 0) * (latency ?? 0)
        - (lambdas.failure ?? 0) * (invalid ?? 0);
    }
  } else {
    unavailable.push("net alpha requires governance and vanilla scored outcomes");
  }

  return {
    swarmAlpha,
    governanceAlpha,
    specificityAlpha,
    oracleGap,
    netAlpha,
    unavailable: [...new Set(unavailable)],
  };
}
