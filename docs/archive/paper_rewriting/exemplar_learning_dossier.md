# 范文学习档案：面向 AAMAS 长文的 SwarmAlpha 结构与论证范式

## 0. 任务边界与证据纪律

本档案只回答“高质量会议论文如何组织、论证和呈现结果”，不替 SwarmAlpha 生成新结果，也不将外部论文的结论移植为本项目事实。资料优先级为：AAMAS/ICML/ACL/PMLR 官方论文页或论文 PDF，其次为当前仓库中的权威战略、协议、可重放实验报告和旧稿。旧稿只作为需要重构的反例与素材来源，不压过当前 V6 实现、schema-5 重放和 2026-08-12 探索实验。

当前论文应遵守以下 claim ceiling：

- **可写成 FACT**：实现了 claim-relative 显式概率报告、来源/暴露/动作/结果审计链和确定性重放；80 个探索 run 均通过 schema-5/decision replay；在该批工程任务中观察到明显过度自信和 certainty 阈值的反预测现象；治理效应按冻结规则判为 `DEFER_INSUFFICIENT`。
- **只能写成 HYPOTHESIS 或 DESIGN INTENT**：显式报告能否成为跨提示、跨任务稳定的测量工具；基于状态和 lineage 的治理能否改善独立 proper loss；异构资源的边际认知价值；社会热力学的预测或控制规律。
- **不可写**：系统读取了模型“内心信念”；exact repeat 等于测量效度；共识等于正确；治理已经有效；内部哈希等于外部真实性或防篡改；V6 是官方 HiddenBench 协议复现；`F`、CDI 或 CollectiveEpistemicState 已是普适社会物理量。

---

## 1. 范例清单

### 1.1 目标场景范例（AAMAS 正式长文，6 篇）

| ID | 论文 | 场景与来源 | 主要组织方式 | 值得迁移的做法 | 不应照搬之处 |
|---|---|---|---|---|---|
| A1 | *Causal Explanations for Sequential Decision-Making in Multi-Agent Systems*（Gyevnar et al., AAMAS 2024） | AAMAS 2024 Full Research Paper，官方 PDF：[p771](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p771.pdf) | 问题缺口 → 精确定义与假设 → 三步机制 → 仿真正确性/稳健性 → 人类研究 | 引言在第一页结束前给出框架图、三步机制和四项贡献；将“算法是否识别正确原因”与“解释是否影响人类信任”分成两个证据层；形式化对象紧邻机制 | SwarmAlpha 不能像它一样使用因果语言，除非随机化和 estimand 真正识别效应；也没有用户研究证据 |
| A2 | *TaxAI: A Dynamic Economic Simulator and Benchmark for Multi-Agent Reinforcement Learning*（Mi et al., AAMAS 2024） | AAMAS 2024 Full Research Paper，官方 PDF：[p1390](https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1390.pdf) | 理论模型 → 模拟器工程 → 数据校准 → 多算法基准 → 宏/微观分析 → 可扩展性 | 把平台贡献拆成“环境/校准/benchmark”，实验的每一组分别验证一种贡献；9 个基线、4 个任务、不同 agent 规模被组织成清晰问题，而不是堆表 | SwarmAlpha 当前不是已验证的通用 benchmark，也不能用测试数量或代码规模代替外部算法比较 |
| A3 | *Game of Thoughts: Iterative Reasoning in Game-Theoretic Domains with Large Language Models*（Gemp et al., AAMAS 2025） | AAMAS 2025 Research Paper，官方 PDF：[p1088](https://www.ifaamas.org/Proceedings/aamas2025/pdfs/p1088.pdf) | 游戏问题 → 三个迭代算法 → 多游戏 empirical results → stylized theorem → trade-off discussion | 结果先暴露基线失败，再展示方法差异；报告 expected payoff 与 exploitability 的张力，不把单指标胜利写成全面优越；图按“轨迹—对比—稳定性”组织 | SwarmAlpha 没有可宣称的定理；当前也不宜把三层长远愿景都塞进主方法 |
| A4 | *On the Limits of Agency in Agent-Based Models*（Chopra et al., AAMAS 2025） | AAMAS 2025 Research Paper，官方 PDF：[p500](https://www.ifaamas.org/Proceedings/aamas2025/pdfs/p500.pdf) | 规模—表达力张力 → archetype 方法 → 框架集成 → 大规模案例 → 局限 | 以一个明确 trade-off 统领全文，而不是以“大平台”统领；每个架构选择都回到计算可行性与行为表达的矛盾 | 该文用百万规模和真实案例支撑平台叙事；SwarmAlpha 尚不能借用这种“通用 runtime”口吻 |
| A5 | *Leveraging Large Language Models for Effective and Explainable Multi-Agent Credit Assignment*（Nagpal et al., AAMAS 2025） | AAMAS 2025 Research Paper，官方 PDF：[p1501](https://www.ifaamas.org/Proceedings/aamas2025/pdfs/p1501.pdf) | 经典 MAS 问题重述 → LLM critic 方法 → 明确 prompt/parser → 多环境比较 → 新数据集/benchmark | 贡献清单逐项对应后文证据；把 prompt 和 parser 当作方法的一部分，而不是实现细节；结果章开头明确“本节要验证什么” | 该文的 LLM 数值反馈未必具备测量效度；SwarmAlpha 应把这正好作为区别点，不能照搬“LLM 给分即真值” |
| A6 | *Feature Engineering for Agents: An Adaptive Cognitive Architecture for Interpretable ML Monitoring*（Bravo-Rocca et al., AAMAS 2025） | AAMAS 2025 Research Paper，官方 PDF：[p381](https://www.ifaamas.org/Proceedings/aamas2025/pdfs/p381.pdf) | 监控问题 → 认知架构 → 多模型/多数据集比较 → accuracy/unknown/tokens/time → ablation | 同时报告质量和 token/time；将主要指标、效率指标和 ablation 分开；清楚列出模型、数据集和比较协议 | GPT-4 judge 形成潜在循环评价，恰好提醒 SwarmAlpha 坚持授权 resolution 和独立 outcome；不要学“系统化因此公平”这类未经验证的句式 |

### 1.2 高质量领域/SOTA 范例（至少 6 篇）

| ID | 论文 | 权威来源 | 与 SwarmAlpha 的关系 | 结构/论证学习点 |
|---|---|---|---|---|
| S1 | Du et al., *Improving Factuality and Reasoning in Language Models through Multiagent Debate*（ICML 2024） | [PMLR 官方页](https://proceedings.mlr.press/v235/du24e.html) | 正向 MAD 范式：多实例多轮交换后形成共同答案 | 以广泛任务结果支撑黑盒协议的实用性；可作为必须打败或控制的 debate 基线，而不能作为治理有效的先验证据 |
| S2 | Smit et al., *Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs*（ICML 2024） | [OpenReview 官方页](https://openreview.net/forum?id=CrUmgUaAQp) | 强反例：MAD 不稳定优于 self-consistency/ensemble，且超参敏感 | 范例表明负面结果也可成为主贡献：先提出常见假设，再做成本—时间—准确率系统 benchmark，最后提炼条件性结论 |
| S3 | Chen et al., *ReConcile: Round-Table Conference Improves Reasoning via Consensus among Diverse LLMs*（ACL 2024） | [ACL Anthology](https://aclanthology.org/2024.acl-long.381/) | 与“confidence + 异构模型 + consensus”最接近的强基线 | 明确三阶段协议，并用 confidence recalibration 后加权；SwarmAlpha 应把“报告如何 elicited、如何校准、何时可获控制权”写得比它更严谨 |
| S4 | Liang et al., *Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate*（EMNLP 2024） | [ACL Anthology](https://aclanthology.org/2024.emnlp-main.992/) | 思维退化、适应性停止和 judge 偏差 | 从一个可观察 failure mode（DoT）导出方法；同时把 judge 公平性写入限制。SwarmAlpha 可学习“失败机制 → 最小干预”，但必须先完成测量效度桥梁 |
| S5 | Li, Naito & Shirado, *HiddenBench: Assessing Collective Reasoning in Multi-Agent LLMs via Hidden Profile Tasks*（2025/2026 版本） | [arXiv 官方页](https://arxiv.org/abs/2505.11556)；代码和正式版本状态应另行核验 | 分布式私有信息和独立 resolution 的最直接任务基础 | 理论范式 → custom task 验证 → 65-task benchmark → 跨模型比较 → 失败消融；把 group size、prompt、structured dissent 当实验因素，而非默认有效机制 |
| S6 | Cemri et al., *Why Do Multi-Agent LLM Systems Fail?*（MAST, 2025） | [arXiv 官方页](https://arxiv.org/abs/2503.13657)；[项目页](https://sites.google.com/berkeley.edu/mast) | 描述性 failure taxonomy，覆盖 specification、inter-agent misalignment、verification/termination | 人工多标注者、迭代 taxonomy、κ 一致性和跨框架案例支撑“失败构念”；提醒 SwarmAlpha 不可仅凭自定义 detector 命名构念 |
| S7 | Kadavath et al., *Language Models (Mostly) Know What They Know*（2022） | [arXiv 官方页](https://arxiv.org/abs/2207.05221) | P(True)/P(IK) 是 LLM 自报概率的关键前例 | 把 elicitation format、task transfer 和校准分开；“在正确格式下有效”并不等于跨 prompt/跨任务不变，正好支持测量有效性先行 |
| S8 | Jiang et al., *How Can We Know When Language Models Know?*（2020） | [arXiv 官方页](https://arxiv.org/abs/2012.00955) | 概率校准、输入/输出调整与任务差异 | 定义 calibration 后再比较方法；提供“量产生数值 ≠ 量有效”的写法依据 |
| S9 | Band et al., *Linguistic Calibration of Long-Form Generations*（ICML 2024） | [PMLR 官方页](https://proceedings.mlr.press/v235/band24a.html) | 语言表达的不确定性与用户决策，而非隐藏状态读取 | 先按下游决策定义构念，再设计训练目标。SwarmAlpha 可借鉴其“操作性定义优先”，但当前只研究显式概率报告，不研究用户信任 |
| S10 | Xiao et al., *The Consistency Hypothesis in Uncertainty Quantification for Large Language Models*（UAI 2025） | [PMLR 官方页](https://proceedings.mlr.press/v286/xiao25a.html) | exact repeat / paraphrase 稳定性的理论邻居 | 将“生成一致性可代理置信度”拆成多个可检验命题和统计检验；SwarmAlpha 的 Q0/Q1 gate 应采用同样的可证伪写法 |

> 时间说明：检索日期为 2026-08-13。2026 年或版本状态可能变动的论文，后续 citation agent 必须再次核验正式出版信息；本档案不把未来/在审论文作为结果事实来源。

---

## 2. 结构模式

### 2.1 强会议论文的共同“主脊柱”

六篇 AAMAS 范例虽题材不同，但都有近似的五段论证：

1. **具体 MAS 张力**：不是“LLM 很重要”，而是一个明确矛盾，例如规模与表达力、局部观察与全局信用、复杂交互与因果解释。
2. **操作性对象**：在方法出现前定义 state、action、agent、reward、explanation 或 benchmark unit。
3. **最小机制**：用一张图和少量方程解释系统改变了什么；prompt/parser 若改变测量，应属于方法正文。
4. **贡献—证据一一对应**：每个实验小节验证一项承诺；平台、算法、效度、可扩展性不混成一个总分。
5. **条件性结论**：强文通常报告 trade-off、失败区间或假设依赖，而不是“所有指标均更优”。

### 2.2 适合 SwarmAlpha 的论文骨架

推荐把当前初稿由“社会热力学 + 五维状态 + 大量治理功能”重构为下列 AAMAS 长文骨架：

1. **Introduction：治理前必须先证明测量可用。**
   - 场景：多 Agent 在分布式信息下相互影响，但 consensus、文本说服力和自报 certainty 都可能与正确性脱钩。
   - 缺口：现有 debate/ensemble 优化答案；failure taxonomy 描述失败；confidence 工作研究单模型校准；缺少把“显式报告—来源—暴露—随机治理动作—独立 outcome”统一成可审计实验单元的工作。
   - 中心命题不是“我们治理成功”，而是：**一个治理机制只有在其触发量具有测量效度、动作被随机识别、结果由独立 outcome 评价时才可被科学检验。**
   - 贡献控制在三项：表示/审计方法；测量有效性协议；探索性刻画与治理 DEFER 边界。

2. **Related Work：按缺失的识别链组织，而不是按产品类别罗列。**
   - 多 Agent debate 与 ensemble：回答“协议能否提高答案”，但通常不分离状态测量与控制权限。
   - 分布式信息/HiddenBench 与 failure taxonomy：回答“群体会怎样失败”，但不提供可随机化治理链。
   - LLM confidence/calibration：回答“某种概率报告在特定 elicitation 下是否校准”，但不自动成为跨 prompt 的治理触发量。
   - MAS trust/governance：指出 SwarmAlpha 当前只治理 claim/event，不做全局人格信誉。

3. **Problem Formulation：先定义量的认识论角色。**
   - registered claim/outcome space、agent-private information、public transcript、report event、authorized resolution、epistemic action、operational outcome。
   - 把所有量分为：自报量、prompt/protocol-induced observation、确定性派生量、潜在构念、诊断量、控制量。
   - 明确禁止蕴含：自报概率不等于内部 belief；相似文本不等于同源；重放不等于外部真实性；高共识不等于高质量。

4. **Method：审计链而非功能目录。**
   - `Text/Private Evidence → Explicit Report → Provenance/Exposure Events → Frozen Diagnosis → Randomized Action → Final Private Elicitation → Authorized Resolution → Proper Loss → Replay`。
   - prompt 放在“测量仪器”小节：系统指令、字段、选项顺序、上下文窗口、温度/model/config 都是 instrument configuration。
   - 数学部分只保留与 estimand 直接相关的量：概率向量、reported certainty（明确定义）、lineage、JSD/TV、Brier、coverage、action assignment、cluster-level estimator。
   - 社会热力学放入 Discussion/Future Theory，除非 ST-1 predictive gate 有新结果。

5. **Measurement Validity Study：正文第一实验。**
   - Q0 可运行性：terminal coverage、invalid/unavailable、完整 pair coverage。
   - Q1 不变性：exact repeat、semantic paraphrase、canonical option permutation。
   - Q1 响应性：证据方向改变时概率应有正确符号响应；证据强度 ladder 应呈合理单调关系。
   - 明确 nuisance 与 signal：只稳定但对证据不响应是坏 instrument；只响应但随 paraphrase 剧烈漂移同样失败。

6. **Exploratory Governance Study：正文第二实验。**
   - 80-run study 只用于描述 engineering feasibility、overconfidence 风险和为何 `DEFER`。
   - apply/sham/holdout 的 assignment、eligible denominator、task-cluster 数、missingness 和 stopping rule 必须在结果前写清。
   - 若 measurement pilot 尚未完成，不应把该节标题写成“governance effectiveness”。

7. **Results：按研究问题而非代码模块。**
   - R1 是否完整采集且可重放？
   - R2 报告对重复/复述/置换是否稳定？
   - R3 报告是否随方向和强度可预期变化？
   - R4 当前 detector 是否区分错误？
   - R5 当前随机治理数据是否足以估计 effect？答案允许为 DEFER。

8. **Discussion：负面结果转化为研究结论。**
   - 高 certainty 阈值在该工程样本反预测，说明“结构化输出”不能自动获得控制权限。
   - `DEFER` 不是零效应；它暴露的是识别设计和有效样本支持不足。
   - 从 claim-relative microstate 走向异构资源治理与社会热力学必须经过 held-out predictive/response/scaling gates。

### 2.3 旧稿需要删除或降级的结构

旧稿有完整 prompt、阈值表和历史公式，作为技术附录有价值，但不适合作为当前论文主脊柱：

- “五维认知状态”混合了 LLM 自报、角色启发式和公式派生，容易让读者误认这些量具有同等效度。
- `Δ` 一致性、固定阈值、惯性、易感性和 CDI 在同一章并列，造成“产生公式即构念成立”的错觉。
- 169-run 历史排序实验属于 legacy support，不得与 V6 schema-5 的当前证据混池。
- 社会热力学相关性解耦只证明代数冗余有所降低，不证明预测效度、尺度律或控制价值。
- 全量 prompt 可放 appendix/artefact；正文只展示足以理解测量的字段与一个代表性模板。

---

## 3. 论证模式

### 3.1 最有说服力的三种论证

#### 模式 P1：构念风险 → 操作性定义 → 验证门

这是 SwarmAlpha 最适合的主模式。

> 多 Agent 文本会产生看似精确的 confidence；然而该数值可能由措辞、选项顺序和协议诱导。因而先把它定义为“在冻结 instrument 下输出的显式概率报告”，再通过重复/复述/置换不变性和证据响应性判断它能否成为 detector 输入。只有通过 gate 的量才可能进入控制策略。

这比“让 LLM 自报信念，因此系统拥有 belief state”更强，因为它是可证伪的。

#### 模式 P2：强基线或负面结果 → 条件性边界

Smit et al. 表明 MAD 并不稳定优于简单 ensemble；AAMAS 的 Game of Thoughts 也正面呈现 exploitability 与 payoff 张力。SwarmAlpha 应将探索结果写成：

> 当前 engineering sample 中，报告表现出过度自信，而预注册 detector 的 flag 初步反预测错误；治理对比因 holdout 与独立 task cluster 不足而 DEFER。因此下一步不是扩大治理宣称，而是修订 instrument 和随机化支持。

这不是“失败报告”，而是阻止错误治理授权的实证边界。

#### 模式 P3：贡献承诺 → 独立验证单元

仿照 TaxAI/CEMA，每项贡献必须绑定一种证据：

| 贡献承诺 | 必需证据 | 当前可用性 |
|---|---|---|
| 可审计、可重放的 claim/event representation | schema-5 carrier、hash/replay、adversarial tests、80/80 replay | 已有工程与探索证据 |
| 显式概率报告是可检验 instrument | nuisance invariance + evidence sensitivity + missingness | 协议/runner 已有；真实 pilot 待完成 |
| 治理动作可被因果评价 | frozen assignment、sham/holdout、独立 final outcome、足够 task clusters | 机制已有；当前样本支持不足 |
| 异构资源治理/MCV | 多 resource pool、cost-matched baselines、held-out CEC | 仅 DESIGN INTENT |
| 社会热力学规律 | macrostate held-out prediction、随机响应、scaling | 仅 HYPOTHESIS |

### 3.2 需要避免的论证捷径

- **提示词服从捷径**：“模型按 JSON 输出”只能证明协议 compliance，不能证明字段是心理状态。
- **数学确定性捷径**：Brier/JSD/hash 可正确计算，不代表其输入真实、独立或有效。
- **重放捷径**：replay 证明 artifact 与冻结规则内部一致，不证明外部事件真的按记录发生。
- **共识捷径**：agreement 是群体动力学变量，不是正确率替代品。
- **阈值捷径**：`certainty ≥ 0.7` 是参数，不是自然常数；当前结果反而要求重新校准或撤权。
- **多 agent 样本膨胀**：同一 task 内多个报告不能当独立 task；bootstrap 和效应估计应以预注册 task/semantic cluster 为单位。
- **DEFER 偷换为零/负效应**：当前 `DEFER_INSUFFICIENT` 只说明数据不能支持 estimand 解释。

---

## 4. 语言模式

### 4.1 推荐句法

使用“对象—操作—证据—边界”的短链：

- “我们将 `reported certainty` 定义为冻结提示词下模型提交的概率函数，不将其解释为对隐藏内部状态的直接读取。”
- “80 个 raw-run artifact 均通过 schema-5 decision replay；该结果支持内部可重放性，不支持外部真实性或测量效度。”
- “在本批工程任务中，certainty 阈值与错误呈反向关联；该观察用于否决当前 detector 的控制授权，而非证明所有模型自报概率均无效。”
- “治理 estimand 因 holdout task clusters 不足触发预注册停止规则，因此本文不解释 apply–holdout 差值。”

### 4.2 证据强度词典

| 证据状态 | 推荐措辞 | 禁止措辞 |
|---|---|---|
| 实现 + 单元/对抗测试 | “实现并确定性测试”“保护以下不变量” | “证明现实有效”“production-ready” |
| 可重放探索实验 | “在记录条件下观察到”“preliminary characterization” | “普遍规律”“建立因果效应” |
| Gate 未通过 | “DEFER”“不足以判断”“撤销控制授权” | “效果为零”“证明无效” |
| DESIGN INTENT | “我们提出”“后续将检验” | “系统能够”“系统优化了” |
| HYPOTHESIS | “若……则预期”“可证伪假设” | “理论表明”（没有推导时） |

### 4.3 人类作者感与 AAMAS 风格

- 每段只承担一个逻辑动作，避免连续堆叠 `epistemic/governance/heterogeneous/collective` 等名词。
- 引言少用“首个、通用、根本解决”；优先写审稿人可验证的对象和对比。
- 方程出现前用一句自然语言说明它回答什么问题，出现后说明它不回答什么问题。
- 缩写控制：正文核心保留 V6、Brier、JSD、ECE；历史 `R/T/H/F/CDI/Δ` 不应同时进入主文。
- Prompt 原文不占正文大段；正文表格列“可见信息/禁止信息/输出字段/解析失败状态”，全文放附录。
- 结果段落先报 denominator/coverage，再报 point estimate，再报不确定性/cluster，最后给解释边界。

---

## 5. 结果呈现模式

### 5.1 推荐图表顺序

1. **Figure 1：研究识别链**——自报量、prompt-induced observation、系统派生量、诊断量、控制量、独立 outcome 用不同形状/颜色，防止语义混合。
2. **Table 1：量的 ontology**——字段、来源、数学定义、可观察性、允许用途、禁止解释。
3. **Figure 2：V6 审计/时序图**——报告早于 interaction，final private elicitation 早于 resolution；assignment 与 action lifecycle 显式。
4. **Table 2：Measurement Validity design**——variant、预期 invariant/response、metric、gate、cluster unit。
5. **Figure 3：测量结果**——左：exact/paraphrase/permutation 的 JSD/TV；右：evidence direction/strength response；缺失与 terminal 状态另列。
6. **Figure 4：校准与 detector utility**——reliability plot + flagged/unflagged Brier/error；明确 bin denominator。
7. **Table 3：Governance assignment support**——eligible/apply/sham/holdout/ineligible、runs 和独立 task clusters。
8. **Figure 5 或 Table 4：governance estimand**——只有 gate 允许时呈 effect/CI；当前版本应突出 `DEFER_INSUFFICIENT` 条件而非醒目的负点估计。
9. **Table 5：claim audit**——Implemented / Tested / Unknown / Proposed，作为论文诚实边界。

### 5.2 每个结果单元的最小模板

```text
RQ / hypothesis
→ estimand 与独立单位
→ frozen inclusion/missingness rule
→ denominator 与 terminal coverage
→ point estimate + interval/distribution
→ gate decision
→ 该结果支持什么
→ 该结果不支持什么
```

### 5.3 当前 80-run 结果的正确展示

可在“Exploratory characterization”中用一张紧凑表呈现：

- 80/80 schema-5/decision replay；
- B-arm round-1 coverage 0.9221；
- exact-repeat median JSD 0.0050、P90 0.1348、argmax agreement 0.7727（同时报告 pair coverage）；
- K=3 mean Brier 约 0.93，高于 uniform reference 0.667；ECE 0.4046 为 secondary；
- `certainty ≥ 0.7` flag 在该样本中初步反预测；
- governance support：apply 17、sham 7、holdout 2，holdout task clusters=2；
- primary governance decision：`DEFER_INSUFFICIENT`。

不应在摘要中突出 naive apply–holdout 点差或宽 bootstrap CI，因为冻结规则已禁止效应解释。若提及，只能作为“为什么不能解释”的示例，不能成为 headline result。

---

## 6. 对当前论文初稿的具体迁移建议

### 6.1 保留

- “测量优先，治理在后”的方法论；
- 非破坏性、信息结构优先的旧版经验，但明确为 historical hypothesis generator；
- prompt、阈值、派生公式的透明性；
- consensus 与 decision quality 的区分；
- social thermodynamics 作为长期 macro-theory 路线。

### 6.2 重写

- 标题从“基于社会热力学与认知一致性诊断……”改为围绕**可审计显式信念测量与认知治理评估**；社会热力学不占标题。
- 摘要按“问题—方法—当前真实结果—边界—意义”写；删除旧五维状态已有效、无需 ground truth 即能识别异常、治理改善等超证据表述。
- 方法章节从模块清单重组为 ontology、instrument、audit chain、measurement gate、randomized governance estimand。
- 历史 169-run 排序结果放 Related/Development History 或附录，不与 V6 80-run 数据合并统计。
- 所有固定阈值写成 preregistered candidate parameters；当前反预测阈值必须明确失去控制授权。

### 6.3 暂不进入首篇论文主线

- Web3 信誉/质押/惩罚；
- principal-aware 私人 Agent 社会；
- 多步 MCV/CEC resource router；
- ST-1 之前的社会热力学定律；
- legacy async speech willingness、七类 detector 和大而全治理动作目录。

这些内容可在 Discussion 用一段“从可审计 microstate 到异构智能治理”统一，但不得让读者误以为已实现或已验证。

---

## 7. 可直接交给写作 Agent 的执行约束

1. 以 A1 的“明确对象 + 三步链 + 双层评价”和 S2 的“强基线 + 负面边界”作为主要结构范例。
2. 以 S3/S7/S8 构造 confidence 相关工作，不得用单篇正向校准论文概括整个领域。
3. 贡献最多三项，并为每项建立 evidence row；没有现有证据的不得进入摘要贡献句。
4. 首次使用 `belief` 时写成 `explicit belief report` 或“显式概率报告”，除非明确指潜在构念。
5. Prompt 是测量仪器的一部分；把 model/provider/version/config、temperature、选项顺序、上下文、输出 schema 和失败状态写入 protocol。
6. 所有系统派生量给出输入依赖图。若输入含模型自报或 LLM judge，派生量不能被描述成“客观量”。
7. calibration 至少同时报告 proper loss、reliability/ECE（secondary）和 discrimination；阈值效果必须在 held-out/domain-specific 数据上授权。
8. governance 结果必须按 assignment unit 和 task cluster 分析；agent/report 不是独立复制。
9. 结论允许是：建立了可审计评估方法、发现当前 detector 缺乏授权、治理效应尚不可识别。不要为了“像论文”而填充正向结果。
10. 每一强句都附带一个可指向的仓库 artifact、实验表或外部引用；找不到则降级为 hypothesis/design intent。

---

## 8. 范例学习结论

SwarmAlpha 最有竞争力的论文形态不是“一个拥有最多 detector 和治理功能的平台”，而是**一篇对认知治理进行识别约束的方法论文**：它把 LLM 自报量降格为待验证 instrument，把 prompt 和协议显式纳入测量，把可计算量与潜在构念分离，并要求 detector 在获得控制权前通过测量 gate，治理效果再由随机 assignment 与独立 proper loss 识别。

AAMAS 范例表明，长文可以凭借一个清晰的 MAS 张力、精确形式化、可复现系统和诚实的条件性结果成立；不要求所有机制都得到正效应。就当前证据而言，最强叙事是：SwarmAlpha 已经构建了使“治理是否有效”可以被严谨回答的审计与实验底座，并由真实探索数据证明了为什么这种纪律必要——未经校准的高 certainty 可能误导控制，而样本支持不足时系统必须输出 DEFER，而不是制造治理成功。

