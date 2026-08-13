# Scratch Quarantine Plan

Status: Batch A partially executed; 15 zero-reference `debug_*.ts` scripts moved
to `experiments/campaign/scratch/` on 2026-08-13. No script was executed.
Date: 2026-08-13

This plan intentionally defers physical moves until the current V6/Measurement
change set has a stable commit. A filename prefix alone is not sufficient to
classify authority: `verify_replay.ts` is current, and some `analyze_*` files
support recorded results.

## Batch A — quarantined

- `debug_*.ts`

All 15 files had zero external filename references. Their relative imports and
repository-root `.env.local` lookup were adjusted for the additional directory
depth. Static review then confirmed that several scripts already target obsolete
HiddenBench transcript fields (`preAccuracy`, `postAccuracy`, `isCorrect`) and
do not type-check against the current API. They are forensic source, not a
supported executable surface; exact execution requires the pinned historical
commit. No script was run and no credential was read.

## Batch B — retained pending evidence-reference review

- `probe_glm_hb.ts`
- `probe_hb_hard.ts`
- `explore_hiddenbench.ts`
- `explore_hiddenbench_protocol.ts`
- `measure_pos_fallback.ts`
- `check_hidden_integrity.ts`

Several Batch B files are cited by historical audit/protocol documents. They
remain in place until those references are deliberately rewritten or archived.

Before moving each file to `experiments/campaign/scratch/`, require:

1. zero static importers outside its own test fixture;
2. zero dynamic `require`/path/command references;
3. no role in a recorded result document or manifest;
4. no uncommitted overlap;
5. type check, relevant replay tests, full test suite, and build after the move.

## Explicitly retained

- `replayVerifier.ts`
- `verify_replay.ts`
- `generate_manifest.ts`
- V6 and Measurement runners/analyzers bound to recorded artifacts
- `Runner.ts`, task loaders, and scenario modules reached dynamically

No files are deleted by this plan. Git history and paper artifact references
must remain recoverable.
