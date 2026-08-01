# SwarmAlpha 研究导读（论文视角）

> **文档定位**：按论文逻辑——研究问题 → 方法 → 假设 → 实验 → 发现 → 局限——讲清"这个研究为什么成立、证据在哪"。代码位置与复现命令是每个论点的**证据索引**（详见附录 A–D），不是主线。
>
> **维护原则**：以诚实无知为荣——每个论点的证据状态（已验证 / 探索性 / 已证伪 / 未验证）都明确标注，不把"设计合理"冒充"证据确凿"。
>
> **更新日期**：2026-08-01（按论文思路重写；数字以 [SOT.md](SOT.md) 为准）

---

## 0. 一句话研究定位（研究问题，非工程定位）

> **LLM 多智能体讨论在走向"集体认知失败"（回声室、极化、权威盲从）时，缺乏运行时可检测的信号。本文研究：能否把统计物理的"相变信号"工程化为这种运行时检测信号，并用它驱动非破坏性治理干预——全程零额外 LLM 调用（数学处理一切，LLM 仅做感知）。**

它之于多智能体系统，如同"心电图"之于人体——不改变心跳，只检测异常。**它不是 agent 框架，是 agent 框架之上的认知测量层。**

---

## 1. 研究动机与问题

### 1.1 空白
- **MAST 分类**（Cemri et al., NeurIPS 2025）标注了 14 种多智能体失败模式，但**明确把"检测"和"干预"留作未来工作**——只有分类，没有工具。
- **生产治理工具**（微软 Agent Governance Toolkit、NVIDIA OpenShell、OWASP Top 10）只管**安全层**（越权调用、预算、注入），不管**认知层**（讨论中群体滑向偏差）。
- 认知层是学术分类和生产工具都没有覆盖的空白。

### 1.2 本文回应的两个具体问题
1. **讨论健康有没有可计算的运行时信号？** —— 提出社会热力学状态 $(R,T,H,F)$，从 agent 结构化信念输出确定性计算。
2. **检测到偏差后怎么干预才不坏事？** —— 提出"改变信息流而非信念权重"的非破坏性干预原则。

### 1.3 核心命题（为什么是"测量优先"）
> 数据（§5）给出**不支持**"收敛即正确"假设的证据：共识水平与决策质量几乎无关（$r\approx-0.10$，$p=0.20$，**不显著**——探索性观察）。注意：不显著的结果**不能"推翻"假设，只能质疑其普适性**。若共识与正确性无关，则只看共识的治理系统可能在优化错误目标。因此：**先测量，后治理**。

---

## 2. 核心方法

### 2.1 社会热力学测量信号（论文 §3.2——注意两套 F 定义，勿混）

- **旧路径定义**（论文 §3.2）：将 agent 信念 $b_i\in[-1,1]$ 映射为相位 $\theta_i=(\pi/2)b_i$，定义 $R$（Kuramoto 序参量，方向一致性）、$T$（总体标准差，离散度）、$H$（Shannon 熵，分布形状）、$F=(1-R)+T\cdot H$（综合失序指标）。
- **v6 新路径定义**（`MeasurementLayer.ts:251`）：**改用修正自由能 $F = U - T\cdot H$**（U=效用 L2 范数，T=效用波动，H=证据熵）——与旧 F **不是同一个公式**。
- **证据状态**（⚠️ 两个证据对应不同公式，勿混）：
  - 旧 $F=(1-R)+T\cdot H$ 的两分量**强相关** $r=0.9175$（证伪"正交"，[THEORY.md §0.1](research/THEORY.md)）；且旧 R/T/H 由回归 $F\approx 0.019+2.014(1-R)$（$R^2=0.955$）显示**退化为 1 个有效维度**。
  - v6 新 $F=U-T\cdot H$ 三变量**解耦** $r=0.274$（`MeasurementLayer.ts:214`）。
- **审稿人视角**：旧"3 维热力学状态空间"叙事已被自己的证伪削弱（R/T/H 塌缩 1 维），**只能靠 v6 解耦挽回**——论文必须把主证据切到新路径、并明确区分两套 F 定义，否则会因"自相矛盾"被击穿。
- **代码**：`src/lib/thermodynamics/MeasurementLayer.ts`（v6 解耦路径）/ `src/lib/utils/statsUtils.ts`

### 2.2 δ 一致性诊断（v6 核心创新，论文未充分展开）
- **定义**：8 个 δ 信号检测"自报 vs 行为"矛盾——**无需 ground truth**，纯可观测信号对比（如 $\delta_{confidence\_gap}$ 检测"自报高信心但 U 偏离群体"）。
- **创新点**：旧检测器需要 ground truth 判断"异常"；δ 只需对比可观测信号的一致性，规避了"什么是正常"的价值判断。
- **证据状态**：🔧 已实现；Pilot A/B 单次验证（Δτ=+0.071，无统计显著性）；E9 Phase 3（200 runs）待跑。
- **代码**：`src/lib/thermodynamics/computeDelta.ts`
- **可证伪假设**：H9（δ 治理提升 τ）。

### 2.3 5 维认知状态（v3.2/v6）
- **定义**：Utility（效用向量）、Evidence（信息状态）、Inertia（认知惯性）、Confidence（信心）、Susceptibility（易感性）。**LLM 原生输出前三维，系统只算后两维**——消除"系统从行为反推认知"的循环论证。
- **证据状态**：🔧 已实现；与旧 belief 标量相比是信息更丰富的状态空间，但尚未跑出统计验证。
- **代码**：`src/lib/agent/cognitiveState.ts`、`src/lib/discussion/nativeCognitiveEngine.ts`

### 2.4 非破坏性干预（v2.1，论文 §3.4）
- **原则**：改变**信息流**（注入被忽略的证据、调整发言顺序）而非**信念权重**（压制 agent）。
- **动机**：v2.0 破坏性干预（reduce_weight、force_reflection）实测有害（$\Delta\tau=-0.267$）。
- **证据状态**：⚠️ 设计方向由 v2.0 失败支持；但 v2.1 干预**尚无统计验证**（smoke test $N=6$，$\Delta\tau=0.000$，早期 +0.533 已撤回）。
- **代码**：`src/lib/governance/cognitiveInterventions.ts`

### 2.5 SemanticTool（LLM 语义传感器，v6）
- **定义**：把 LLM 作为数学引擎手中的"语义传感器"（不是决策者）：evidence 语义去重、信息缺口分析、干预文本生成。
- **分层成本架构**：确定性 δ 诊断负责 ~95% 轮次（零成本）；仅异常轮次触发 SemanticTool（按需付费）。
- **证据状态**：🔧 代码完整 + Validator + 降级机制，但 **C 组链路从未实测**（E9 Phase 3 待跑）。
- **代码**：`src/lib/thermodynamics/SemanticTool.ts`

### 2.6 发言意愿公式（异步路径历史贡献）
- **定义**：五因子加权发言意愿 $W_i = 0.6E_i + \phi(\Delta b_i) + \psi(b_i,\bar b) + 0.3D_i - 0.5P_i$，tanh 归一化 + 双阈值门控——去中心化、闭式可分析、零额外 LLM 成本。
- **证据状态**：⚠️ **实现完整**（与论文公式逐项一致），**验证于 fraud C 组**（$n=10$，$\tau=0.64$ vs B 组 0.42，$d=1.09$，$p=0.028$——小样本）；**但实现在 `asyncEngine.ts`（已冻结）**，v6 主线（同步固定轮次）**不使用**。
- **论文定位**：这是**异步路径的历史贡献**，不是 v6 主线的贡献——论文需明确此边界，否则审稿人会问"这个创新在当前系统里还算数吗"。
- **代码**：`src/lib/discussion/asyncEngine.ts`（⛔ FROZEN）

---

## 3. 研究假设体系（H1–H9）

| 假设 | 内容 | 类型 | 检验代码 | 状态 |
|------|------|------|----------|------|
| H1 | 认知状态比 belief 更稳定 | Proposition | `MetricComputer.computeE1Stability` | 待 E1 |
| H2 | Evidence 增加解释力 | Proposition | `computeE2Evidence` | 待 E2 |
| H4 | Confidence 预测 ΔU | Proposition | `computeE4Confidence` | 待 E4 |
| H5 | 治理经 Evidence→Utility 中介 | Conjecture | `computeE5Governance` | 待 E5 |
| H6 | 5 维状态解耦 | Conjecture | `computeE6Decoupling` | 待 E6 |
| H9 | δ 治理提升 τ | Conjecture | `computeE9CognitiveGovernance` | Pilot +0.071（单次，不显著） |

> **诚实标注**：H5/H6/H9 是 Conjecture。全部 E1–E9 主实验**尚未启动**（E9 仅 Pilot）。

---

## 4. 实验设计与证据

> ⚠️ **两套实验，两套证据——审稿人必看此节。**

### 4.1 旧路径实验（169 闭环，论文当前主证据）
- **任务**：Crisis（困难，基线 τ=0.41）+ Supplier（中等，基线 τ=0.68），各 5 agent 排序 5 项。
- **条件**：`none` / `full`（检测+干预）/ `shuffle`（打破角色-信息一致性）。
- **系统**：DiscussionEngine（belief 标量）+ GovernanceEngine（4 经典检测器 + 破坏性干预）。
- **模型**：全 DeepSeek-V3（单模型）。
- **样本**：n=24–30/组；169 闭环 = Crisis 80 + Supplier 89。
- **统计**：Kendall τ-b、置换检验（$10^4$，seed 42）、Cohen's d、BH-FDR。

### 4.2 v6 新路径实验（E9，当前主线，待跑）
- **四组**：A（none）/ B（δ 治理）/ C（δ+SemanticTool）/ D（旧检测器对照）。
- **计划**：200 runs（4 组 × 50），university 任务。
- **现状**：仅 Pilot A/B 各 1 次（Δτ=+0.071，无统计显著性）；C/D 组从未跑。
- **分析脚本**：`experiments/campaign/analysis/e9_v6_comparison.ts`（防幻觉设计：B−A confirmatory、CI 同号、非劣效 margin=0.1、功效预警）。

---

## 5. 核心发现与证据链

| 发现 | 声明 | 证据强度 | 审稿人视角 |
|------|------|----------|-----------|
| **F1** 治理在困难任务有效 | Crisis `full` d=0.92, p=0.0038, 88% 功效 | ✅ 数字经审计验证 | 但单模型、post-hoc、旧路径 |
| **F2** 结构重排 > 过程治理 | shuffle d=1.44 vs governance d=0.92 | ✅ 数字真 | post-hoc、未预注册、未复现 |
| **F3** 共识-质量弱相关 | r≈−0.10, p=0.20 不显著 | ✅ 诚实标注为探索性 | 不显著结果当卖点需论证价值 |
| **F4** 干预反火 | r=−0.55（干预数-质量） | ⚠️ 轶事（N=10, 失败组 n=2） | 小样本、混杂，论文已标注 |
| **F5** 发言意愿公式 | fraud C 组 τ=0.64 vs 0.42 | ⚠️ n=10 小样本 | 已冻结 + v6 不用，需重新定位 |

> **核心叙事（F3 支撑）**：共识 ≠ 正确——但 F3 是**不显著**的探索性观察（p=0.20），它**质疑** DeGroot"收敛即正确"假设的普适性，**不能算"推翻"**。这是"测量优先"哲学的方向性证据，不是定论。

---

## 6. 局限与边界（论文 §5/§7，审稿人会从这里开火）

1. **单模型**：169 闭环全 DeepSeek；跨模型 pilot 被代码版本混杂（F16 已降级）。
2. **任务少**：2 个任务（AAMAS 期望 5+）。
3. **样本小**：Supplier 功效 43%（需 n=72）；E9 只有 Pilot。
4. **MAST 检测器 0 实证触发**；echo chamber 检测器被判定无效（separation=0）。
5. **F 分解排序已证伪**（A/B d_z=−0.354），论文仍当默认——需降级或删除。
6. **干预有效性判定有缺陷**：旧路径"有效率"基于无对照 belief-move（见 [AAMAS_SUBMISSION_CHECKLIST.md](paper/AAMAS_SUBMISSION_CHECKLIST.md) E10）。
7. **理论命题**：8 个中 4 个已证，4 个是猜想（AI-assisted proof 待人工验证）。

---

## 7. 两套叙事说明（论文与代码的关系）

> **审稿人看代码会问："论文里说的系统在哪？"——必须主动交代。**

| | 旧路径（论文当前证据） | v6 主线（当前代码） |
|---|---|---|
| 引擎 | DiscussionEngine（belief 标量） | NativeCognitiveEngine（5 维认知状态） |
| 检测 | 4 经典检测器（启发式阈值） | δ 诊断（无 ground truth） |
| 干预 | 破坏性（reduce_weight 等） | 非破坏性（inject_evidence 等） |
| 热力学 | R/T/H 强耦合（旧路径 R−T 相关 r=−0.96，scalar beliefs） | 解耦（新路径 F=U−T·H，r=0.274） |
| 证据 | 169 闭环（已验证） | 仅 Pilot（未验证） |
| 状态 | 已冻结部分（asyncEngine 等） | 当前唯一维护主线 |

**论文的正确叙事**：以 v6 为"现在进行时"，把 169 闭环作为"方法学验证的历史证据"，明确 E9 是"验证 v6 的实验"——不能把旧路径证据直接当 v6 的证据讲。

---

## 附录 A：代码地图（工程导航，非主线）

| 领域 | 文件 | 说明 |
|------|------|------|
| v6 引擎 | `src/lib/discussion/nativeCognitiveEngine.ts` | 当前主线引擎 |
| δ 诊断 | `src/lib/thermodynamics/computeDelta.ts` | 8 个 δ 信号 |
| 测量层 | `src/lib/thermodynamics/MeasurementLayer.ts` | R/T/H 解耦计算 + 认知状态 |
| 认知状态 | `src/lib/agent/cognitiveState.ts` | 5 维状态定义 |
| 认知干预 | `src/lib/governance/cognitiveInterventions.ts` | 非破坏性干预 |
| SemanticTool | `src/lib/thermodynamics/SemanticTool.ts` | LLM 语义传感器 |
| 实验流水线 | `experiments/campaign/run_all.ts` | E1–E9 入口 |
| 分析脚本 | `experiments/campaign/analysis/e9_v6_comparison.ts` | 四组对比（防幻觉） |
| ⛔ 冻结 | `src/lib/discussion/asyncEngine.ts`、`src/lib/thermodynamics/TerminationDecider.ts` | 异步路径，E9 不用 |

## 附录 B：可复现性清单

```bash
npx vitest run                        # 630 测试（28 文件）
npx tsc --noEmit                      # 0 类型错误
npx tsx experiments/v2/verify_audit.ts # 数据审计（注意：当前有 60 个 missing，待修）
npx tsx experiments/campaign/run_all.ts --experiment=e9_v6_a_none --seeds=42  # smoke 实验
```

## 附录 C：已知技术债务（诚实标注）

| 项 | 状态 |
|---|---|
| 60 个 audit manifest missing | 数据清理后 manifest 未重生成 |
| GovernanceRuntime cognitive 分支 | 死代码（~250 行，未接线） |
| MAST 检测器 enable 标志 | 默认关，0 次实验触发 |
| 旧路径有效率数字 | 无对照，已加 caveat，待 E10 重算 |
| **未使用变量/死代码** | **核心 111 个 + 实验 201 个**（2026-08-01 noUnusedLocals 排查发现；其中部分为 barrel re-export 误报）。**E9 后分批清理**，交付期不动（避免误删风险） |

## 附录 D：术语速查

| 缩写 | 含义 |
|------|------|
| δ | 主客观承诺偏差（自报 vs 行为矛盾） |
| R/T/H/F | Kuramoto 序参量 / 离散度 / 熵 / 综合失序指标 |
| U/E/I/C/Λ | Utility / Evidence / Inertia / Confidence / Susceptibility |
| hidden-profile | 每人持有独有信息、需分享才能找到最优解的决策任务 |
| non-inferiority | 非劣效检验（B 不比 D 差超过 margin） |

---

*本文档由 SwarmAlpha 维护。每个论点的证据状态可追溯到 [SOT.md](SOT.md) 或代码；如有疑问，以源码和实验数据为准。*
