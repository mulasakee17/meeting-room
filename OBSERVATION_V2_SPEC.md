# ObservationLayer V2 — 结构化偏好提取升级

## 目标

将 Agent 输出从单一标量 `{"emotion": ..., "reasoning": ...}` 升级为**每选项独立的信念+排名**结构化输出。实现：

1. 排名直接提取（不再依赖 `indexOf` 启发式）
2. 五维评估从"整体信念"升级为"按选项分别评估"（共识度、离散度、稳定性精度全部提升）
3. 保持完全向后兼容

## 核心设计

每个 Agent 每轮输出：

```json
{
  "reasoning": "BetaCore利润率和市场规模最优，AlphaTech次之...",
  "evidence": ["BetaCore利润率42%", "AlphaTech技术护城河4/5"],
  "belief": -1 to 1,
  "confidence": 0 to 100,
  "nextOpinion": "...",
  "referencedAgents": ["a2", "a4"],
  "itemBeliefs": [
    {"item": "BetaCore (企业服务)",  "rank": 1, "belief": 0.8,  "confidence": 90},
    {"item": "AlphaTech (AI芯片)",   "rank": 2, "belief": 0.4,  "confidence": 70},
    {"item": "GammaEdge (边缘计算)", "rank": 3, "belief": -0.3, "confidence": 60}
  ]
}
```

- `rank`：智能体认定的排名（1=最优），用于排名提取
- `belief`：对**该选项**的偏好程度（-1=强烈反对, 0=中立, 1=强烈支持），用于五维评估
- `confidence`：对该选项判断的置信度

## 改动范围（7 个文件，~60 行）

### 1. `src/lib/discussion/types.ts` — 加类型定义

在 `AgentOpinion` 接口（第 1-9 行）末尾加可选字段：

```typescript
export interface ItemBelief {
  item: string;
  rank: number;
  belief: number;
  confidence: number;
}

export interface AgentOpinion {
  agentId: string;
  reasoning: string;
  evidence: string[];
  belief: number;
  confidence: number;
  nextOpinion: string;
  referencedAgents: string[];
  /** Per-item preferences (V2). Optional for backward compatibility. */
  itemBeliefs?: ItemBelief[];
}
```

同时在 `DiscussionMemoryEntry`（第 18-27 行）也加 `itemBeliefs?: ItemBelief[]`，让下一轮的 memory context 包含上一轮的按选项偏好。

---

### 2. `src/lib/discussion/index.ts` 第 632-640 行 — 更新 buildPrompt() 的 JSON 模板

把 JSON 模板从：

```json
{
  "reasoning": "Your detailed analysis...",
  "evidence": ["evidence1", "evidence2"],
  "belief": -1 to 1 (negative = against, positive = for),
  "confidence": 0 to 100,
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"] (agents you reference or respond to)
}
```

改为：

```json
{
  "reasoning": "Your detailed analysis...",
  "evidence": ["evidence1", "evidence2"],
  "belief": -1 to 1 (negative = against, positive = for),
  "confidence": 0 to 100,
  "nextOpinion": "What you want to discuss next",
  "referencedAgents": ["agent_1", "agent_2"],
  "itemBeliefs": [
    {"item": "Company A", "rank": 1, "belief": 0.8, "confidence": 95},
    {"item": "Company B", "rank": 2, "belief": 0.2, "confidence": 70}
  ]
}
```

并在 prompt 文字中补充说明：`itemBeliefs` 中的 `belief` 是对该选项的独立偏好（-1=反对, 1=支持），`rank` 是你认为的排名（1=最优）。

---

### 3. `src/lib/discussion/index.ts` 第 643-647 行 — 更新 checkConvergence()

当前收敛判断只看整体 belief 标准差：

```typescript
private checkConvergence(opinions: AgentOpinion[]): boolean {
  if (opinions.length < 2) return true;
  const beliefs = opinions.map(o => o.belief);
  const meanBelief = beliefs.reduce((sum, b) => sum + b, 0) / beliefs.length;
  const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);
```

改为：如果 opinions 中有 itemBeliefs，按选项分别检查收敛——对每个选项算跨智能体 belief 标准差，所有选项的 std 都低于阈值才算收敛。如果没有 itemBeliefs，退回当前逻辑。

```typescript
private checkConvergence(opinions: AgentOpinion[]): boolean {
  if (opinions.length < 2) return true;

  // V2: per-item convergence — all items must be converged
  if (opinions[0]?.itemBeliefs && opinions[0].itemBeliefs.length > 0) {
    const items = opinions[0].itemBeliefs.map(ib => ib.item);
    for (const item of items) {
      const itemBeliefs = opinions
        .map(o => o.itemBeliefs?.find(ib => ib.item === item)?.belief)
        .filter((b): b is number => typeof b === "number");
      if (itemBeliefs.length < 2) continue;
      const mean = itemBeliefs.reduce((s, b) => s + b, 0) / itemBeliefs.length;
      const std = Math.sqrt(itemBeliefs.reduce((s, b) => s + Math.pow(b - mean, 2), 0) / itemBeliefs.length);
      if (std > this.config.convergenceThreshold) return false;
    }
    return true;
  }

  // V1 fallback: overall belief convergence
  const beliefs = opinions.map(o => o.belief);
  const meanBelief = beliefs.reduce((sum, b) => sum + b, 0) / beliefs.length;
  const beliefStd = Math.sqrt(beliefs.reduce((sum, b) => sum + Math.pow(b - meanBelief, 2), 0) / beliefs.length);
  return beliefStd <= this.config.convergenceThreshold;
}
```

---

### 4. `src/lib/observation/index.ts` 第 32-40 行 — 同步更新 DefaultPromptBuilder

同步骤 2，把 `DefaultPromptBuilder.buildPrompt()` 里的 JSON 模板同步加 `itemBeliefs` 字段（含 belief）。

---

### 5. `src/lib/observation/index.ts` 第 52-62 行 — 更新 parseOpinion()

在 `DefaultOpinionParser.parseOpinion()` 的 return 对象里加：

```typescript
itemBeliefs: Array.isArray(parsed.itemBeliefs)
  ? parsed.itemBeliefs.filter(
      (ib: any) => typeof ib.item === "string"
        && typeof ib.rank === "number"
        && typeof ib.belief === "number"
    ).map((ib: any) => ({
      item: ib.item,
      rank: ib.rank,
      belief: Math.max(-1, Math.min(1, ib.belief)),
      confidence: typeof ib.confidence === "number" ? Math.max(0, Math.min(100, ib.confidence)) : 50,
    }))
  : undefined,
```

---

### 6. `experiments/v2/run.ts` 第 131-140 行 — 重写 extractRanking()

核心改动：**5 个智能体的 itemBeliefs 聚合为集体排名**——对每个选项取平均 rank，按平均 rank 排序。

```typescript
function extractRanking(
  decision: string,
  itemNames: string[],
  itemBeliefs?: Array<{ item: string; rank: number; belief: number; confidence: number }>
): string[] {
  // V2: aggregate multiple agents' itemBeliefs into collective ranking
  if (itemBeliefs && itemBeliefs.length > 0) {
    // Group by item, compute average rank
    const itemRanks = new Map<string, number[]>();
    for (const ib of itemBeliefs) {
      if (!itemRanks.has(ib.item)) itemRanks.set(ib.item, []);
      itemRanks.get(ib.item)!.push(ib.rank);
    }
    // Average rank per item, then sort ascending (rank 1 = best)
    const avgRanks = itemNames.map(name => {
      const ranks = itemRanks.get(name);
      return { name, avgRank: ranks && ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : Infinity };
    });
    avgRanks.sort((a, b) => a.avgRank - b.avgRank);
    return avgRanks.map(r => r.name);
  }
  // V1 fallback: first-mention-position heuristic
  const positions = itemNames.map(name => {
    const shortName = name.split("(")[0]?.trim() || name;
    const idx = decision.indexOf(shortName);
    return { name, pos: idx >= 0 ? idx : Infinity };
  });
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map(p => p.name);
}
```

---

### 7. `experiments/v2/run.ts` 第 206-217 行 — 更新 createAgents() 的 systemPrompt

在 systemPrompt 的 JSON 格式说明中同步加 `itemBeliefs` 字段，并明确说明：

```
4. 最终以JSON格式给出你的判断，格式：
{
  "reasoning": "你的分析",
  "evidence": ["证据1", "证据2"],
  "belief": -1到1 (整体倾向),
  "confidence": 0到100,
  "nextOpinion": "下一步讨论方向",
  "referencedAgents": ["a2"],
  "itemBeliefs": [
    {"item": "BetaCore (企业服务)", "rank": 1, "belief": 0.8, "confidence": 90},
    {"item": "AlphaTech (AI芯片)", "rank": 2, "belief": 0.3, "confidence": 70},
    {"item": "GammaEdge (边缘计算)", "rank": 3, "belief": -0.4, "confidence": 60}
  ]
}

itemBeliefs中：
- rank: 你认为的排名（1=最优，2=次优...）
- belief: 对该选项的独立偏好（-1=强烈反对, 0=中立, 1=强烈支持）
- confidence: 对该选项判断的置信度（0-100）
```

---

### 8. `experiments/v2/run.ts` — 更新 extractRanking() 调用点

两处调用都需要从 **该轮所有智能体的 opinions** 中收集 itemBeliefs：

**第 423 行（最终 τ）**：

```typescript
// 从所有轮次的所有 agent 收集 itemBeliefs
const allItemBeliefs = result.roundResults
  .flatMap(r => r.opinions)
  .flatMap(o => o.itemBeliefs || []);
const extractedRanking = extractRanking(finalDecision, itemNames, allItemBeliefs);
```

**第 442 行（每轮 τ）**：

```typescript
// 从该轮的 agent opinions 中收集 itemBeliefs
const roundItemBeliefs = rr.opinions.flatMap(o => o.itemBeliefs || []);
const roundRanking = extractRanking(roundReasoning, itemNames, roundItemBeliefs);
```

---

## 不改的部分

- 治理引擎（4 个检测器）——零改动
- 干预策略——零改动
- analyze.ts——零改动（直接读 JSON 中预计算的 kendallTau）
- sensitivity.ts——零改动

## 向后兼容

- `itemBeliefs` 是可选字段，旧数据没有 → `undefined` → parser 跳过 → `extractRanking` 走 `indexOf` fallback
- `checkConvergence` 检测到没有 itemBeliefs 时退回 V1 逻辑
- 旧实验 JSON 里的 τ 值不变，analyze.ts 直接读预计算值
- 新旧数据可混合

## 验证步骤

1. `npx tsc --noEmit` — 零新错误
2. `npx vitest run` — 112 tests pass
3. 跑 2 次对比实验：Invest full mode，旧 prompt vs 新 prompt，各 n=2。对比 τ 差异和 itemBeliefs 解析成功率。
