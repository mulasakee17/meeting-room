# Source Disclosure Phase 1 — 最小接线实施报告

日期：2026-08-14
状态：**CODEX REVIEWED + PHASE 2 WP-A WIRED — zero provider；plan 冻结（contentHash `sha256:2cbb8699…`）；真实 single-attempt CLI 已接线但受 `RUN_AUTHORIZED=yes` 闸门保护，未执行任何 provider**。
权威：`docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_PHASE1_HANDOFF_2026-08-14.md` + 本报告的 Codex 审核修正 + `docs/plans/CLAUDE_CODE_SOURCE_DISCLOSURE_PHASE2_EXECUTION_HANDOFF_2026-08-14.md`（WP-A/WP-B）。

## 1. 修改文件（仅白名单 5 个）

| 文件 | 类型 |
|---|---|
| `experiments/campaign/v6/run_v6_source_disclosure_screen.ts` | runner / plan builder / CLI / always-ineligible fixture（新建） |
| `experiments/campaign/v6/analyze_v6_source_disclosure_screen.ts` | 只读分析器：authority checks / block-paired D−H / leakage-group bootstrap / status（新建） |
| `experiments/campaign/v6/v6_source_disclosure_screen_v1.plan.json` | 重新冻结的 plan；contentHash `sha256:2cbb8699f7b008121c88dc8c29447afc9022387081f61b76a7e8b406265bd5db`（新建） |
| `test/v6-source-disclosure-screen.test.ts` | 23 项确定性测试（新建；WP-A 增补 gate/无 retry 导入/预算触顶） |
| `docs/plans/SOURCE_DISCLOSURE_SCREEN_PHASE1_IMPLEMENTATION_REPORT_2026-08-14.md` | 本报告（新建） |

未修改 `src/**`、schema、`productionVerticalSlice.ts`、provider adapters、package.json、既有 test、task 数据、artifact 或其他文档。

## 2. 测试保护的不变量（本文件 23 项；聚焦验收共 32 项）

1. 精确 40 runs / 10 tasks / 8 leakage groups / 20 H/D pairs；
2. 每 block H/D 各一，source identity/hash/key 相同（含 `sourceSelectionSeed`、`sourceSelectionKeyHash`、`sourceAgentId`、`sourcePrivateInformationHash`）；
3. plan 确定性（二次构建相等）、执行 order 唯一、两臂 protocol/计划调用数相同；
4. plan 无 truth/outcome/resolution/final-loss/private-plaintext 关键字；
5. H 提交 base publicContext、D 提交 disclosure-augmented context；两臂唯一差异为 publicContext；
6. 计划 provider calls = agentCount×3（无 verification call）；
7. always-ineligible rule 在高 certainty 诊断下返回 ineligible；**slice 冒烟**（high-certainty mock 报告）证明零 verification calls / 零 action transitions / 4 runs 全完成 / 调用数精确；
8. CLI `--plan`(0) / `--replay`(absent→4) / `--execute`（无 `RUN_AUTHORIZED=yes` → 5；有授权但 key 缺失 → 3）全零 provider；`sourceDisclosureExecuteGateV1` 不返回 key 值；runner 不导入 `callLLM`/retrying provider；预算触顶抛 halt；
9. output root 可复用完整且 replay-verified 的 run，精确重试零新增调用；任何 companion-only、损坏或身份不一致的残缺状态在 provider 前拒绝；
10. 路径不逃逸仓库；plan no-replace 且与磁盘一致；
11. analyzer 对 empty/extra/40-dummy 集合的完整性检查分别 fail-closed/通过；
12. paired 算术（手算 D−H）与 leakage-group bootstrap 确定性、validFraction 正确；
13. 单一 leakage group 改善不被判为 screen-wide robust（status 非 SCREEN_PASS）；
14. status gate 对 PASS/MECHANISM_STOP/QUALITY_STOP/DEFER 合成 fixture 确定性；
15. 无网络、sleep、flaky timer、真实 provider。
16. 每个 task 的两个 block 分别重算 D-arm public-context hash，防止把 block-1 的披露来源错误复用于 block-2；
17. analyzer 同时绑定 per-run `taskDefinitionHash` 与 `publicContextHash`；
18. 磁盘 plan 必须与确定性 builder 的完整输出逐字段相等，不能靠自洽重算 hash 换计划；
19. 缺 H/D 任一侧的 pair 不再静默跳过；pair 数、leakage-group 覆盖与 bootstrap 有效率均 fail-closed；
20. exact content-hash 命中只能证明逐字 uptake；零命中不能排除 paraphrase/总结/隐式使用。uptake 因而只作描述性中介，不控制 delivery 的 intention-to-treat 质量判定。

## 3. plan 精确计数

- 任务（冻结顺序）：`13, 18, 28, 33, 38, 39, 45, 47, 50, 55`；
- 8 个 leakage groups：`investigation={13,47}`、`urgent-transfer={33,55}`、`expedition-basecamp={18}`、`rescue-route={28}`、`relief-clinic={38}`、`aircraft-landing={39}`、`post-earthquake-lab={45}`、`secure-meeting-room={50}`；
- 10 tasks × 2 blocks × 2 arms = **40 runs**、**20 H/D pairs**；
- 每 run 计划 provider calls：4-agent tasks ×12、3-agent tasks (33,50) ×9；合计 **456** planned calls（cap 600）；保守 token reserve **912,000**（cap 1,600,000）；该值是预算上界，不是消费预测；
- protocol `epistemic_governance_v1`、model `deepseek:deepseek-chat`、invocation config hash 复用既有；`verificationCalls: 0`；
- runId 命名空间 `run:v6-source-disclosure-screen-v1:task-<N>:block-<b>:<H|D>`（arm 后缀 `:H`/`:D` 无下划线，保证文件名反解唯一）。

## 4. always-ineligible 是否真正零 action/verification

- **是。** 实验侧 rule 始终 `eligible:false`；slice 冒烟测试以 high-certainty（0.99）mock 报告跑通完整 slice，4 个 artifact 均无 `verification-result` 事件、无 `assigned/queued/delivered` transition，且实际 provider 调用数恰为 `4×12=48`（4 runs × 4 agents × 3）。
- 为满足 audit-trail 对 allocation.actionRef 的绑定，fixture 提供**一个克隆的 verification-request 占位 contract**（eligibilityRuleRefs 仅指向 always-ineligible rule），已注册但永不触发；这不实现 sham、不新增 verification call。

## 5. plan 是否含 private plaintext / truth / outcome

- **否。** 关键字扫描：`correct_answer`、`outcome`、`resolution`、`finalLoss`、`groundTruth`、`privateInformation` 全为 0 命中；plan 仅含 runId/taskId/blockId/arm/order/seeds/leakageGroup/source hash 身份/taskDefinition/publicContext hash。H 保存冻结潜在 source 的 identity/hash，不含 private text。

## 6. 精确命令结果

| 命令 | 结果 |
|---|---|
| `git diff --check` | 通过（仅 CRLF 警告） |
| `npx.cmd tsc --noEmit` | exit 0 |
| `npx.cmd vitest run test/source-disclosure-intervention.test.ts test/v6-source-disclosure-screen.test.ts --reporter=dot` | **WP-B：2 files / 32 tests passed**（Phase 2 WP-A 增补后） |
| `npx.cmd vitest run --reporter=dot` | 先前全量通过（1709 passed / 12 skipped）；WP-A 后未重跑全量（聚焦验收已绿） |
| `npm.cmd run build` | exit 0 |
| `npx.cmd tsx ... --plan` | exit 0；contentHash `sha256:2cbb8699…` 与冻结一致；40 runs / 20 pairs / 456 calls / 0 verification |
| `npx.cmd tsx ... --replay` | exit 4；`status: absent`（无 artifact，显式非成功） |
| `npx.cmd tsx ... --execute` | exit 5；`execute_blocked: RUN_AUTHORIZED=yes not present`（未读凭据、未调 provider） |
| `git status --short` | 仅白名单文件；其余 tracked 改动为会话前已存在 |

## 7. Codex 审核发现、修正与边界

- 审核发现并修正一个执行前 P0：原 plan/analyzer 把 block-1 的 D-arm public-context hash 复用于 block-2；当两个 block 披露不同 source 时会拒绝合法 artifact。现改为 per-run hash authority，并有跨所有 task/block 的重算测试。
- 修正预算失真：原 `6840` token estimate 不足以充当 preflight；现改为保守 reserve `912000`。
- 增加 plan 重建、task-definition 绑定、完整重试复用与分析完整性门，未修改 schema 或 V6 核心。
- 纠正一处构念与权限越界：exact hash 零命中只说明当前逐字观测器没有命中，不能推出 Agent 没有使用披露内容。随机处理是 disclosure delivery，故 uptake 降为描述性中介，不再否决 intention-to-treat 质量比较。
- `MECHANISM_STOP` 现在只用于披露未实际送达。screen 仍是 non-confirmatory；8 个 leakage groups 不能支持普适治理主张。
- source selection 不含 arm/runId/output/truth（`sourceSelectionKey` 仅 blockId+taskId+seed）；两臂只改变 publicContext；plan 不含 private plaintext 或 truth。

## 7a. Phase 2 WP-A 接线（零 provider，已完成）

- `runExecuteCli` 接入真实 single-attempt invoker（`createDeepSeekSingleAttemptInvoker()`），但受 `RUN_AUTHORIZED=yes` 字面量闸门保护；无授权时在任何凭据/provider 访问前返回 exit 5。授权后仅加载 `.env.local` 并检查 `DEEPSEEK_API_KEY` **存在性**（不读取/打印/持久化值）；key 缺失返回 exit 3；成功仅输出 `runs/written/reused/calls/tokens`。
- 未复制 vertical-slice 逻辑；保留 plan 全量重建验证、preflight、预算、exact-retry reuse（完整 run 复用零新增调用）、partial-state fail-closed。
- 新增确定性测试：gate（无授权→5、key 缺失→3、key 不泄露值）、runner 不导入 `callLLM`/retrying provider、预算触顶抛 halt。
- 优化项落地：`RUN_AUTHORIZED` 严格字面量 `=== "yes"`；闸门在加载 `.env.local` 之前检查；"single-group robust" 规则与功效不对称解读作为执行前 LIMITATION 待写入结果文档（analyzer 冻结，不改）。

## 8. kernel / runner / analyzer / paid-experiment 真实状态

- kernel（schema-5 vertical slice / governance / replay）：**未修改**，仅通过输入复用；
- runner：**WP-A 已接线但未执行真实 provider**；`--execute` 无 `RUN_AUTHORIZED=yes` 时 blocked（exit 5）；真实执行入口仅接受显式注入的 safe invoker（用于测试）；
- analyzer：**已实现且冻结**；对空输出返回 `DEFER (no artifacts present)`（exit 4），不伪造成功；
- paid-experiment：**0 次真实/付费 LLM 调用**；`--execute` 未被调用。

## 9. 明确声明

未运行真实/付费 LLM、未读取凭据值（`.env`/key 仅做存在性判断）、未修改白名单外文件、未执行 `git add/commit/reset/checkout/clean`。WP-B 验收通过，STOP 等待 owner preflight 批准；未收到 `RUN_AUTHORIZED=yes`，不运行 `--execute`。
