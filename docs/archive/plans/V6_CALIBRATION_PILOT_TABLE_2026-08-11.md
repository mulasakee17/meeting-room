# V6 Calibration Pilot 表（冻结）

日期：2026-08-11。状态：**冻结的执行规格**。可执行版本 = `experiments/campaign/v6/analyzeV6Calibration.ts`（Gate D5：从纯 fixture artifact 从零生成同一张表，禁止人工复制指标）。

本表只服务于 Day 6 calibration/variance pilot 与 Go/Revise/Stop 决策；**不是 confirmatory 估计器**。所有值为 `calibration/exploratory`。

## 1. Primary（估计目标）

| 指标 | 定义 | 状态 |
|---|---|---|
| primary operational metric | registered-agent ITT pooled Brier（`OPERATIONAL_POOLED_BRIER_ESTIMAND_V1`），π0 = uniform（binary 0.5），denominator = N_registered 不缩水 | 已实现 |
| primary contrasts | **B−T**、**G−B**（per family，基于 mean operational Brier） | 已实现（`computeV6Contrasts`） |

## 2. Secondary

| 指标 | 定义 | 状态 |
|---|---|---|
| accuracy | `taskOutcome.quality`（pooled-decision 准确率投影，非 primary） | 已实现 |
| coverage | answered rate = answered / N_registered | 已实现 |
| missingness | 四类 terminal 计数：answered / abstained / invalid / unavailable | 已实现 |
| cost | run-level `tokenUsage.totalTokens`（provider 实际计量） | 已实现 |
| latency | run-level `tokenUsage.totalLatencyMs` | 已实现 |

## 3. Mechanistic（exploratory，只作 process analysis）

| 指标 | 定义 | 状态 |
|---|---|---|
| trigger rate | G runs 中 eventAssignments > 0 的比例 | 已实现 |
| arms | apply / holdout / sham 计数 | 已实现 |
| delivery | G runs 中 `compliance_observed` 的比例 | 已实现 |
| false-consensus | 待定义（讨论后高一致性但错误） | 仅规格，未实现 |
| cascade/recovery | 待定义（意见级联与恢复） | 仅规格，未实现 |
| influence concentration | 待定义（发言/影响力集中度） | 仅规格，未实现 |
| F/diagnosis 等 mediator | 只作 secondary/exploratory，**不改变 primary outcome** | 纪律声明 |

## 4. 冻结的纪律

- **threshold calibration 只使用 calibration tasks**，禁止读取 confirmatory outcomes。
- **Stage-2 只作 exploratory process analysis**（apply/holdout/sham 不作为 primary 对比）。
- mediator（F、diagnosis、influence 等）永不改写 primary operational Brier 或 missingness/pooling 规则。
- 任一自洽重算篡改被跨对象 replay 拒绝（kernel 已有保证，matrix 测试验证）。

## 5. 实现与 Gate D5

`analyzeV6Calibration.ts`：
- `analyzeV6RawRun(artifact)` → 单 run 行（primary/secondary/mechanistic 全字段）。
- `aggregateV6CalibrationTable(rows)` → (family × protocol) 聚合。
- `computeV6Contrasts(aggregates)` → B−T / G−B。
- `analyzeV6CalibrationDir(dir)` → 从目录 artifact 生成同一张表（确定性、排序稳定）。

Gate D5 验证（`test/v6-calibration-matrix.test.ts`）：纯 mock fixture artifact 上从零生成表，两次运行字节一致；单 run 行的 Brier 与 artifact 一致；无人工复制指标。

## 6. 当前数据基线（真实 artifact，calibration 意图）

见 `experiments/campaign/pilot_output/v6-smoke-cal`、`v6-smoke-cal07`、`v6-network-fault-cal`（2026-08-11，均为 calibration/exploratory）：

| family | 批次 | runs | trigger | arms | opBrier(T/B/G) | accuracy |
|---|---|---|---|---|---|---|
| distributed-binary | cal (0.65) | 6 | G 2/2 | apply:1,holdout:1 | 0.205/0.203/0.214 | 1.0 |
| distributed-binary | cal07 (0.7) | 5 G | 5/5 | apply:3,sham:1,holdout:1 | — | 1.0 |
| network-fault | cal (0.65) | 6 | G 2/2 | apply:1,sham:1 | 0.951/0.565/0.606 | **0.0** |

**Day 6 关键读数：**
1. **触发率刀锋与任务族无关**：两族 G run 的 observation certainty 恒为 0.70（threshold 0.65/0.7 → 100% 触发；0.71+ → 0%）。健康中间触发率在冻结流水线 + 当前模型下**结构性不可达**（观察层只看 agent A 首轮，temperature 0 下 p 恒定 0.70）——REVISE 而非 STOP。
2. **network-fault 任务设计缺陷**：evidence 一致指向 S7（A：S7 BGP flap 40min；B：S9 冗余路径正常 ⇒ 故障在 S7 侧），但 truth=false → 模型系统性判 S7，accuracy 全 0。**该任务族在确认前必须重设计**（改 truth 或改 evidence 使信息真正冲突），由 owner/Codex 决定。
3. go/no-go：replay 100% ✓、有效回答率 100% ✓、run 完成率 100% ✓、无内部重试 ✓、token/latency 足估预算 ✓、**G 非退化触发率 ✗**、**结构性 ceiling/floor ✗（network-fault）**。


