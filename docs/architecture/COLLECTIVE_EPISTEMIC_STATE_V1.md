# Collective Epistemic State V1

Status: implemented and deterministically tested; empirical construct validity unknown.

This document describes the implemented `swarmalpha.collective-epistemic-state@1.0.0` projection. It is the first authority-preserving bridge from SwarmAlpha's claim-relative epistemic ledger to a candidate social-thermodynamic macro layer. It does not define a physical thermodynamic law or grant governance authority.

## 1. Purpose and claim boundary

**FACT.** `CollectiveEpistemicStateV1` is a deterministic, claim-relative description of architecture-observed belief reports, evidence lineage declarations, and belief exposures at one `asOfRound`.

Its fixed inference status is `descriptive_macrostate_only`. The implementation does not:

- infer an Agent's latent or private belief;
- establish evidence truth or source independence;
- identify causal social influence;
- predict error or governance benefit;
- authorize a governance action;
- define free energy, temperature, equilibrium, or a conservation law.

The projection is therefore an explanatory candidate, not a detector or controller.

## 2. Authoritative inputs

The public projection consumes:

- one validated binary or categorical `EpistemicClaim`;
- append-only `BeliefReport` records for that claim;
- `EpistemicEvidence` records referenced by those reports;
- architecture-recorded `BeliefExposure` records;
- a non-negative integer `asOfRound`;
- optionally, a frozen expected Agent roster.

Only reports for the selected claim with `round <= asOfRound` enter the state. One unambiguous terminal report per active Agent is selected through the ledger's supersession semantics. Reports from another claim and reports after `asOfRound` do not affect the projection. Unreferenced evidence does not affect its evidence fingerprint.

When an expected roster is provided, the state records absent Agent IDs explicitly. Without a roster, `populationBasis = active_reports_only`; the state must not be interpreted as describing unobserved or abstaining Agents.

## 3. Belief geometry

Let the active terminal reports be probability distributions \(p_1,\ldots,p_n\) over the claim's canonical outcome space. Binary claims use two outcomes. Categorical claims use the registered canonical options.

The normalized entropy of one report is

\[
h(p_i)=-\frac{\sum_y p_i(y)\log p_i(y)}{\log K},
\]

where \(K\) is the number of canonical outcomes.

### 3.1 Within-Agent uncertainty

\[
H_{\mathrm{within}}=\frac{1}{n}\sum_i h(p_i).
\]

This describes average uncertainty in explicit reports. It is not self-reported confidence and not uncertainty inside the model.

### 3.2 Pooled uncertainty

The V1 pool is the equal-report linear pool

\[
\bar p=\frac{1}{n}\sum_i p_i,
\qquad
H_{\mathrm{pool}}=h(\bar p).
\]

Stake does not change V1 weights. The state also stores the pooled distribution, its maximum probability mass, and all exact maximizing outcomes. Exact ties are retained rather than resolved by option order.

### 3.3 Between-Agent disagreement

\[
D_{\mathrm{between}}
=\max(0,H_{\mathrm{pool}}-H_{\mathrm{within}}).
\]

For a shared outcome space this is the normalized entropy gap underlying generalized Jensen--Shannon divergence with equal report weights. It separates two cases that scalar dispersion often conflates:

- Agents are individually uncertain;
- Agents are individually certain but disagree with one another.

The zero clamp protects floating-point roundoff; it is not a substantive threshold.

## 4. Declared lineage diversity

For each latest report, the implementation collects unique non-empty `provenance.lineageId` values from its referenced evidence. A report citing \(m\) distinct declared lineages contributes mass \(1/m\) to each.

After normalizing aggregate lineage mass to \(q_l\), V1 computes

\[
N_{\mathrm{eff}}=\exp\left(-\sum_l q_l\log q_l\right).
\]

It also records the lineage entropy normalized by \(\log L\), where \(L\) is the number of distinct declared lineages. For one lineage the normalized entropy is defined as zero and `effectiveLineageCount = 1`.

These numbers are emitted only when every latest report has at least one declared lineage. If lineage is missing for any active report, completeness is `partial` or `missing`, missing report IDs are explicit, and both diversity estimates are `null`.

**LIMITATION.** A declared lineage is not proof of independence, identity, truth, or distinct principal ownership. V1 does not yet consume estimated graph memberships, duplicate relations, or principal/delegation identity.

## 5. Exposure-conditioned revision

A qualifying revision must have:

- an explicit `supersedesReportId` for the same Agent and claim;
- at least one `observedReportId`;
- a matching architecture-recorded exposure from every observed report to the revising Agent no later than the revision round.

The claim's versioned belief contract supplies the normalized distance between the previous and revised distributions. V1 records qualifying revision count, target count, total distance, and mean distance.

This is an exposure-conditioned temporal association. It does not identify how much of the revision was caused by another Agent rather than private reasoning, new evidence, prompting, or an unrecorded factor.

## 6. Observed response concentration

For descriptive attribution only, each qualifying revision's distance is divided equally among the distinct source Agents whose reports it explicitly observed. Let \(m_j\) be the resulting response mass for source Agent \(j\), and \(s_j=m_j/\sum_k m_k\). V1 computes

\[
\mathrm{HHI}=\sum_j s_j^2.
\]

For \(N>1\), normalized concentration is

\[
\mathrm{HHI}_{\mathrm{norm}}
=\frac{\mathrm{HHI}-1/N}{1-1/N};
\]

for one source it is one. If no positive exposure-conditioned response mass exists, the concentration state is `unavailable` and its numeric values are `null`.

The field is deliberately named `observedResponseConcentration`, not influence concentration. Causal influence requires an identification design such as randomized exposure or a justified structural model.

## 7. Integrity and replay

The artifact has an exact frozen schema, canonical ordering rules, source fingerprints, and a content hash. Validation rejects unknown fields and inconsistent derived quantities. Deterministic replay recomputes the complete artifact from its inputs and rejects self-consistent source-fingerprint forgery.

This establishes internal deterministic consistency under the supplied inputs. It does not establish external timestamping, authentic data origin, cryptographic signer identity, or tamper-proof storage.

## 8. Relationship to social thermodynamics

**FACT.** The historical R/T/H/F paths remain separate compatibility projections. V1 does not rename them or reuse their control thresholds.

**DESIGN INTENT.** The new state supplies a safer basis for future social-thermodynamic hypotheses because its macro quantities are derived from versioned microscopic events over a claim-defined probability space. Candidate future work may test whether disagreement, effective lineage diversity, exposure-conditioned revision, and response concentration predict false consensus, error cascades, recovery time, or proper loss.

Such predictive relationships are currently **unknown**. A future composite or potential function must demonstrate held-out predictive value and intervention response before it can be treated as more than a descriptive statistic.

## 9. Current integration status

- Kernel projection and validation: **implemented**.
- Binary and categorical deterministic tests: **implemented**.
- Input-order, temporal cutoff, missing-lineage, carrier-forgery, and replay tests: **implemented**.
- Production V6 schema-5 carrier: **not implemented**.
- Detection-rule calibration: **not established**.
- Governance-effect evidence: **not established**.
- Principal-aware Agent society identity: **proposed, not implemented**.

The next scientific gate is empirical calibration on held-out tasks, not immediate use of these quantities as intervention thresholds.
