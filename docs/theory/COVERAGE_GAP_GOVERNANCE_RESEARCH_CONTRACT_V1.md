# Coverage-Gap Governance Research Contract V1

Status: **NORMATIVE RESEARCH CONTRACT — definitions and zero-provider analysis only**  
Date: 2026-08-15  
Scope: the second mechanism screen. This document does not authorize a new runtime, schema, learned router, paid experiment before review, or physical-law claim.

---

## 0. Decision

SwarmAlpha replaces the degenerate `H_E/κ` macrostate and the "disagreement → loud-pair exchange" mechanism with a **coverage-gap** formulation:

> A truth-blind measurement of *which committed private evidence is absent from the round-1 discussion* is a non-degenerate pre-action state that (a) predicts collective failure and (b) determines a targeted disclosure: surface exactly the absent evidence, not the loudest-disagreement pair.

The near-term paper question:

> Does the information-coverage gap — committed private evidence that no agent reproduced verbatim in discussion — predict when an LLM collective fails, and does disclosing that gap improve decisions more than disclosing the loudest disagreement?

---

## 1. Evidence that motivates the change

### FACT

1. The cross-evidence-exchange screen (two rounds, 64 runs) returned DEFER; round 2 (0.9/0.1 arms) had an ITT point estimate in the unfavorable direction (+0.0929).
2. Per-run tracing showed the exchange surfaces the *max-disagreement pair's* supporting evidence, which in the task-39 failure reinforced two wrong options (LZ Bravo, LZ Charlie) while the correct option (LZ Alpha) was never surfaced.
3. Each agent in task-39 held disconfirming evidence against its own preferred option ("Charlie's emergency power failed", "Bravo's runway is flooding") but did not cite it in round 1; the exchange surfaced what agents *did* cite, not what they *withheld*.
4. The evidence-observability census measured **verbatim private-commitment coverage (A2)** with descriptive variation across valid-state runs (development `[0.000, 0.750, 1.000]`, heldout `[0.000, 0.500, 1.000]`), i.e. non-degenerate.
5. `H_E` is near-degenerate (content hashes near-unique → entropy near-maximal) and `κ` is dominated by it → the `R/H_E/κ` macrostate was STOPPED.

### INFERENCE

- The decision-relevant "missing information" in a hidden-profile collective is not "how much disagreement" but "which committed evidence never entered the discussion". Disagreement is a consequence; the gap is a cause.
- The exchange's failure mode is selecting on *volume* (loudest pair) rather than on *absence* (un-discussed evidence).

### HYPOTHESIS

- H1 (prediction): a larger coverage gap (more un-discussed committed private evidence) predicts higher final Brier, before outcome.
- H2 (intervention): disclosing the coverage gap reduces final Brier more than (a) no disclosure and (b) loud-pair exchange, on the same eligible events.

---

## 2. Ontology and authority boundary

The coverage gap is a **derived state**, not a latent construct:

| Category | Example | Authority |
|---|---|---|
| committed private info | `v6TaskManifest.orderedAgentCommitments[].privateInformationHash` | task-manifest record |
| discussed evidence | round-1 `evidence_registered` with a content hash | architecture-recorded event |
| coverage gap | committed hash present in zero round-1 references | deterministic projection |
| latent construct | "what the group truly knows / should have said" | not observed |

The gap is computed strictly from pre-action events and is outcome-free. Ground truth enters only after final elicitation, for scoring. "Un-discussed" means *verbatim un-cited*; it does not assert the group did not *reason* about the information.

---

## 3. State quantity: the coverage gap

For a registered task with committed private information `{a_i, h_i}` (agent, content hash) and round-1 evidence references resolving to content hashes `C`:

\[
G = \{ (a_i, h_i) \mid h_i \notin C \},
\]

the **coverage gap** is the set of committed private information with zero verbatim round-1 references. Its magnitude is `|G|`; its identity is the list of `(agentId, privateInformationHash, content)`.

### 3.1 Non-degeneracy requirement (falsifiable)

`G` must vary across runs/tasks and must not collapse to a constant (as `H_E` did). A degenerate `G` is a STOP condition, not a reason to switch to raw evidence count.

### 3.2 Measurement limitations (must not be silently relaxed)

- Detection is **verbatim-only**: a paraphrased citation does not match and is conservatively still counted as un-discussed.
- Duplicate private-information hashes make source identity ambiguous → fail closed (no disclosure for the ambiguous run).
- Dangling or multiply-bound evidence references fail closed.

---

## 4. Intervention: un-discussed evidence disclosure

On an eligible event, instead of surfacing the max-disagreement pair's evidence, surface `G` — the committed private information absent from round-1 discussion — as a neutral, auditable governance message.

- Framing: "recorded input; not a correctness certificate" (already implemented in `undiscussedEvidenceDisclosureV1.ts`).
- Cost: zero provider calls; deterministic from round-1 references + commitments.
- The delivered content may *disconfirm* an agent's own reported position; the intervention does not label it as such — it only makes the withheld evidence public.

### 4.1 Trigger and arms

For direct comparability with the exchange screen, the trigger is the frozen disagreement rule (round-1 max pairwise TV ≥ 0.8), and the arm allocation is frozen (0.9/0.1 exchange→disclosure in this contract). This isolates the *delivery content* (loud-pair vs gap) as the single difference.

---

## 5. Minimal questions

### RQ1 — State qualification
Does `G` reproduce deterministically and vary across runs/tasks without collapsing?

### RQ2 — Prediction
Does `|G|` (or gap presence) predict final Brier, using only pre-action information?

### RQ3 — Intervention
Does disclosing `G` reduce final Brier relative to (a) no-governance and (b) loud-pair exchange, on the same eligible events?

### RQ4 — Mechanism
Is any benefit concentrated in gap items that contradict the pooled leading option (disconfirming) rather than arbitrary un-cited items? (Exploratory; V1 does not build a "disconfirming" judge.)

---

## 6. Development-to-heldout analysis contract

1. Reconstruct round-1 references and commitments; fail closed on ambiguity.
2. Compute `G` without outcome access.
3. Characterize missingness and task distribution of `|G|`.
4. Freeze a simple split (e.g. median `|G|` on development) without outcome.
5. Apply unchanged to heldout.
6. Report disclose/no-disclose/exchange Brier by strata, task-cluster bootstrap, defer gate.
7. Do not claim benefit unless the heldout disclose-minus-no-governance (or disclose-minus-exchange) is negative with the frozen gate.

---

## 7. Fail-closed conditions

Stop rather than substitute a heuristic if: a reference cannot be bound to a registered evidence identity; a commitment hash is duplicated; round-1 reports are incomplete; option coordinates drift; development and heldout use incompatible contracts. A missing `G` is reported missing, never replaced by raw evidence/report counts.

---

## 8. What is deliberately not being built

- a physical social-thermodynamics runtime or free-energy score;
- a learned router / marginal-cognitive-value engine;
- paraphrase/entailment detection for "discussed" (verbatim-only in V1);
- an LLM judge for "disconfirming" evidence (RQ4 is descriptive only);
- a new provider experiment before this zero-provider analysis is reviewed.

---

## 9. Decision gates

### GO to a pilot
Only if: `G` is non-degenerate; the development-defined split preserves sign on heldout with adequate support; the mechanism audit identifies a plausible disconfirming mechanism; no post-treatment field enters the selector.

### DEFER
If support is insufficient or uncertainty wide.

### STOP
If `G` is degenerate/unreconstructable, or the heldout direction contradicts the development hypothesis.

---

## 10. Paper and platform roles

### Near-term paper
The auditable method: measure a truth-blind coverage gap from discussion, then condition disclosure on it. The empirical result (positive/negative/null) is reported as obtained. The 1985 hidden-profile result is a special case (task-designed gap + unconditional sharing); the claimed novelty is the *online measurement and state-conditioned disclosure*, not "sharing helps".

### Platform
The reusable contribution: separation of observation (committed info), state projection (coverage gap), targeted disclosure, private outcome, and replay.

---

## 11. Responsibility split

Codex owns construct definitions, causal estimands, stop/go, and final claims. Bounded work (read-only analysis, deterministic selectors, adversarial tests, result tables) may proceed after this contract is frozen; no runtime/schema/prompt/task/artifact change without review.
