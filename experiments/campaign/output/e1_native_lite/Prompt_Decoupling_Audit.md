# Prompt Decoupling Audit — Phase 4A Part 1

> SwarmAlpha NativeCognitiveEngine.buildPrompt Belief Leakage 审计
>
> 生成时间: 2026-07-24

---

## 1. 当前 Prompt 中哪些字段来自 belief layer?

审计 [nativeCognitiveEngine.ts:160-246](file:///c:/Users/贺孟元/Desktop/swarmalpha/src/lib/discussion/nativeCognitiveEngine.ts#L160-L246),发现 **5 处 belief context leakage**:

| # | 位置 | 代码 | 来源 | 类型 |
|---|------|------|------|------|
| 1 | L165, L213 | `state.belief.toFixed(2)` 注入"信念强度" | 父类 DeGroot updateBeliefs 产出的标量 belief | **直接 leakage** |
| 2 | L165, L214 | `state.confidence.toFixed(0)` 注入"置信度" | 父类 inferenceLayer 推断的 confidence | **直接 leakage** |
| 3 | L176 | `entry.belief.toFixed(2)` memory 中"信念" | memory 存储 LLM 输出的 belief 字段 | **间接 leakage** |
| 4 | L182 | `entry.belief.toFixed(2)` 对方回应中"信念" | 同上 | **间接 leakage** |
| 5 | L201 | `op.belief.toFixed(2), op.confidence.toFixed(0)` 本轮他人观点 | LLM 输出的 belief 字段 | **间接 leakage** |

### 泄漏路径

```
父类 updateBeliefs (DeGroot)
  → agentStates.belief (旧标量 belief 系统)
    → updateAgentStates → agent.setState({belief})
      → runRound: state = agent.getState()
        → buildPrompt(state.belief)   ← #1 直接 leakage
          → LLM 看到 "信念强度: 0.65"
            → LLM reasoning 受 belief context 影响
              → LLM 输出 cognitiveState.utility  ← 可能是 belief 的重新表达
```

---

## 2. 哪些字段会影响 Utility 输出?

### 高风险(必须移除)

| 字段 | 影响机制 |
|------|----------|
| `state.belief` (L213) | LLM 直接看到标量信念,可能在 utility 中复现该值 |
| memory `entry.belief` (L176, L182) | LLM 看到自己和他人历史信念,可能锚定 utility |

### 中风险

| 字段 | 影响机制 |
|------|----------|
| `state.confidence` (L214) | 来自父类 inferenceLayer(基于 belief 网络),非纯 cognitive |
| memory `entry.confidence` | LLM 输出的 confidence,但被父类 updateBeliefs 修改过 |
| currentRound `op.belief/confidence` (L201) | 他人观点的 belief 字段 |

### 低风险(可保留)

| 字段 | 原因 |
|------|------|
| `entry.reasoning` | 自然语言推理,非标量 belief |
| `op.reasoning` | 同上 |
| governance prompts | 治理指令(本阶段禁用,但不构成 belief leakage) |

---

## 3. 哪些字段必须移除?

### 必须移除(P0 — 直接 belief leakage)

1. **L213 `state.belief`** → 替换为 cognitive state 的 utilityTopChoice + utilityIntensity
2. **L214 `state.confidence`** → 替换为 cognitive state 的 confidenceOverall
3. **L176, L182 memory `entry.belief`** → 移除 belief 标签,仅保留 reasoning
4. **L201 currentRound `op.belief, op.confidence`** → 移除 belief/confidence 标签,仅保留 reasoning

### 替代方案

buildPrompt 应改为读取 `this.cognitiveStates`(子类可访问 protected 成员),向 LLM 注入:

```
你当前的认知状态:
- 偏好选项: ${utilityTopChoice}
- 偏好清晰度: ${preferenceClarity}
- 证据覆盖: ${evidenceCoverage}
- 证据质量: ${evidenceQuality}
- 确信度: ${confidenceOverall}
```

而非旧的:
```
- 信念强度: ${state.belief}
- 置信度: ${state.confidence}
```

---

## 4. 结论

当前 prompt 存在 **5 处 belief context leakage**,其中 2 处为直接 leakage(state.belief/state.confidence),3 处为间接 leakage(memory/opinions 中的 belief 标签)。

**审稿人质疑成立**:Utility 可能受到旧 belief context 的隐式影响,需要移除后重新验证。
