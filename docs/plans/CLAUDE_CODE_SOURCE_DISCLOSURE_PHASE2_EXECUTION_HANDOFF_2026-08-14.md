# Claude Code 执行指南：Source Disclosure Phase 2

日期：2026-08-14  
状态：**AUTHORIZED FOR ZERO-PROVIDER WIRING；PAID EXECUTION REQUIRES `RUN_AUTHORIZED=yes`**  
性质：non-confirmatory、task-paired information-access screen。

## 0. 总目标

用现有 V6 vertical slice 完成一个最小、可审计的真实实验：比较在其他条件相同的情况下，把一条原本私有的任务相关信息披露到公共上下文（D）与不披露（H）对最终集体概率判断 Brier loss 的影响。

本阶段不扩建平台，不发明新指标，不修改核心 schema，不把提示词自报量、exact hash uptake 或社会热力学量提升为效果裁决者。

主要 estimand：

`Δ = mean[Brier(D) − Brier(H)]`

负值有利于披露。exact source-hash uptake 只作描述性中介；它不参与 status gate，因为零命中不能排除 paraphrase、总结或隐式使用。ground truth 只在 run 结束后用于独立评分，不进入 source selection、prompt、检测或控制。

## 1. 必须先读且只需读的文件

1. `docs/REASONING_PROTOCOL.md`
2. `docs/plans/SOURCE_DISCLOSURE_SCREEN_PHASE1_IMPLEMENTATION_REPORT_2026-08-14.md`
3. `experiments/campaign/v6/run_v6_source_disclosure_screen.ts`
4. `experiments/campaign/v6/analyze_v6_source_disclosure_screen.ts`
5. `experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json`
6. `test/v6-source-disclosure-screen.test.ts`
7. `experiments/campaign/v6/deepseekSingleAttemptInvoker.ts`
8. `experiments/campaign/v6/run_v6_verdict_task_heldout_replication.ts`，仅作为真实 CLI 接线范例

除非发现 red-zone，不要重新阅读整个仓库。

## 2. 冻结事实

- tasks：`13,18,28,33,38,39,45,47,50,55`
- 8 个 leakage groups
- 2 blocks/task，H/D 各一，共 40 runs、20 pairs
- plan contentHash：`sha256:2cbb8699f7b008121c88dc8c29447afc9022387081f61b76a7e8b406265bd5db`
- planned provider calls：456；硬上限 600
- conservative token reserve：912,000；硬上限 1,600,000
- single attempt、顺序执行、无 retry、无补样本、无换题、无重抽 seed
- always-ineligible governance rule：零 verification、零 governance action
- H/D 唯一任务处理差异：publicContext 是否包含冻结 source disclosure
- analyzer 的主要输出：paired D−H、leakage-group cluster bootstrap、delivery、描述性 uptake、status

以上任何一项不得在看到结果后修改。

## 3. 白名单

允许修改：

1. `experiments/campaign/v6/run_v6_source_disclosure_screen.ts`
2. `test/v6-source-disclosure-screen.test.ts`
3. `docs/plans/SOURCE_DISCLOSURE_SCREEN_PHASE1_IMPLEMENTATION_REPORT_2026-08-14.md`，仅同步事实
4. 新建 `docs/experiments/V6_SOURCE_DISCLOSURE_SCREEN_RESULTS_2026-08-14.md`

只读、禁止修改：

- frozen plan JSON
- analyzer（除非存在阻止既定分析的确定性缺陷；若发现，写最小复现并 STOP）
- `src/**`
- `productionVerticalSlice.ts`
- provider adapters 与 DeepSeek invoker
- schema、prompts、HiddenBench 数据、其他实验和 artifact

## 4. WP-A：接入真实 single-attempt CLI（零 provider）

对 runner 做最小修改：

1. 复用 `createDeepSeekSingleAttemptInvoker()`，禁止 `callLLM()`、禁止自建 fetch、禁止任何 retry wrapper。
2. `--execute` 路径加载 `.env.local`，只检查 `DEEPSEEK_API_KEY` 是否存在；不得打印、返回或持久化值。
3. key 缺失时在任何 provider 调用前返回稳定非零状态。
4. 调用现有 `runSourceDisclosureScreenExecute()`；不得复制 vertical-slice 逻辑。
5. 保持 plan 全量重建验证、preflight、预算、exact retry reuse 和 partial-state fail-closed。
6. CLI 成功时只输出 runs/reused/written/calls/tokens，不输出 prompt、private text、truth 或凭据。

补充确定性测试：

- 源码不导入 `callLLM` 或 retrying provider；
- key 缺失时零 invoker 调用；
- CLI 仍是 single-attempt；
- frozen plan 漂移在 provider 前拒绝；
- 完整 run 重试零新增调用；
- 残缺 companion state 在 provider 前拒绝；
- 预算超过上限停止且不再发起下一次调用。

不要为了测试真实 key 而读取 `.env.local`；测试使用注入或源码级边界。

## 5. WP-B：零付费验收与停止点

依次运行：

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/source-disclosure-intervention.test.ts test/v6-source-disclosure-screen.test.ts --reporter=dot
npm.cmd run build
npx.cmd tsx experiments/campaign/v6/run_v6_source_disclosure_screen.ts --plan
npx.cmd tsx experiments/campaign/v6/run_v6_source_disclosure_screen.ts --replay
```

已知机器可能出现 `uv_os_get_passwd ENOMEM`。同一命令最多重试两次；仍失败则报告 MACHINE_BLOCKED，不改业务代码、不跳过测试、不伪造成功。

完成后必须 STOP，给 owner 一份 preflight 报告。没有字面量 `RUN_AUTHORIZED=yes`，不得执行真实 provider。

## 6. WP-C：付费执行（仅在明确授权后）

只有收到 `RUN_AUTHORIZED=yes` 后才执行：

1. 再次确认 frozen plan hash、40 runs、20 pairs、456 planned calls、预算上限不变。
2. 确认输出目录不存在，或只含 exact-retry 可验证的完整 artifact；残缺状态立即停止。
3. 只报告 credential present/absent，不读取或打印值。
4. 执行 `--execute`，顺序运行。
5. 不 retry、不补跑随机失败、不换任务、不换模型、不换 prompt、不调预算、不调阈值、不重抽 seed。
6. 若宿主中断，只能通过相同 plan exact retry；复用完整 replay-verified run，残缺 run fail-closed。
7. 预算触顶、plan/hash mismatch、truth/private leakage、任何 governance action/verification call、五个或以上无法完成的 runs、replay failure 均立即 STOP 并保留现场。

需要记录：

- 精确 provider calls
- prompt/completion/total tokens
- completed/invalid/unavailable/provider-error 数量
- written/reused 数量
- 每个 run 的 terminal 身份
- 是否发生任何 retry、补样本、换题或重抽（预期全否）

## 7. WP-D：重放与只读分析

执行完成后：

1. `--replay` 必须 40/40、零 issue、sealed replay verified。
2. 运行 analyzer；不得在看到结果后修改 analyzer。
3. 报告：
   - 20 个 pair 是否完整；
   - 每个 leakage group 的 pair 数和 mean D−H；
   - pooled paired mean D−H；
   - frozen leakage-group bootstrap median、95% interval、valid fraction；
   - delivery 是否 20/20；
   - exact source-hash hits 与可观测覆盖，仅标 descriptive mediator；
   - provider/invalid terminal 覆盖；
   - 最终 status。

status 解释：

- `SCREEN_PASS`：paired mean < 0，且负方向不只由单一 leakage group 驱动；只表示该动作值得独立复现。
- `QUALITY_STOP`：paired mean ≥ 0；停止 forced disclosure 候选，不调参救结果。
- `MECHANISM_STOP`：披露 delivery 未实际发生；只修 wiring，不解释质量。
- `DEFER`：数据、pair、group 或 bootstrap 完整性不足。

不要把 bootstrap interval 当成 confirmatory significance test，也不要把 `SCREEN_PASS` 写成治理有效、普适、AAMAS-ready 或 causal effect established。

## 8. 结果文档结构

新建结果文档，必须按以下顺序：

1. Status
2. FACT：冻结设计、执行计数、调用/token、artifact/replay
3. FACT：paired 与 cluster-bootstrap 数值
4. FACT：delivery 与描述性 uptake
5. INFERENCE：在当前任务/模型/协议下该动作是否值得复现
6. LIMITATION：8 groups、单模型、HiddenBench 数据投影、非 confirmatory、exact uptake 的非对称可解释性
7. 禁止主张
8. Red-zone 与任何偏离
9. 明确声明：是否读凭据、是否 retry、是否 git 写操作

## 9. 结果后的路线，不得擅自执行

- `SCREEN_PASS`：返回 Codex/owner 冻结一次独立任务或模型 replication。不要自动扩大工程或改 policy。
- `QUALITY_STOP`：冻结负结果，停止该 action；返回 Codex 比较旧版 shuffle/information-access 候选，但不得事后筛选当前结果。
- `DEFER`：只定位缺失来源；不得自动增样本。
- `MECHANISM_STOP`：只修 delivery wiring，并用同一冻结计划重跑；不得改变科学设计。

Claude Code 不负责决定论文主张、修改社会热力学理论、发明新 detector、改变干预家族或宣布 AAMAS readiness。

## 10. 最终回报模板

必须逐项报告：

1. 修改文件；
2. 每个新增测试保护的不变量；
3. preflight 命令及精确结果；
4. 是否收到 `RUN_AUTHORIZED=yes`；
5. 若执行：calls/tokens/artifacts/replay/terminal counts；
6. paired mean、每 group mean、bootstrap interval、delivery、descriptive uptake、status；
7. red-zone；
8. 与冻结计划的任何偏离；
9. 明确声明没有 retry/补样本/换题/重抽/阈值搜索；
10. 未执行 `git add/commit/reset/checkout/clean`。

