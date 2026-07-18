# SwarmAlpha 实验全景与设计缺陷复查

> 2026-07-18，基于全部实验脚本和数据的完整复查

---

## 一、当前实验全景

### 实验线 1：治理消融矩阵（核心线）

**脚本**：`experiments/v2/run.ts`

**设计**：被试间设计。每次实验 = 5 个 agent × 3 轮同步讨论，每组 n=15-30。

**任务 × 条件矩阵**：

| 任务 | none | full | shuffle | 单干预模式 | 每格 n | 总实验数 |
|------|------|------|---------|-----------|--------|---------|
| M&A（历史） | ✅ | ✅ | ✅ | ✅ (4 种) | 15 | ~105 |
| Crisis | ✅ | ✅ | ✅ | — | 24 | 72 |
| Supplier | ✅ | ✅ | ✅ | — | 30 | 89 |
| **合计** | | | | | | **~266** |

**条件定义**：

| 条件 | 检测 | 干预 | 目的 |
|------|------|------|------|
| `none` | ❌ | ❌ | 基线——agent 自由讨论 |
| `full` | ✅ 4 种 | ✅ 定向 | 完整治理 |
| `shuffle` | ✅ | ✅ | 将每个 agent 的独有知识旋转 +2，打破角色-信息一致性。回答"治理效果来自信息整合还是讨论机制本身" |
| `full_diversity` | 仅回声室 | 仅多样性 | 单干预消融 |
| `full_weight` | 仅权威偏差 | 仅减权 | 单干预消融 |
| `full_reflection` | 仅极化 | 仅反思 | 单干预消融 |
| `full_continue` | 仅过早共识 | 仅延长 | 单干预消融 |

**核心指标**：Kendall's τ（排名相关性）、consensusLevel（1 - 2×std(beliefs)）、干预有效率

**统计方法**：Cohen's d + 95% bootstrap/t CI + 置换检验 p-value（10000 次）

---

### 实验线 2：异步引擎 ABCD（引擎验证线）

**脚本**：`experiments/v2/run_async_ab.ts`

**设计**：被试间。5 个 agent 异步发言（content_driven 发言意愿），10 次/组。

| 组别 | 发言模式 | 终止逻辑 | 目的 |
|------|---------|---------|------|
| A | 同步全员 | 固定 5 轮 | 同步基线 |
| B | 异步 content_driven | 固定 5 轮 | 异步 vs 同步（H_async） |
| C | 异步 content_driven | 热力学自适应 (R/T/H/F) | 热力学终止 vs 固定轮次（H_thermo） |
| D | 异步 content_driven | 从 C 分布随机采样 | 热力学诊断 vs 随机（H_diag） |

**核心指标**：Kendall's τ、thermoHistory (R/T/H/F 完整轨迹)、totalUtterances

**v2 任务增强**（TASK_FRAUD）：增加干扰项（lead 4 有看似强但无关的证据）、信息盲区（a5 数据部分过时）、对抗性偏见（a4 偏好 lead 3）、交叉验证需求（lead 2 需 B+C 联合证据）

---

### 实验线 3：干预有效性分析

**脚本**：`interventionAnalysis.ts`

对全部历史实验中每个干预事件做效果拆解：有效/无效/有害（Δτ > 0.05 / 在 ±0.05 / < −0.05）。按干预类型、轮次、任务分层。计算 token 成本效益比。

---

### 实验线 4：机制消融分析

**脚本**：`mechanismAnalysis.ts`

将治理效果按干预类型拆解：reduce_weight vs force_reflection vs introduce_diversity vs continue_discussion。跨 Crisis + Supplier 验证一致性。使用置换检验对比每类干预的有效 vs 无效轮次的 Δτ。

---

### 实验线 5：因果分析

**脚本**：`causalAnalysis.ts`

最近邻匹配（propensity score matching on baseline τ）+ 置换检验，将"治理 vs 无治理"的观测对比升级为准实验因果推断。

---

### 实验线 6：辅助分析

| 脚本 | 功能 |
|------|------|
| `verifyFindings.ts` | 验证三个核心发现（虚假共识、药物动力学、shuffle 上限） |
| `verifyBlindSpot.ts` | 验证信息盲区设计是否生效 |
| `bayesianAnalysis.ts` | 贝叶斯参数估计 + 后验分布 |
| `powerAnalysis.ts` | 统计功效计算 + 所需样本量估计 |
| `sensitivity.ts` | 5 参数 × 5 值的参数敏感性扫描 |
| `ab_fdecomposition_paired.ts` | F 分解排序 vs 固定排序的配对 A/B 检验 |

---

## 二、设计缺陷复查

### 🔴 严重缺陷

#### 缺陷 1：extractRanking 的两种提取路径不一致

```typescript
// 路径 A：V2 itemBeliefs 聚合（平均排名）
if (itemBeliefs && itemBeliefs.length > 0) {
  // 取每个 item 的平均 rank
}

// 路径 B：V1 fallback 首次提及位置
// 如果 itemBeliefs 为空，回退到字符串搜索
```

**问题**：两条路径对同一正确答案可能产生不同排名。路径 A 用 agent 显式的 `itemBeliefs.rank`，路径 B 用 LLM 输出文本中关键词首次出现的位置。某些 agent 可能不输出 `itemBeliefs`（JSON 解析失败），导致静默降级到路径 B。**两条路径的 τ 不可直接对比**——可能系统性偏差。

**修复**：统一提取逻辑，或将两条路径的 τ 分别报告。

#### 缺陷 2：consensusLevel 操作化与热力学引擎不一致

```typescript
// run.ts 中的 consensusLevel：
consensusLevel = 1 - stdDev(beliefs) * 2  // Kuramoto-like，范围 [0,1] 但可超出

// asyncEngine.ts 中的真实 R：
R = |Σ e^(i*θ_j)| / N  // 真正的 Kuramoto 序参量
```

**问题**：治理实验报告的 `consensusLevel` 不是异步引擎中使用的 R。`1-2*std` 在信念 [-1,1] 均匀分布时 std≈0.58 → consensusLevel≈−0.16（不应为负）。而真正的 R 始终 ∈ [0,1]。两个指标在中等离散度区域可能给出相反的趋势判断。

**修复**：统一使用 Kuramoto R，或至少钳制到 [0,1]。

#### 缺陷 3：shuffle 旋转确定性（+2 固定偏移）

```typescript
// 每次 shuffle 都是 agent[i] ← agent[(i+2)%5].knownItems
const rotatedAgents = task.agents.map((agent, i) => ({
  ...agent,
  knownItems: task.agents[(i + 2) % n].knownItems,
}));
```

**问题**：所有 shuffle 实验的信息破坏模式完全相同。无法区分"shuffle 效应"和"这个特定 +2 旋转的效应"。如果 +2 旋转恰好制造了特别有利/不利的信息分布，结论会偏。

**修复**：每次 shuffle 运行时随机化旋转偏移量（`(i + rng() * (n-1)) % n`）。

---

### 🟡 中等缺陷

#### 缺陷 4：单模型 + 单温度

全部 376 次实验使用 DeepSeek-V3 + temperature=0.2。没有：
- 跨模型验证（GPT-4o、Claude 等）
- 温度敏感性（T=0 确定性和 T=1 创造性下的治理效果可能完全不同）
- 模型规模梯度（小模型 vs 大模型的一致性问题可能更严重）

**影响**：虚假共识（r≈0）发现可能是 DeepSeek-V3 的特异性行为。

#### 缺陷 5：纯被试间设计——无法控制组间方差

每个实验是独立的。同一个随机种子下，`none` 和 `full` 的实验使用不同 seed（`seed = 42 + runIndex`），但条件间无配对。组间方差（有些 seed 恰好产生好/差的讨论）可能掩盖或放大治理效果。

**已有缓解**：大样本（n=24-30）部分平滑了组间方差。但配对设计（同一 seed 下 none 和 full 跑相同初始条件）会更敏感。

#### 缺陷 6：干预有效性阈值 0.05 无标定

```typescript
effect.effective = delta > 0.05; // 任意阈值
```

agent 信念的自然波动幅度未知。0.05 可能过高（错过真实但微小的干预效果）或过低（将随机噪声误判为有效）。

#### 缺陷 7：task_supplier 天花板效应

Supplier `none` τ=0.68。满分 τ=1.0，但随机排序 τ≈0。留给人机协作改进的空间只有 0.32。0.68 到 0.77 的提升（full τ=0.767）Δτ=+0.087，d=0.47——效应中等但天花板压制了改进幅度。

**影响**：Supplier 任务无法充分测试治理的上限——即使完美治理也无法超过 τ=1.0，但 0.68 的基线已经很高。适合用于验证"治理不有害"而非"治理大幅改进"。

---

### 🟢 轻微缺陷

#### 缺陷 8：仅 FlatTopology 验证

全部实验使用圆桌讨论（所有 agent 看到所有消息）。已实现但未实验验证的拓扑：GroupedTopology（分组讨论 + 代表汇报）、CommitteeTopology（委员会分层）。虚假共识（r≈0）可能在分组拓扑中更严重（组内回音室效应）。

#### 缺陷 9：仅排序任务

全部任务使用 Kendall's τ 排名。未测试：分类（多选一）、估计（连续值预测）、生成（开放文本质量）。共识-质量关系可能因任务类型而异。

#### 缺陷 10：3 轮限制

PARAMS.maxRounds=3。选择 3 轮的理由合理（治理干预需要多轮才能生效，第 1 轮信息分享、第 2 轮辩论、第 3 轮收敛），但异步引擎实验显示 28 次发言才收敛——同步 3 轮（15 次发言）可能过早截断。

#### 缺陷 11：无"个体判断"基线

没有"agent 独立判断、不讨论"的对照条件。这无法回答"讨论本身是否有用"——只能回答"治理讨论 vs 无治理讨论"。shuffle 部分回答了"信息整合的理论上限"，但不回答"讨论 vs 不讨论"。

#### 缺陷 12：Kendall's τ 仅测量排序一致性

τ 测量的是排名顺序匹配，但不测量：
- 排名之间的"距离"（将第 1 名错排为第 5 名 vs 第 2 名的惩罚相同）
- 排名的置信度校准
- 部分正确（前 2 名对但后 3 名错）

对于某些应用，Weighted τ 或 NDCG 可能更有信息量。

---

## 三、实验设计的优势（不应忽视）

1. **统计严谨性**：置换检验 + Cohen's d + bootstrap CI 的组合避免了参数假设。mulberry32 种子 PRNG 保证可复现。
2. **shuffle 对照的方法学创新**：通过打破角色-信息一致性同时保留信息总量，分离了"信息整合"和"讨论机制"的贡献。这是此项目最有原创性的方法论贡献。
3. **跨任务验证**：Crisis + Supplier 双任务独立验证，场景和基线难度不同——增强了发现的普适性。
4. **错误隔离**：run.ts 和 run_async_ab.ts 都有 try-catch + 重试 + 错误占位文件。单个实验失败不会中止整批。
5. **干预效果验证**：不仅记录"是否干预"，还测量干预后实际信念变化 > 0.05——区分了名义干预和实际有效干预。
6. **热力学轨迹完整保存**：async 实验保存了每 2 次发言的 R/T/H/F 完整快照，支持事后深度分析（如阈值标定的逐例尸检）。
7. **callLLM 重试**：providers.ts 的 3 次指数退避重试覆盖全部实验链路。

---

## 四、优先级修复建议

| 优先级 | 缺陷 | 工作量 | 影响 |
|--------|------|--------|------|
| **P0** | #1 extractRanking 双路径不一致 | 小（统一到 itemBeliefs 路径，删除 fallback） | 消除系统性 τ 偏差 |
| **P0** | #2 consensusLevel 操作化不一致 | 小（替换为真正的 Kuramoto R） | 统一共识度量 |
| **P1** | #3 shuffle 旋转随机化 | 小（改 1 行 + 改 seed 传递） | 消除固定旋转的混淆 |
| **P1** | #7 Supplier 天花板效应 | 中（设计更难的新任务或增强 Supplier） | 提升治理区分度 |
| **P2** | #4 跨模型验证 | 大（需 API key + 重跑全部实验） | 验证普适性 |
| **P2** | #5 配对设计 | 中（需改实验框架支持固定 seed 配对） | 提升统计功效 |
| **P3** | #11 个体判断基线 | 小（单 agent 判断，无讨论） | 确定讨论的边际价值 |
| **P3** | #10 轮次灵活性 | 中（改 PARAMS + 收敛阈值自适应） | 避免过早截断 |
