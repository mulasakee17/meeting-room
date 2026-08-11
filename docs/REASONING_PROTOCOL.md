# SwarmAlpha Documentation Reasoning Protocol

Status: normative — applies to all SwarmAlpha documentation work (human or agent).
Enforced via `CLAUDE.md`. Do not weaken items 1–5 to make the project appear stronger.

## 0. Priority

When working on SwarmAlpha documentation, prioritize in this order:

1. Logical correctness
2. Factual accuracy
3. Consistency with repository evidence
4. Clear definitions
5. Research rigor
6. Readability
7. Persuasiveness
8. Style

Never sacrifice items 1–5 to make the project appear stronger.

## 1. Think Before Writing

Before materially changing documentation, first understand what is actually true in the current repository.

Inspect relevant:

* source code
* experiments
* results
* configuration
* tests
* existing research documents
* architecture
* limitations
* claim/audit documents

Do not infer project status from one document when stronger primary evidence exists elsewhere.

Use the repository as evidence, not merely as material to rewrite.

## 2. Build the Reasoning Chain

For every important section, internally reconstruct:

**Research Question
→ Definitions
→ Assumptions
→ Mechanism
→ Method
→ Evidence
→ Result
→ Interpretation
→ Limitation
→ Conclusion**

If a link is missing, do not hide the gap with fluent prose.

Instead:

* repair the argument if evidence exists;
* weaken the claim if evidence is insufficient;
* explicitly mark the gap if it remains unresolved.

A paragraph should normally answer:

1. What are we claiming?
2. Why should this be true?
3. What evidence supports it?
4. What does the evidence actually establish?
5. What does it NOT establish?
6. Why does this matter to the research question?

## 3. Facts First

Distinguish explicitly between:

### FACT

Directly supported by code, experiment output, data, repository history, or cited external evidence.

### INFERENCE

A conclusion reasonably derived from facts but not directly observed.

### HYPOTHESIS

A proposition intended to be tested.

### DESIGN INTENT

Something the system is intended or planned to do.

### SPECULATION

A plausible but currently unsupported interpretation.

Never rewrite one category as another.

Especially do not convert:

* "designed to improve" → "improves"
* "may indicate" → "demonstrates"
* "prototype supports" → "system solves"
* "we propose" → "we establish"
* "associated with" → "causes"
* "observed in this experiment" → "generally holds"

## 4. Evidence Hierarchy

When sources conflict, prefer approximately:

1. Actual current implementation
2. Reproducible experiment output
3. Tests and verification artifacts
4. Current configuration / schemas
5. Technical documentation
6. Research narrative
7. README / promotional summaries
8. Old plans or deprecated documents

Never preserve an attractive claim merely because an older document says it.

If documentation conflicts with implementation, investigate and correct the documentation unless there is evidence that the implementation itself is obsolete.

## 5. Definitions Must Stay Stable

SwarmAlpha depends heavily on precise concepts.

For every important term:

* define it before relying on it;
* use one term for one concept;
* do not silently change its meaning between documents;
* distinguish mathematical definitions from intuitive descriptions;
* distinguish measurements from the latent concepts they attempt to represent.

Examples requiring particular care include concepts such as:

* collective decision quality
* consensus
* influence concentration
* governance
* intervention
* robustness
* sensitivity
* agreement
* reliability
* decision trace
* deterministic mode

A metric is not automatically the construct itself.

For example:

"Gini coefficient of influence weights" is a measurable quantity.

It is not automatically equivalent to "fairness", "good governance", or "decision quality".

Any such interpretation requires an argument.

## 6. Claim–Evidence Discipline

For every strong claim, ask:

**What exact observation would justify this sentence?**

If no concrete answer exists, weaken or remove the claim.

Use strength proportional to evidence:

Weak evidence:

* suggests
* is consistent with
* provides preliminary evidence
* indicates under this setup

Moderate evidence:

* shows in these experiments
* consistently produces under tested conditions

Strong evidence:

* demonstrates

Reserve strong language for genuinely strong evidence.

Do not use "proves" for empirical research unless logically justified.

## 7. Causality Discipline

Never infer causality from:

* before/after comparison alone
* correlation
* lower variance
* higher consensus
* ablation without adequate controls
* a single simulation run

Before writing causal language, check whether the experimental design identifies the causal effect.

Otherwise use language such as:

* associated with
* changes alongside
* sensitivity to
* observed difference under intervention
* comparative effect in the tested configuration

Do not rename descriptive or sensitivity analyses as causal inference.

## 8. Evaluation Discipline

Never assume that a metric is valid simply because it produces a number.

For every metric ask:

1. What construct is it intended to measure?
2. What is its mathematical definition?
3. Why is it appropriate here?
4. What pathological case could fool it?
5. Is higher/lower always better?
6. Does it measure outcome quality or merely group dynamics?

Pay particular attention to cases where:

* consensus can increase while everyone becomes wrong;
* variance can decrease without improving quality;
* agreement can arise from conformity;
* balanced influence does not guarantee correct decisions;
* deterministic behavior does not imply validity;
* reproducibility does not imply realism.

Never report a metric as evidence of "better collective intelligence" unless the bridge from metric to decision quality is explicitly justified.

## 9. Separate Mechanism From Outcome

Keep these logically distinct:

### Mechanism

What the governance system changes.

Examples:

* agent weights
* speaking order
* reflection
* role constraints
* influence caps

### Intermediate dynamics

What changes inside the group.

Examples:

* consensus trajectory
* influence concentration
* belief dispersion
* disagreement structure

### Outcome

Whether the final decision becomes better according to an independently defined criterion.

Do not treat an intermediate dynamic as the final research outcome.

## 10. Separate Implemented, Tested, and Proposed

Every feature or contribution should belong to one of:

**Implemented**
Exists in the current codebase.

**Tested**
Has been evaluated with recorded experiments.

**Proposed**
Part of the design or future research agenda.

Something may be implemented but not validated.

Something may be proposed but not implemented.

Never collapse these categories.

## 11. Analyze Contradictions

When new evidence conflicts with existing documentation:

DO NOT automatically preserve both claims.

Instead:

1. identify the contradiction;
2. determine which evidence is newer or stronger;
3. determine whether definitions changed;
4. correct outdated statements;
5. update downstream conclusions affected by the correction.

A documentation update is not complete if it changes a premise while leaving conclusions based on the old premise untouched.

## 12. Global Logical Consistency

Before finishing a significant documentation update, verify:

### Research question

Does the document still answer the same central research question?

### Definitions

Are important concepts defined consistently?

### Methods

Do described methods match actual implementation?

### Evidence

Does every major empirical statement have support?

### Conclusions

Do conclusions follow from the reported evidence?

### Scope

Are conclusions limited to tested conditions?

### Cross-document consistency

Does the updated document contradict README, technical docs, experiment reports, limitations, or claim-verification documents?

If so, resolve or explicitly document the discrepancy.

## 13. Prefer Argument Structure Over Decorative Prose

Avoid:

* repeated claims in different wording;
* excessive "AI research" vocabulary;
* grand claims without operational definitions;
* unnecessary adjectives;
* rhetorical exaggeration;
* long introductions that do not advance the argument;
* presenting ordinary engineering decisions as scientific contributions.

Prefer:

**claim → mechanism → evidence → implication**

Each paragraph should perform a clear logical function.

Delete sentences that merely make the project sound impressive without increasing information or reasoning quality.

## 14. Scientific Adversarial Review

Before accepting an important conclusion, attempt to disprove it.

Ask:

* Is there a simpler explanation?
* Could this be an artifact of the metric?
* Could the result arise from parameter choices?
* Is there leakage?
* Is there circular evaluation?
* Is the benchmark biased toward the mechanism?
* Does the control group differ in more than one variable?
* Could consensus improve while decision quality deteriorates?
* Are results robust across seeds, tasks, agents, and parameter ranges?
* Are we generalizing beyond the experiment?

If an objection is valid, incorporate it into the reasoning or limitations.

Do not hide it.

## 15. SwarmAlpha-Specific Research Principle

The core scientific value of SwarmAlpha should not be assumed to come from making agents agree.

The important question is whether measurable governance interventions can improve collective decision-making under clearly defined evaluation criteria.

Therefore maintain the distinction:

**Governance intervention
→ change in collective dynamics
→ change in independently evaluated decision quality**

Do not skip the final arrow.

Consensus, influence distribution, agreement, or stability can be useful explanatory variables, but they are not sufficient evidence of improved decision quality by themselves.

## 16. Updating Existing Documents

When editing an existing document:

1. Understand its purpose.
2. Identify its central argument.
3. Locate claims affected by the requested change.
4. Trace dependencies of those claims.
5. Update the full reasoning chain, not only individual sentences.
6. Remove obsolete or contradictory material.
7. Preserve useful information that remains supported.
8. Improve structure only when structure improves understanding.

Do not perform superficial sentence-level rewriting when the underlying argument needs repair.

## 17. When Evidence Is Missing

Never invent missing numbers, experiments, citations, implementation details, or results.

If information cannot be verified:

* mark it as unknown,
* mark it as proposed,
* identify what evidence is needed,
* or omit the claim.

"Unknown" is preferable to fabricated certainty.

## 18. Final Internal Audit

Before completing any major research-document update, perform this checklist internally:

* [ ] Central research question is clear.
* [ ] Major terms are defined.
* [ ] Claims match evidence strength.
* [ ] Code/docs/results are not conflated.
* [ ] Implemented/tested/proposed are separated.
* [ ] Correlation is not presented as causation.
* [ ] Metrics are not overinterpreted.
* [ ] Intermediate dynamics are not confused with decision quality.
* [ ] Important assumptions are visible.
* [ ] Counterexamples have been considered.
* [ ] Conclusions follow from premises.
* [ ] Scope of conclusions matches scope of experiments.
* [ ] No known contradiction with stronger repository evidence remains.
* [ ] No invented facts or results were introduced.
* [ ] The document is easier to reason about, not merely more polished.

If several checks fail, continue analyzing before finalizing the document.

## 19. Writing Standard

Final writing should be:

* precise
* compact
* logically ordered
* technically explicit
* skeptical where appropriate
* readable without sacrificing rigor

Prefer concrete statements over abstract academic language.

The reader should be able to distinguish, at a glance:

**what SwarmAlpha proposes,
what it implements,
what has actually been tested,
what the evidence shows,
and what remains unknown.**
