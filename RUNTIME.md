# SwarmAlpha v9.6 运行时逻辑详解

> 一次完整请求的逐层拆解：从浏览器输入新闻到页面渲染结果

---

## 目录

1. [第一层：用户触发](#第一层用户触发)
2. [第二层：API 路由门禁](#第二层api-路由门禁)
3. [第三层：市场背景数据](#第三层市场背景数据)
4. [第四层：v9.3 核心引擎](#第四层v93-核心引擎)
5. [第五层：v9.5 社交互动](#第五层v95-社交互动)
6. [第六层：v9.5.2 动态权重](#第六层v952-动态权重)
7. [第七层：共识度量](#第七层共识度量)
8. [第八层：响应与前端](#第八层响应与前端)

---

## 第一层：用户触发

用户输入新闻 → `page.tsx` 的 `handleSubmit` 发送 POST：

```json
POST /api/swarm
{
  "version": "v9",
  "news": "美联储紧急降息50个基点，超出市场预期",
  "rounds": 3,
  "enableDynamicWeights": true,
  "llmConfig": { "provider": "deepseek", "model": "deepseek-chat" }
}
```

| 字段 | 说明 |
|------|------|
| `version` | `"v9"` 走 v9.3 + v9.5 + v9.5.2 完整管线 |
| `rounds` | 共识演化轮数 (1-10) |
| `enableDynamicWeights` | 🆕 v9.5.2: 是否启用场景自适应权重 |
| `disableInteraction` | true 时跳过 v9.5 互动层 |

---

## 第二层：API 路由门禁

`src/app/api/swarm/route.ts` → `POST()` 函数。

**三步门禁**：
1. **速率限制** — 基于 IP+UA 的滑动窗口 (10次/分钟)
2. **JSON 解析** — 捕获非法 JSON 返回 400
3. **输入验证** — XSS/SQL注入/命令注入防护 + 长度检查 (news ≤ 10000字, rounds 1-10)

通过后根据 `version` 字段分流：`"v9"` → v9.3 核心引擎。

---

## 第三层：市场背景数据

尝试从 Yahoo Finance 获取实时 S&P 500 + VIX 数据（免费 API，5分钟内存缓存）。失败时降级为从新闻文本推断：

```
新闻关键词 → 正则提取 → 推断 VIX/RSI/跌幅
例: "暴跌恐慌" → VIX≈35, RSI≈24, dropMagnitude≈8
```

---

## 第四层：v9.3 核心引擎

`src/lib/agents/v9/simulation.ts` → `runSwarmV9()`

### 4.1 因子提取 (1次 LLM 调用 或 0次模板)

LLM 模式发送 system prompt 要求提取 5 个正交因子：

```
Liquidity(-100..+100)  | Policy(-100..+100) | Fundamental(-100..+100)
Narrative(-100..+100)  | Uncertainty(0..100)
```

每个因子附带 `confidence`(0-100) 和 `evidence`(推理文本)。

模板模式用关键词正则提取 + 中文政策词库，零 API 调用。

### 4.2 Agent 因子解读 (纯数学)

9 个 Agent 各只能看到其权限内的因子（强制信息盲区）：

| Agent | 可见因子 | 影响力 | 资本 | 不确定性灵敏度 |
|-------|---------|--------|------|--------------|
| 🏦 Institution | liquidity, policy, fundamental | 90 | 95 | 0.6 |
| 💎 Value | fundamental | 60 | 80 | -0.2 |
| 🏄 Trend | narrative | 45 | 50 | 0.5 |
| 😱 Panic | liquidity | 25 | 40 | 1.2 |
| 🤖 Quant | liquidity, fundamental | 55 | 75 | 0.1 |
| 📡 Media | narrative, policy | 70 | 10 | 0.4 |
| 🦉 Contrarian | narrative (负权重) | 40 | 60 | -0.5 |
| 🐜 Retail | narrative | 10 | 20 | 0.8 |
| 🏛️ PolicyAgent | policy, liquidity | 50 | 0 | 0.3 |

56% 的 Agent 对在方向因子上共享 0 个重叠 → 真正的视角差异。

**四步解读**：
1. **因子过滤** — 权限矩阵 × 因子向量 → 各 Agent 的可见因子
2. **信念计算** — `belief = Σ(factorValue_i × factorWeight_i)`，钳制到 [-100, 100]
3. **非线性变换** — 按 Agent 风格变换 (Value: sigmoid, Contrarian: 反向, Quant: 线性)
4. **不确定性折扣** — `confidence = baseConf × (1 - uncertaintySensitivity × unc/100)`

### 4.3 共识涌现 (每轮)

**两种共识并行计算**：

*线性加权共识*：
```
consensus = Σ(belief_i × influenceWeight_i × conf_i/100) / Σ(influenceWeight_i × conf_i/100)
```

*K-Means 聚类共识*：1D 加权 K-means → 取权重最大簇的加权中心。

**Kuramoto 序参量**：信念 → 相位 → r = |Σ e^(iθ_j)|/N，衡量同步度。

**非对称门控**：KMeans < -15 → 采信聚类（强空头信任聚类）；否则采信线性。

### 4.4 Neutral Detection (四规则)

| 规则 | 条件 | 含义 |
|------|------|------|
| R1 | abs(共识) < 15 (线性+聚类均弱) | 两种方法一致认为方向模糊 |
| R2 | belief_std > 45 | Agent 高度分歧 |
| R3 | kuramoto_r < 0.4 | 相位失同步 |
| R4 | 融合不确定性 > 65 ∧ abs(共识) < 25 | 高不确定 + 弱信号 |

R1 或 R4 或 (R2 ∧ R3) → **Neutral**，方向信号不可靠。否则按 consensus 符号判定 UP/DOWN。

### 4.5 群体行为诊断

纯数学的 3 层诊断（毫秒级）：
1. **归因分解** — 每个 Agent 的净贡献 = belief × influence × conf/100
2. **联盟分析** — 识别多头/空头/中立阵营，计算力量对比
3. **反事实分析** — "移除最关键的 Agent 会怎样？关闭盲区共识偏移多少？"

---

## 第五层：v9.5 社交互动

`src/lib/agents/v9.5/interaction.ts` → `runInteraction()`

### 5.1 可见性矩阵

Agent A 能看到 Agent B ⟺ A 的方向因子 ∩ B 的方向因子 ≠ ∅。

- Panic 只看 liquidity → 只能看到 Institution, Quant, PolicyAgent
- Value 只看 fundamental → 只能看到 Institution, Quant
- Contrarian 只看 narrative → 只能看到 Trend, Media, Retail

### 5.2 信念传播

核心公式：`b_i_new = (1-α_i) × b_i_old + α_i × peer_avg_visible`

| Agent | α 值 | 行为 |
|-------|------|------|
| 😱 Panic | 0.70 | 最易受影响 |
| 🐜 Retail | 0.60 | 高度从众 |
| 🏄 Trend | 0.50 | 关注他人 |
| 📡 Media | 0.45 | 跟随传播 |
| 🏛️ PolicyAgent | 0.20 | 相对独立 |
| 🏦 Institution | 0.15 | 独立研究 |
| 🤖 Quant | 0.10 | 模型驱动 |
| 💎 Value | 0.05 | 最独立 |
| 🦉 Contrarian | -0.15 | 逆向操作 |

边界软化：|belief| > 80 时有效 α 衰减 50%，防止极限环振荡。

### 5.3 收敛检测

- 所有 Agent 变化 < 2 → 收敛
- 连续 3 轮 std 增长 → 发散（极化而非共识）
- 最大 10 轮

---

## 第六层：v9.5.2 动态权重

`src/lib/agents/v9.5/dynamicWeights.ts` → `computeDynamicWeights()`

**纯数学，零 LLM 调用**。根据市场状态的三模式检测 + 乘法合成。

### 6.1 三种模式

| 模式 | 触发条件 | 逻辑 |
|------|---------|------|
| 🔴 恐慌 | VIX>35 / beliefStd>50 / Panic<-70 | 恐惧传染，理性被压制 |
| 🏛️ 政策 | Policy因子>70 / PolicyAgent>60 | 政策信号明确 |
| 💎 价值洼地 | Fundamental<-50 ∧ Uncertainty>70 / Value<-40 | 极端低估，逆向机会 |

### 6.2 权重调整

| Agent | 恐慌 | 政策 | 价值洼地 |
|-------|------|------|---------|
| 😱 Panic | ×1.40 | — | ×0.80 |
| 🏦 Institution | ×1.15 | ×1.15 | — |
| 🐜 Retail | ×0.70 | ×0.60 | — |
| 🏛️ PolicyAgent | — | ×1.40 | — |
| 🏄 Trend | — | ×0.80 | ×0.60 |
| 💎 Value | — | — | ×1.50 |
| 🦉 Contrarian | — | — | ×1.30 |
| 🤖 Quant | — | — | — |
| 📡 Media | — | — | — |

多模式同时触发时**乘法合成**，钳制到 [0.3, 3.0]。

### 6.3 动态共识

用动态权重重新计算加权共识，与静态共识做 A/B 对比：

```
dynamicConsensus = Σ(belief_i × dynamicWeight_i × conf_i) / Σ(dynamicWeight_i × conf_i)
```

> 注：v9.3 核心引擎的共识仍用静态权重（保留基线）。动态权重影响 v9.5 互动层的社交影响力 + 补充的 dynamicConsensus 指标。两者并列输出，便于消融对比。

---

## 第七层：🆕 v9.6 Market Awareness — 双层感知修正

`src/lib/agents/v9/agentInterpretation.ts` → `applyMarketAwareness()`

**问题**：LLM 因子系统性偏空，Agent 信念清一色看跌，共识引擎无法区分 1987（反弹）和 2008（继续跌）。
**方案**：两层修正合并在一个函数中——客观统计信号 + LLM 模式识别。

### Layer 1: 统计均值回归 (VIX/RSI)

```
RSI<20 + VIX>40 → mrSignal=1.0 (历史上70%+反弹概率)
→ shift = mrSignal × agentMultiplier × 50 (仅对负信念)
MECHANICAL_SELLOFF 模式下 ×2.0 增强
```

### Layer 2: Pattern-Aware 智能体级修正

LLM 识别的 4 种事件模式 → Agent 级精细化调整：

| 模式 | Value/Contrarian | Panic | Media | 其他空头 |
|------|-----------------|-------|-------|---------|
| MECHANICAL_SELLOFF | ×0.2 + 15 (翻正) | ×0.3 | — | — |
| SOLVENCY_CRISIS | — | — | — | ×1.15 (只放大空头) |
| NARRATIVE_DRIVEN | Contrarian: -belief×0.5 | — | ×0.3 | — |
| EXTERNAL_SHOCK | ×0.7 (降低抄底) | — | — | — |

```
例: 1987 MECHANICAL_SELLOFF, Value belief=-80
  Layer 1: MR shift +75 → -5
  Layer 2: ×0.2+15 → 14
  最终: Value 从-80被翻到+14 ✅
```

---

## 第八层：共识度量

`src/lib/agents/v9.5/metrics.ts` → `computeAllMetrics()`

### 三个核心指标

| 指标 | 构成 | 含义 |
|------|------|------|
| Consensus Score | 40% Kuramoto同步 + 30% 共识强度 + 30% 一致性 | 共识有多强 |
| Polarization Score | 50% 极端性乘积 + 50% 双峰性 | Agent 分裂成对立阵营的程度 |
| Fragility Score | 40% 集中度风险 + 30% 翻转风险 + 30% 盲区风险 | 共识有多容易被打破 |

### 状态分类

| 共识 | 极化 | 脆弱 | 状态 |
|------|------|------|------|
| >60 | <30 | <30 | 🟢 稳健共识 |
| >60 | <30 | >60 | 🟡 脆弱共识 |
| <30 | >60 | >60 | 🔴 两极对抗 |
| <30 | <30 | <30 | 🔵 认知迷雾 |
| <30 | >60 | <50 | 🟠 健康分歧 |
| 30-60 | — | — | 🟡 模糊共识 |

---

## 第八层：响应与前端

### API 响应结构

```json
{
  "success": true,
  "version": "v9.5",
  "data": {
    "news": "...",
    "factorVector": { "factors": [...], "metadata": {...} },
    "rounds": [{ "round": 1, "consensus": -5.2, "agents": {...}, ... }],
    "final": { "consensus": -3.8, "direction": "DOWN", "beliefStd": 42.3 },
    "v9_5": {
      "interaction": { "totalRounds": 3, "convergenceType": "converged", ... },
      "metrics": { "consensusScore": 45, "polarizationScore": 62, "fragilityScore": 38, "stateLabel": "🟠 健康分歧" },
      "dynamicWeights": {
        "enabled": true,
        "activeModes": ["panic"],
        "adjustments": { "panic": { "baseWeight": 25, "finalWeight": 35, "multiplier": 1.4 } },
        "dynamicConsensus": -6.1
      }
    },
    "diagnostics": { "attribution": [...], "coalition": {...}, "counterfactuals": {...} }
  }
}
```

### 前端渲染层级

```
page.tsx
├── ConsensusDashboard       ← 共识度量仪表盘 + 🆕 动态权重面板
├── AgentPanel + AgentCard   ← Agent 信念 + 置信度
├── EmotionChart             ← Chart.js 折线图 (跨轮情绪轨迹)
├── RadarChart               ← Chart.js 雷达图 (Agent 多维对比)
├── ConsensusBadge           ← 最终共识方向
└── GameLog                  ← 逐轮逐 Agent 推理日志
```

### 数据转换

v9.5 响应 → 兼容旧 `SwarmResult` 格式：
- `rounds[n].agents` 从 `Record<string, V9AgentState>` 转为 `AgentState[]`
- `final.consensus` 取最后一轮的 consensus
- `v9_5.dynamicWeights` 直接传给 `ConsensusDashboard`

---

## 附录：关键数字

| 指标 | 值 |
|------|-----|
| 单次请求 LLM 调用 | 1 次 (因子提取)，其余全数学 |
| 模板模式成本 | ¥0 |
| Agent 总数 | 9 (8 交易者 + 1 政策分析师) |
| 方向因子盲区 Agent 对 | 56% |
| v9.3 LLM belief_std | 58.5 |
| v9.3 模板 belief_std | 37.6 |
| 动态权重模式 | 3 (恐慌/政策/价值洼地) |
| 乘数安全范围 | [0.3, 3.0] |
| 互动最大轮次 | 10 |
| 速率限制 | 10次/分钟/客户端 |

---

## 核心设计原则

1. **LLM 只提取因子，不判断方向** — 让机器做它擅长的事
2. **强制信息盲区** — 56% Agent 对无共享因子 → 真正的视角差异
3. **纯数学叠加层** — v9.5 互动 + 度量 + 动态权重全零 LLM 调用
4. **可开关可对比** — 每个新功能都有 enable/disable 开关，支持消融实验
5. **场景自适应** — 动态权重根据恐慌/政策/价值自动调整影响力分布
