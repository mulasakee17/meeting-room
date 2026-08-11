# Legacy E12 Script Status

Status: historical and exploratory tooling snapshot, 2026-08-11.

These scripts are preserved because several repository audits and experiment
reports depend on their exact historical behavior. They are not imported by
the V6 runtime, are not schema-5 authorities, and are not admitted to V6
confirmatory estimation.

## Reproduction and analysis entrypoints

The `run_e12*.ts`, `analyze_*.ts`, `measure_pos_fallback.ts`,
`explore_hiddenbench_protocol.ts`, `probe_hb_hard.ts`, and
`verify_causal_chain.ts` files reconstruct or diagnose legacy E12 outputs.
Their results retain only the evidential status stated in the corresponding
dated reports. They do not establish detector validity or governance effects
for V6.

## One-off diagnostics

The `debug_*.ts`, `check_hidden_integrity.ts`, `explore_hiddenbench.ts`, and
`probe_glm_hb.ts` files are preserved as historical diagnostic probes. They
have no package-script entrypoint and no production importer. Their names do
not grant experimental authority.

## Execution safety

Many files load `.env.local` and some can issue real provider requests when
manually executed. No credential is stored in these files. Do not run them as
part of V6 smoke, calibration, held-out validation, or confirmatory studies.
The current V6 entrypoint and its budget/preflight gates live under
`experiments/campaign/v6/`.
