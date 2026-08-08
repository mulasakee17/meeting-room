# Governance Estimate Replay Verification

状态：2026-08-07 实现快照（schema 2.0 引入精确重放）

本文描述对持久化 `GovernanceEstimate` 记录的精确重放验证：它做什么、如何用、
在哪里 fail closed，以及它**不能**证明什么。它与
[EPISTEMIC_QUANTITY_SEMANTICS.md](../architecture/EPISTEMIC_QUANTITY_SEMANTICS.md)
一起构成治理估计量的语义与可审计性规范。

## 1. 为什么需要重放

`inputFingerprint` 单独不足以重放：指纹是摘要，不能重建输入。旧版 schema（1.x）只
持久化指纹与输出，无法从记录本身验证估算器是否真的产生了该输出。

自 schema 2.0 起，每条新记录持久化其 canonical 化的精确 input snapshot。重放流程：
用**存储的** input/config/sourceEventIds 调用**精确的** estimatorId+estimatorVersion，
比较重算出的 input/config/output 指纹、canonical 输出与确定性元数据。

## 2. Schema 1 vs Schema 2

| | Schema 1.x（旧） | Schema 2.0（新） |
|---|---|---|
| `governanceEstimateHistory[].record.input` | 无 | 有（canonical 快照） |
| 可重放性 | `legacy_unverifiable` | 逐条可验证 |
| `rawSchemaVersion` 字段 | 无（视为 1.0） | `"2.0"` |
| `CognitiveStateSnapshot.susceptibility` | 可能为逐轮混合值 | 恒等于 `socialUpdateGain` |
| 行为易感性 | 无独立字段 | `behavioralSusceptibility*` 独立字段 |

schema 版本只由 `rawSchemaVersion` 决定；绝不根据时间戳推断，绝不重写旧文件。旧文件
按现状读取（兼容），但**不会被标为已重放验证**。

## 3. 精确重放输入

每条 schema-2 记录必须持久化：

- `estimatorId` + `estimatorVersion`（精确选择，绝不解析"最新"，绝不降级）；
- `input`：canonical JSON-compatible 快照（不是编码后的 JSON 字符串）；
- `config`：完整配置（不是 partial merge）；
- `sourceEventIds`：排序去重的字符串数组；
- `inputFingerprint` / `configFingerprint` / `outputFingerprint`；
- `determinism`：`deterministic` 或带 seed/seedField 的 `seeded`；
- `value`：canonical 输出。

执行路径（`GovernanceEstimatorRegistry.project`）在执行前验证输入与配置、执行后验证
输出；对执行所用值做 canonical clone 并 freeze；返回给调用方的 input/config/value 是
fresh clone，调用方 mutation 不能污染 registry 内部。

## 4. CLI 用法与退出码

```text
npm run verify:replay -- <raw-file-or-directory> [--allow-legacy-unverifiable] [--allow-absent]
```

- 接受单个 JSON 文件或递归扫描目录（code-point 排序，忽略派生文件与 `.error.json`）。
- 逐条验证 `governanceEstimateHistory` 记录；同时校验 run 级不变量：
  - `round` 为 ≥ 1 的 safe integer 且不超过 `totalRounds`（若存在）；
  - `agentId` 为非空字符串；
  - `(round, agentId)` 唯一；
  - `record.input.round` / `record.input.agentId` 与外层身份一致（防重新归属）；
  - `progressive_icl:*` 命名规则仅对渐进估算器生效；
  - schema-2 下同一 run 只允许一个 estimator id/version。
- 统计五类记录状态（verified / mismatch / legacy-unverifiable / unsupported / invalid）
  与 run-level issue。

退出码（fail-closed）：

| 场景 | 默认 | `--allow-legacy-unverifiable` | `--allow-absent` |
|---|---|---|---|
| 全部 verified | 0 | 0 | 0 |
| 存在 legacy-unverifiable | 非 0 | 0 | 非 0（legacy 只由该 flag 放行） |
| 零记录且 ≥1 候选文件、无 hard failure | 非 0 | 非 0 | 0（打印 absent 警告） |
| 空目录 / 零文件 | 非 0 | 非 0 | 非 0 |
| mismatch / unsupported / invalid / run issue | 非 0 | 非 0 | 非 0 |
| 路径不存在 / 不可读 / invalid JSON | 2 | 2 | 2 |

两个 flag 各自只放行各自状态；任何 hard failure 始终失败。`--allow-absent` 不隐式
放行 legacy。

## 5. run-level verifier 与审计 manifest

run 级验证逻辑位于纯模块 `experiments/campaign/replayVerifier.ts`（无 `main()`、
无 `process.exit`、无顶层文件读取、导入无副作用）。CLI（`verify_replay.ts`）只做文件
适配与退出码决策；`generate_manifest.ts` 复用同一 verifier 与 `deriveReplayStatus`，
禁止较弱的重复实现。

统计自洽：`sum(counts) === recordCount`；身份/一致性/混合版本问题计入 run-level
`runIssues`，不污染记录级计数。

manifest 附加元数据（additive，SHA-256 行为不变）：

- `rawSchemaVersion`
- `governanceEstimateCount`
- `governanceReplayStatus`：`verified | mixed | legacy_unverifiable | absent`

## 6. Confirmatory analysis guards（E6 / E8）

E6（状态解耦）与 E8（行为易感性中介）共用同一 confirmatory 状态机：

```ts
type ConfirmatoryAnalysisStatus =
  | "computed"               // 唯一的 inferential 状态
  | "insufficient_data"      // schema-2 有效但不足（数量/可辨识性）
  | "legacy_mixed_excluded"  // 全部为 schema-1 混合易感性，不产生 claim
  | "invalid_data";          // 任一 schema-2 观测契约损坏 → 整个分析失效
```

只有 `computed` 携带或暴露推断量。以下规则对 E6 与 E8 均成立：

- 只用 schema-2 数据；schema-1 数据标记 `legacy_mixed_excluded`（按各自的观测单位
  计数：**E6 的观测单位是 snapshot，E8 的观测单位是 transition**，n 个有序 snapshot
  最多形成 n-1 个 transition）。
- `behavioralSusceptibilityUsable === false` 是**预期缺失**，计入
  `unusableObservationCount`；在剩余有效数据足够时允许被排除。
- 任一 malformed schema-2 观测使**整个对应分析**为 `invalid_data`，绝不静默绕开
  损坏观测继续 `computed`。malformed 包括：缺失 `usable`/`estimate`/`confidence`、
  `NaN`/`Infinity`、越界 `[0,1]`、`susceptibility !== socialUpdateGain`、非法/重复
  round 顺序、utility 含非有限值。
- 非 `computed` 状态不得产生科学图、p 值表、效应量 claim 或确认假设的摘要。
- 统计测试（`StatisticalTest`）对非 `computed` 的 E6/E8 一律映射为
  `significant=false`、`pValue=1`、`analysisStatus=<源状态>`、显式 no-confirmatory 结论。

### E6 特有

- confirmatory 推断只用 **per-run paired bootstrap**；旧 snapshot-level Fisher-z 回退
  是伪复制且已被移除，不是 confirmatory。
- 至少两个 eligible run（每个 ≥5 个有效 snapshot）才可能 `computed`；不足 →
  `insufficient_data`。
- 相关矩阵相关系数收敛于 `[-1, 1]`；完全共线时 VIF 显式封顶（≤100），禁止
  Infinity 在 JSON 中静默变成 null。

### E8 特有

- 每条 transition 两端都必须满足 schema-2 snapshot 契约且严格向前（`round` 递增）；
  违反即 malformed。
- 最小数学可识别性：至少 3 个有效 transition，且 inertia、行为易感性及其对 inertia
  回归后的残差都必须有可观测变化；不足 → `insufficient_data`，不产生退化的
  `computed` 结果。
- `computed` 结果只基于 schema-2 usable 行为易感性；绝不 substitute
  `socialUpdateGain`，绝不与 schema-1 混合值合并；所有持久化数字必须是有限值。

## 7. 能力边界与显式限制

- 重放验证证明记录内部一致性与确定性重放；它**不**证明 `sourceEventIds` 对应的事件
  真实存在或属于该 agent/round。真正的 provenance authenticity 需要与不可变事件账本
  交叉引用，属未来工作。
- 确定性声明是 estimator contract 的声明和可测试 invariant，不是对任意第三方
  estimator 代码的形式证明。
- 证据 telemetry（事件被记录）不是验证；行为响应（exposure 后改变立场）不是因果效应。
- 跨 schema 比较 `CognitiveStateSnapshot.susceptibility` 是无意义的：schema-1 是逐轮
  混合值，schema-2 恒等于 `socialUpdateGain`。新分析 MUST 按 `rawSchemaVersion`
  分流并使用独立字段。

## 8. 验证声明

以下数字来自本批次结束时的实际命令输出：

- `npx tsc --noEmit` 通过；
- 全量测试 40 个文件、857 项通过、3 项按既有设置跳过；
- `npm run build`（next build）通过；
- `git diff --check` 无空白错误。
