# HiddenBench 原协议 vs SwarmAlpha 协议对照

状态：FACT REPORT，2026-08-15。HiddenBench 协议细节来自其 arXiv HTML 全文（2505.11556v2）§3–§5、Appendix A.1；SwarmAlpha 协议来自 `run_v6_fork.ts` / `productionVerticalSlice.ts` / `hiddenBenchTaskAdapter.ts` 的代码实现。

> 结论先行：**我们复用了 HiddenBench 的 65 个任务数据（pinned hash），但实验协议几乎完全不同**。任何"我们复现了 HiddenBench 的 30% collapse"或"我们和 HiddenBench 直接可比"的说法都是 over-claim。

---

## 1. 逐维对照（FACT）

| 维度 | HiddenBench 原协议 | SwarmAlpha fork | 相同？ |
|---|---|---|---|
| agent 数 | Study1 手工任务 N=4；65 任务是否统一未说明 | 3~4（= `hidden_information.length`）| 部分 |
| 私有信息分配 | 每人 `I_i = I_s ∪ {u_i}`，恰 1 条 unique hidden | 每人 description+shared + 1 条 hidden | ✅ 数据层相同 |
| 讨论轮数 | **T=15 轮，顺序发言** | **2 轮（round-1 同时 + round-2 同时）** | ❌ |
| 信息可见性 | 顺序发言 + full history available | round-1 看不见彼此；round-2 看到 round-1 全文 | ❌ |
| 最终答案 | 每人独立 vote+rationale，离线 average rule 聚合 | 每人 private belief，pooled mean + argmax | ❌ |
| 评估指标 | **accuracy（average rule 比例）；全文无 Brier** | **Brier（proper loss）primary + accuracy** | ❌ |
| 对照/干预 | pre-discussion / full-profile 基线；无治理干预 | CONTROL / SUPPORTS / ATTACKS 治理臂 | ❌ |
| 模型 | GPT-4.1 主体；Study2 评 15 模型 | DeepSeek deepseek-chat | ❌ |
| temperature | 原文未说明 | 0 | ❌ |
| 任务构成 | 3 手工 + 5 adapted + 57 GPT 生成 | 全部 65（pinned）| 部分 |

## 2. 直接后果：我们的 baseline ≠ HiddenBench 的 30%

- HiddenBench Study 1（GPT-4.1，3 个手工任务，average rule）：post-discussion accuracy **0.008 → 0.233**（23.3%，不是 30%）。
- SwarmAlpha fork CONTROL 臂（DeepSeek，45 unseen 任务，pooled argmax）：accuracy **66.7%**（pooled）/ 64.4%（majority）。

**两者不可比**，因为任务集（3 手工 vs 45 unseen）、模型（GPT-4.1 vs DeepSeek）、协议（15 轮顺序 vs 2 轮同时）、评估（average rule vs pooled argmax）全不同。

## 3. 对论文写作的约束（DESIGN INTENT）

1. 论文引 "HiddenBench ~30% collapse" **只能作为外部 motivation 引用**，措辞必须是"HiddenBench 报告…（在他们协议/模型下）"，不能暗示我们复现了它。
2. 论文必须明确：我们的贡献是"在 HiddenBench 的**任务数据**上，用**自研协议**做 disclosure-direction 干预"，不是"在 HiddenBench 协议上做干预"。
3. 若论文要报告我们的 CONTROL baseline accuracy，必须同时注明"与 HiddenBench 报告的 23.3% 不可比，因协议/模型/评估不同"。
4. 不可用 HiddenBench 的 30% 作为我们实验的"collapse 起点"来放大我们的干预效应——我们自己的 collapse 起点是 CONTROL 66.7%（且这不代表我们的任务更简单，只代表协议/模型/评估不同）。
