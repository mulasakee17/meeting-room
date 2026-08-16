# SwarmAlpha

## Persistent research-direction lesson (normative, 2026-08-13)

- Measurement qualification, replay, hashes, and schemas are safeguards, not the project's scientific endpoint. Do not let integrity engineering replace the operational decision problem.
- The default mother problem is governance without immediate ground truth: under correlated sources and bounded compute, decide which new evidence, source, tool, private report, or human review to acquire next, and when to abstain or escalate.
- Online governance code and policies must not read `groundTruth`, `correctAnswer`, resolver outcomes, or later evaluation artifacts. Revealed outcomes belong to offline calibration and effect evaluation only.
- A prompt-conditioned probability report is an optional sensor, not latent belief. Prompt sensitivity is itself a risk observation; missing sensitivity must not be encoded as zero.
- A public-only second opinion is a consistency check, not independent verification. Call an action verification only when it can acquire a new observation or a separately governed source.
- Distinct source or lineage identity is not statistical independence. Never rename declared/verified identity diversity as independent evidence without an empirical error-correlation argument.
- Prefer the smallest experiment that distinguishes policies before adding schemas or bridges. Every proposed quantity must name the operational decision it changes, its admissible online inputs, its falsification test, and its independent outcome.
- Do not pursue engineering complexity as a proxy for progress. Prefer the smallest sufficient implementation that solves a real user or research need; reuse existing paths before adding abstractions, modules, schemas, adapters, engines, or comparison arms.
- Every material increase in complexity must identify a concrete practical benefit, the evidence needed to verify that benefit, and the simpler alternative it displaces. If that benefit is absent, uncertain, or not required for the current claim, defer the complexity.
- Optimize for usable outcomes and real decision quality first. Theoretical rigor and auditability should constrain and clarify the solution, not turn safeguards into the product or make the application scenario artificially narrow.
- A governance intervention is a **targeted rescue, not a universal booster**. An effect concentrated on catastrophic (would-have-failed, confidently-wrong) tasks is the signal, not a dilution: moving already-correct tasks is wasted intervention, and "generality" means the rescue reproduces on every identifiable failure task, not a positive average sign across all tasks. The truth-blind detector's job is to identify those failure tasks *pre-action*; never judge an intervention by pooled mean over all tasks, and never label "effect concentrated on disaster tasks" as a weakness.

## Current repository authority (normative)

- Read `docs/ACTIVE_RESEARCH_SURFACE.md` before broad repository inspection.
- Default work surface: `src/lib/{epistemic,governance,experimentation}`, `experiments/campaign/{v6,measurement}`, and their direct tests/docs.
- `experiments/v2`, `experiments/lunar_survival`, legacy runtime/thermodynamics, and E12 scripts are `LEGACY_READ_ONLY` unless the user explicitly scopes work there.
- Do not use legacy outputs as current V6 measurement-validity or governance-effect evidence.
- Do not split V6, Measurement, kernel contracts, and replay across repositories before the split gates in `docs/ACTIVE_RESEARCH_SURFACE.md` pass.

多 agent 集体决策 + 治理机制实验项目（论文导向）。核心科学问题：可测量的治理干预能否在独立评估标准下改善集体决策质量。

## 文档写作铁律（强制）

写作或修改任何 SwarmAlpha 文档前，**必须阅读并遵守** [docs/REASONING_PROTOCOL.md](docs/REASONING_PROTOCOL.md)（文档推理协议）。其不可破坏的核心：

- 优先级：逻辑正确 > 事实准确 > 与仓库证据一致 > 定义清晰 > 研究严谨 > 可读性 > 说服力 > 风格。绝不为了显得更强而牺牲前五项。
- 严格区分 FACT / INFERENCE / HYPOTHESIS / DESIGN INTENT / SPECULATION；禁止 "designed to improve"→"improves"、"associated with"→"causes"、"we propose"→"we establish" 之类的升级。
- 证据层级：实际实现 > 可复现实验输出 > 测试 > schema/配置 > 技术文档 > 研究叙述 > README > 旧计划。旧文档不能压过实现。
- 因果纪律：治理干预 → 群体动态变化 → 独立评估的决策质量变化，**最后一段不能跳**；共识/影响分布/稳定性只是解释变量，不是决策质量改善的证据。
- 度量 ≠ 构念：度量有效性需论证（见协议 §5/§8）。
- Implemented / Tested / Proposed 分离；缺失证据标 unknown，不发明数字。
- 矛盾时解决而非并存：更新前提后必须追踪并修正基于旧前提的结论。

## 关键现状（2026-08-08，供写作时作为证据基线）

- 最近完成四个批次（未提交，等 Codex 审查）：精确重放验证、susceptibility 语义拆分、role 策略版本化、文档同步。
- E8 susceptibility 中介对现有数据 fail-closed（全为 schema-1）；现有 E12 数据显示治理对 deepseek 净负向、对 glm 弱正向；群体协议显著低于单 agent 全信息个体上限。这些是如实写进 LIMITATIONS 的事实，不是可粉饰的宣传点。
- 核心文档：[docs/REASONING_PROTOCOL.md](docs/REASONING_PROTOCOL.md)、[docs/EPISTEMIC_QUANTITY_SEMANTICS.md](docs/architecture/EPISTEMIC_QUANTITY_SEMANTICS.md)、[docs/experiments/REPLAY_VERIFICATION.md](docs/experiments/REPLAY_VERIFICATION.md)、[docs/AUDIT_CLAIM_VERIFICATION.md](docs/AUDIT_CLAIM_VERIFICATION.md)。
