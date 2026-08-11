# HiddenBench → V6 Integration Contract V1

Status: normative design contract, 2026-08-11
Scope: external task authority, categorical belief semantics, evaluation ownership, and claim limits

## 1. Two paths that must not be conflated

### 1.1 HiddenBench official-reference path

**DESIGN INTENT:** reproduce the author implementation at the frozen official
commit recorded by the fidelity audit. Agent count, prompts, visible history,
vote retry/failure semantics, seed derivation, duplications, and official
metrics belong to that implementation.

This path answers whether the chosen provider/model reproduces the published
HiddenBench behavior. It is an external reference condition, not the source of
SwarmAlpha governance authority and not a schema-5 confirmatory artifact.

### 1.2 V6 task-projection path

**FACT:** the V6 kernel uses its own arm-invariant two-round protocol,
single-attempt provider boundary, task manifest, Stage-1 T/B/G assignment,
Stage-2 apply/holdout/sham assignment, final private elicitation, audit replay,
and operational outcome.

This path may reuse the official task content and candidate order. It must not
be described as the official HiddenBench communication protocol. Its purpose
is to estimate protocol and governance contrasts on an external task bank.

**FACT (2026-08-11):** `hiddenBenchTaskAdapter.ts` pins the 65-task parsed
content to source commit `3be6ca16` and a canonical content hash, preserves
candidate and hidden-information order, projects categorical claims, and
requires explicit semantic leakage groups for scientific task-bank entries.
Its deterministic tests establish internal source/identity binding only. They
do not establish external authenticity, official-protocol fidelity, semantic
split validity, detector validity, or governance effectiveness.

## 2. Categorical authority

For one HiddenBench task:

- the primary claim is categorical;
- `options` are the source `possible_answers` in source order;
- options are treated as exhaustive and mutually exclusive for that task;
- the authorized resolution is the source `correct_answer` released only
  after final elicitation closes;
- every answered explicit report assigns a finite probability to every
  canonical option exactly once and the vector sums to one;
- candidate order must never be derived from the resolution.

Binary task commitments retain
`swarmalpha.commitment.v6-binary-ground-truth@1.0.0`. Categorical commitments
use `swarmalpha.commitment.v6-claim-ground-truth@2.0.0`; this prevents a new
claim kind from silently changing the meaning of an existing binary artifact.

## 3. Quantities and comparability

For a categorical report \(p=(p_1,\ldots,p_K)\):

\[
C(p)=\max_i p_i.
\]

**FACT:** this is the existing
`swarmalpha.reported-belief-certainty@1.0.0` definition: maximum probability
mass in an explicit claim-relative report. It is reported-distribution
geometry, not latent confidence and not an error predictor by definition.

The quantity contract permits comparison only within the same belief kind and
claim option count. Consequently:

- K=3 and K=4 thresholds/calibration summaries must not be silently pooled;
- a threshold calibrated on binary reports has no control authority over
  HiddenBench categorical reports;
- K-specific thresholds require distinct frozen policy/study identities;
- any prediction of error requires held-out proper-loss validation.

The categorical proper loss remains the existing multiclass Brier loss:

\[
L(p,y)=\sum_{i=1}^{K}(p_i-\mathbb{1}[y=i])^2.
\]

No new scoring rule is introduced. Non-answered registered agents contribute
the existing uniform reference distribution \(1/K\) under the frozen
operational missingness policy.

## 4. Estimands and metric ownership

The first governance primary estimand remains the Stage-1 run-level ITT
contrast:

\[
\Delta_{gov}=E[L\mid G]-E[L\mid B],
\]

where lower is better and runs are blocked/stratified by task identity,
provider/model composition, option count, and other preregistered strata.
Raw loss levels across K must not be interpreted as directly exchangeable;
task-blocked treatment contrasts, not unblocked absolute pooling, identify the
governance effect.

Secondary quantities are:

- \(B-T\): effect of explicit belief reporting relative to text communication;
- pooled-decision accuracy under the V6 final outcome;
- official HiddenBench pre/post average accuracy, majority accuracy, and
  improvement on the official-reference path;
- hidden-profile post minus full-profile pre as an information-integration
  gap/ceiling diagnostic.

The official HiddenBench metrics do not replace V6 operational pooled Brier,
and the full-profile gap is not evidence that governance improved outcomes.

## 5. Governance mechanism for the first external pilot

The first V6 HiddenBench pilot retains the implemented verification-request
mechanism. This is a deliberately minimal mechanism test:

1. select one first-round report under the frozen monitoring design;
2. derive maximum reported probability mass and qualified lineage-record count;
3. evaluate a K-specific frozen threshold;
4. randomize eligible opportunities to apply/holdout/sham;
5. deliver the result before round two;
6. measure the final private probability vector after discussion.

**LIMITATION:** the current verifier receives public context, the claim, and
the target public message, but no other agent's private information. It may
identify unsupported reasoning or request caution, but it cannot directly
recover an undisclosed HiddenBench fact. A null effect therefore would reject
or weaken this mechanism in this domain; it would not establish that all
epistemic governance is ineffective.

`independent-countercheck@1.0.0` or a targeted private-evidence elicitation is
a follow-up mechanism, not part of the first confirmatory contrast. Adding it
before the first pilot would change both the mechanism and compute budget and
requires a separately versioned adapter, assignment, sham, and estimand.

## 6. Admission gates

No paid HiddenBench governance run is admitted until all of the following are
true:

1. official-reference short-benchmark reproduction is separately runnable;
2. the categorical task manifest opens and resolves under schema 5;
3. discussion and final adapters preserve canonical categorical vectors;
4. categorical monitoring/audit binding replays;
5. K-specific detector validation records and summaries are implemented;
6. K-specific thresholds are frozen from a disjoint calibration source;
7. task identities and official source commit are allowlisted;
8. no legacy schema-4 HiddenBench artifact enters V6 analysis;
9. all T/B/G arms use the same task, provider family, call policy, final
   measurement, and truth firewall;
10. official-reference results are reported as reference evidence, not mixed
    into the randomized V6 ITT estimator.

## 7. Current evidence ceiling

**IMPLEMENTED AND DETERMINISTICALLY TESTED:** generic epistemic claims,
categorical probability validation, multiclass Brier scoring, final private
categorical elicitation, equal-weight pooling, operational outcome, and a
categorical schema-5 governance vertical-slice smoke path.

**NOT YET TESTED WITH REAL MODELS:** official-protocol reproduction under the
current provider, categorical detector validity, governance effect, robustness
across K/task/model, and cost effectiveness.

Therefore the current allowed claim is that SwarmAlpha can represent, audit,
and deterministically replay the categorical experiment semantics. It cannot
yet claim that the detector is valid or that governance improves HiddenBench
performance.

## 7A. Deterministic test status (2026-08-11, FACT)

`test/v6-categorical-authority.test.ts` deterministically covers:

- categorical manifest commitment V2 and its opening (binary V1 unchanged);
- rejection of categorical outcomes outside the canonical options before
  manifest creation;
- rejection of malformed categorical probability vectors (missing/extra
  option, sum != 1, out-of-range, non-numeric, wrong kind) — no belief report
  is formed and the single-attempt boundary never retries;
- a categorical T/B/G slice completing with replay sealed and multiclass Brier;
- tamper resistance at the admission boundary for resolution, belief value,
  reported certainty, and claimOptionCount;
- threshold calibration-domain isolation (`beliefDomain`: default binary/K=2,
  cross-domain ineligibility, construction rejection, categorical diagnosis
  missing `claimOptionCount` fails closed);
- `detectionValidation` V1 remains binary/K=2 only (absent domain and explicit
  binary/K=2 readable; categorical rejected).

These tests establish deterministic categorical authority semantics; they do
not establish categorical detector validity, K-specific threshold calibration,
or any real governance effect.

## 7B. Detector-validation V2 and pre-action census (2026-08-11, FACT)

`detectionValidation` now keeps the binary V1 carrier unchanged and defines a
separate categorical V2 projection. V2 source-binds the committed canonical
options, `claimOptionCount`, the complete reported probability vector,
maximum-mass certainty, K-domain rule config, multiclass Brier loss, hard
top-option outcome, monitoring selection, governance source event, and final
resolution. Its summary remains `descriptive_calibration_only`; implementation
does not establish empirical detector validity.

The eligibility rule now requires a categorical certainty threshold to exceed
the uniform baseline `1/K`. Legacy binary/K=2 therefore retains the existing
strict `> 0.5` boundary. Different belief kinds or values of K remain separate
calibration domains.

`projectV6PreActionDetectionCensusV1` derives an analysis-only census over all
first-round explicit reports in B and G. It performs no provider call, creates
no governance action, and carries no control authority. Current production has
no pre-action evidence-verification records, so the census records qualified
lineage count `0` with status `no_pre_action_verification_records`; this must
not be interpreted as evidence that the report has no real independent source.

Still not implemented or established: empirical K-specific threshold fitting,
held-out real-model detector validity, official HiddenBench protocol
reproduction, governance effectiveness, and confirmatory readiness.

## 7C. Task-bank split ceiling after engineering smoke (2026-08-11)

**FACT:** the pinned bank contains 59 K=3 tasks and 6 K=4 tasks. It contains
58 four-agent tasks and 7 three-agent tasks. Tasks 1--3 have the same normalized
description and differ in resolution. Tasks 9--65 contain a `rationale` field;
their rationales repeatedly describe the same abstract construction recipe:
shared information favors a decoy, private items undermine alternatives, and
pooling the items identifies one option.

**INFERENCE:** a task-ID-level random split would understate dependence between
near-paraphrase scenario families. The repeated abstract hidden-profile recipe
is part of the intended benchmark population, not by itself a train/test leak;
however, it limits external validity. Near-duplicate scenario families must be
kept within one split and the resulting evidence may only be described as
within-HiddenBench generalization.

**DECISION:** K=4 remains engineering/exploratory. Six tasks are insufficient
to release a K-specific threshold as predictive authority. K=3 may proceed to
a candidate calibration/held-out manifest only after the semantic-family
review in `HIDDENBENCH_V6_SCIENTIFIC_SPLIT_GAP_AUDIT_2026-08-11.md` is accepted
and frozen before any model output is inspected. Until then, the CLI's
scientific calibration and credential-backed HiddenBench gates remain closed.
