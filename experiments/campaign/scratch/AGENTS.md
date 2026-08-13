# SCRATCH — historical diagnostic scripts

These scripts are preserved for forensic reproduction only. They are not
current V6/Measurement entry points and may perform real provider calls when
executed.

- Do not run them during ordinary tests, builds, or repository orientation.
- Do not read credentials or invoke providers unless the user explicitly asks to reproduce that historical diagnostic.
- Do not use their output as current evidence without a new authority/replay review.
- Relative module paths are kept resolvable, but several scripts target an old
  HiddenBench API and do not type-check against the current transcript types.
  Use the pre-quarantine commit/history for exact reproduction; do not modernize
  these scripts as part of current V6 work.

See `docs/ACTIVE_RESEARCH_SURFACE.md`.
