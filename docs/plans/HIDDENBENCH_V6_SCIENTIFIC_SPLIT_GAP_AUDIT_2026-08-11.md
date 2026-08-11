# HiddenBench V6 Scientific Split Gap Audit

Status: **FACTUAL GAP AUDIT — NO RUN AUTHORIZATION**
Date: 2026-08-11
Scope: pinned task content only; no model outputs were inspected and no paid
provider was called.

## 1. Question

Can the pinned 65-task bank already be frozen into disjoint threshold-
calibration and held-out detector-validation sets without overstating detector
validity?

## 2. Repository facts

- The bank contains 65 tasks: 59 K=3 and 6 K=4 (`4, 6, 17, 25, 38, 53`).
- It contains 58 four-agent and 7 three-agent tasks (`4, 6, 8, 30, 33, 34,
  50`).
- Tasks `1, 2, 3` have one identical normalized description and different
  resolutions. They are one leakage unit, not three independent tasks.
- Tasks `9--65` carry rationales. Across those 57 rationales, the literal terms
  `decoy`, `shared information`, and `each hidden` occur in 44, 37, and 45
  tasks respectively. This is direct evidence of a repeated construction
  recipe, not evidence that all 57 texts are paraphrases.
- The current task-bank kernel prevents one declared leakage group from
  crossing scientific splits, but it cannot determine whether the declared
  group is semantically correct.
- The categorical engineering CLI and mock T/B/G vertical slice use only an
  `engineering_canary` admission. Scientific calibration and credential-backed
  HiddenBench execution remain fail-closed.

## 3. Construct and leakage distinction

The detector consumes report certainty, categorical domain K, selection
lineage, and resolved proper loss. It does not fit directly on task prose.
Therefore sharing the general hidden-profile task structure across splits is
part of the target within-benchmark population, rather than automatic label
leakage.

Near-paraphrase scenarios remain a dependence risk: their difficulty,
misleading shared evidence, and option-elimination structure can be strongly
correlated. Treating such variants as independent would narrow uncertainty and
could make a threshold look more transferable than it is. Split identity must
therefore be assigned at a reviewed semantic-family level.

## 4. Conservative semantic-family candidates

The following are review candidates, not accepted authority. Membership is
deliberately conservative; the whole family must remain in one scientific
split if accepted.

| Candidate family | Task IDs | Reason for coupling |
|---|---|---|
| exact evacuation variants | 1, 2, 3 | identical normalized public scenario |
| hospital transfer | 9, 40 | same urgent hospital-transfer decision |
| emergency supply site | 10, 37, 51 | select one viable warehouse/storage site |
| event / secure meeting venue | 11, 23, 44, 50, 58, 63 | select one viable event or meeting venue |
| emergency shelter / safe facility | 12, 19, 20, 22, 25, 29, 34, 35, 38, 41, 42, 45, 46, 52 | near-isomorphic safe-site elimination problems |
| artifact protection / transfer | 15, 26, 43, 56 | protect or transfer a valuable artifact under hazard |
| data resilience site | 16, 24, 36 | choose a backup or migration facility under failure |
| research base / field station | 17, 18, 27, 49, 54 | choose one viable research base or station |
| urgent route / landing / transfer | 21, 28, 32, 33, 39, 55 | choose a route, landing site, or transfer path under time pressure |
| laboratory missing-item investigation | 13, 47, 48 | locate a missing item from distributed clues |
| sensor placement | 31, 53 | choose a feasible sensor site |

Tasks not listed together above are not thereby certified independent. They
remain singleton or unresolved candidates pending a second semantic review.

## 5. Decision

### K=4

**NO-GO for threshold authority.** Six tasks cannot support a defensible
calibration/held-out split plus uncertainty and heterogeneity analysis. K=4
may be used for deterministic engineering checks or clearly labelled
exploratory description only.

### K=3

**CANDIDATE, NOT FROZEN.** The 59-task population is large enough to form a
cluster-disjoint candidate split, but this audit does not upgrade semantic
reviews to `accepted`. Before doing so:

1. review every task's public scenario, shared evidence, private evidence, and
   rationale without consulting model outputs;
2. resolve uncertain family membership and record one versioned review
   protocol;
3. assign whole families, stratified by source era, roster size, and scenario
   family, before provider calls;
4. reserve a third untouched family set for later governance-effect testing;
5. report task-family clustered uncertainty; task rows are not independent
   replicates.

## 6. Evidence ceiling

The completed engineering slice establishes categorical executability,
authority binding, truth-firewall behavior, and deterministic replay. This
audit establishes why task-level random splitting is unsafe. Neither result
establishes detector validity, a calibrated threshold, governance benefit, or
generalization beyond HiddenBench.
