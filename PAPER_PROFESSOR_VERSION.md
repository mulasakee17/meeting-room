# 基于社会热力学的LLM多智能体认知治理系统的研究与应用

**贺孟元**（松山湖未来学校科创班）

---

## 摘要

大语言模型（LLM）多智能体系统在协作决策中存在回声室、权威偏差、群体极化等集体失败风险，但现有治理工具仅关注安全层，缺乏对认知层偏差的运行时检测手段。Cemri等提出的MAST失败分类体系标注了14种失败模式，但将检测与干预留作未来工作[1]。针对这一空白，本文提出基于社会热力学的认知治理框架：定义四维状态变量（Kuramoto序参量 $R$、归一化温度 $T$、Shannon熵 $H$、Helmholtz型自由能 $F$），设计七种偏差检测器与基于 $F$ 分解的干预排序策略，并提出一种五因子加权的发言意愿公式实现去中心化的内容驱动发言选择。在416次初步实验中，系统发现三个反直觉结论：共识水平与决策质量几乎不相关（$r \approx -0.10$）；打破角色-信息一致性（$d=1.44$）优于讨论内治理干预（$d=0.92$）；干预次数与决策质量负相关（$r=-0.55$），存在依赖链级联反火风险。实验表明，该框架能够以零额外LLM调用的代价实现运行时偏差检测，为多智能体认知治理提供了可工程化的信号基础。

---

## 1. 背景介绍

LLM多智能体框架（AutoGen[16]、CrewAI、LangGraph等）越来越多地用于协调团队完成复杂决策。在这一过程中，它们继承了社会心理学研究中长期关注的集体失败模式：回声室效应、权威偏差、群体极化和过早共识。MAST分类体系从七个框架的1600余条对话轨迹中标注了14种失败模式，其中智能体间对齐失败（FC2）是最大的单一类别[1]，但MAST明确将检测与干预列为未来工作。与此同时，生产级治理工具——微软Agent Governance Toolkit、NVIDIA OpenShell、OWASP Agentic Top 10[2]——聚焦于安全边界（未授权工具调用、预算超限、提示注入），认知层（在讨论过程中检测群体是否正在滑向偏差性共识）在学术分类和生产工具中均未得到解决。

本文针对上述两个具体空白：（1）缺乏面向讨论健康的运行时相变信号；（2）MAST目录中三种FC2失败模式（FM-2.4信息隐瞒、FM-2.5输入忽视、FM-2.6推理-行为不匹配）尚无检测器实现。我们提出社会热力学框架，将统计物理相变概念工程化为可运行的治理信号，并设计了一种五因子加权的发言意愿公式实现去中心化的发言选择。

---

## 2. 相关研究

本文的工作涉及三个技术领域：观点动力学的统计物理建模（§2.1）、多智能体偏差检测与失败分类（§2.2）、以及多智能体发言选择机制（§2.3）。

### 2.1 观点动力学的统计物理建模

将统计物理模型应用于观点动力学已有较长的研究历史。Pluchino等（2004）首次将Kuramoto模型适配到观点动力学中[3]，Pradhan和Ujjwal（2025）进一步发现其变体在双极化和共识之间存在爆炸性相变，多样性群体更易达成共识[4]——直接支撑了本文基于 $R$ 的共识检测设计。在热力学概念的社会化应用方面，Tsekov提出"社会热力学2.0"模型[5]，López-Corona等将Helmholtz自由能应用于社会合作可持续性分析[6]，Tomé等将观点形成纳入随机热力学框架[7]，Galam通过零温Ising模型分析回声室与随机极化的形成[8]。上述工作的共同特征是将相变量视为描述性量，未连接到可部署的运行时检测器；本文将相信号工程化为闭环的检测-干预-评估周期。

### 2.2 多智能体偏差检测与失败分类

MAST分类是描述性的，检测和干预被明确推迟为未来工作[1]。本文的治理运行时为其中三种FC2模式实现了检测器——FM-2.4（信息隐瞒）、FM-2.5（输入忽视）、FM-2.6（推理-行为不匹配）——迈出了从分类到工具的第一步。在认知偏差编程方面，Liu等的CoBRA工具包发现自然语言描述无法跨模型一致地控制偏差[9]，促使本文采用数学化、可解释的检测指标；Nudo等发现LLM智能体在社交互动中系统性放大极化信号的"生成性夸张"现象[10]。

在共识与决策质量关系方面，Du等将多智能体辩论引入为一种假设共识收敛即正确性的范式[11]，而本文发现共识（Kendall $\tau$）与决策质量几乎不相关（$r \approx -0.10$），构成对该假设的直接实证反例。Cui等在Free-MAD框架中独立质疑了"共识=正确性"假设[12]，Riedl基于偏信息分解（PID）的信息论框架区分真实协同与虚假时间耦合[13]，为本文 $R$ 基共识度量的局限提供了替代方案。Jin等在同行评审模拟中量化了权威偏差（占决策方差的37.1%）[14]，Liang等发现多智能体辩论中的思维退化（DoT）现象——LLM一旦建立信心便无法产生新视角[15]，为 `force_reflection` 干预在锁定立场上的失效提供了理论解释。

### 2.3 多智能体发言选择机制

发言选择是多方LLM讨论中的核心问题。AutoGen的SelectorGroupChat采用集中式LLM选择器：模型读取完整对话历史后输出下一发言者名称[16]，每轮发言选择需一次额外LLM调用。LangChain的多智能体竞价机制采用去中心化拍卖：每个智能体用LLM输出一个相关性整数出价，最高者发言。

Yang等（2026）提出的TBS框架引入了"发言意愿"作为智能体内部状态之一，但通过编排器（orchestrator）协调竞争性发言意图，而非闭式数学公式[17]。本文提出的五因子加权发言意愿公式在三个方面与上述工作区分：（i）完全去中心化——每个智能体独立计算分数；（ii）数学可分析——闭式表达式允许性质证明；（iii）零额外LLM成本——所有因子从维护的状态变量计算。

---

## 3. 算法与系统设计

### 3.1 系统总体架构

SwarmAlpha认知治理运行时实现五阶段循环：**观察→建模→检测→干预→评估**。LLM仅执行感知功能——从自然语言输出中提取结构化信念，所有治理逻辑均为基于信念向量的确定性数学运算。

### 3.2 热力学状态变量

将智能体的结构化信念输出 $b_i \in [-1, 1]$ 视为一个集体，定义四个汇总变量。信念到相位的映射采用半圆映射：$\theta_i = (\pi/2) \cdot b_i$，使 $\theta \in [-\pi/2, \pi/2]$，确保完美极化时 $R \approx 0$。

**表1. 热力学状态变量定义**

| 符号 | 定义 | 含义 |
|------|------|------|
| $R = \|\sum_i e^{i\theta_i}\| / N$ | Kuramoto序参量 | 方向性共识（$R=1$：完美对齐；$R \to 0$：平衡对立） |
| $T = \sigma_{\text{pop}}(b)$ | 归一化温度 | 信念的总体标准差 |
| $H = H_{\text{5bins}}(b) / \log_2 5$ | 归一化Shannon熵 | 五等宽区间上的分布不确定性 |
| $F = (1-R) + T \cdot H$ | 社会自由能 | 总无序的结构性与热性分量分解 |

自由能 $F$ 将无序分解为两个正交来源：$(1-R)$ 捕获结构性无序（信念向量在相位圆上的位置错位），$T \cdot H$ 捕获热性无序（弥散与分布不确定性的乘积）。需要指出，这些变量并非关于语言模型中物理实在的断言，而应理解为**操作性启发式**：为治理决策提供比纯文本分析更及时信号的粗粒度汇总统计量。

### 3.3 偏差检测器组

系统包含七种偏差检测器。四种经典检测器针对回声室、权威偏差、极化和过早共识，信号分别基于内容Jaccard相似度、引用集中度、双峰系数和轮次加权共识水平。三种MAST对齐检测器针对FM-2.4（信息隐瞒：≥2智能体有证据而≥1为空）、FM-2.5（输入忽视：被引用≥2次但未回引）和FM-2.6（推理-行为不匹配：rank-1项的belief非最大值且差值>0.3）。

### 3.4 基于F分解的干预排序

当多个检测器同时触发时，干预通过分解 $F$ 而非固定顺序来排序优先级：`force_reflection`针对热性无序（$T \cdot (1-\text{structural})$），`reduce_weight`抑制高噪声智能体（$T \cdot H$），`introduce_diversity`注入替代信息（$R \cdot (1-H)$），`continue_discussion`延长早期讨论（$R \cdot (1-H) \cdot (1-F)$）。其中后两种因实证效果差（有效率分别为9.1%和0%）而默认禁用。

### 3.5 内容驱动发言意愿公式

本文提出一种五因子加权的发言意愿公式，用于在异步讨论中实现去中心化的内容驱动发言选择。对智能体 $i$，其原始发言意愿分数定义为：

$$W_i = 0.6 \cdot E_i + \phi(\Delta b_i) + \psi(b_i, \bar{b}) + 0.3 \cdot D_i - 0.5 \cdot P_i$$

其中 $E_i \in [0,1]$ 为独有信息曝光度（独有关键词在讨论文本中的覆盖率，权重0.6）；$\phi(\Delta b_i)$ 为信念变化分档加分（$\Delta b > 0.3$ 加0.4，$> 0.1$ 加0.2）；$\psi(b_i, \bar{b})$ 为共识偏离分档加分（$\|b-\bar{b}\| > 0.4$ 加0.4，$> 0.2$ 加0.2）；$D_i \in \{0,1\}$ 为依赖触发（前置依赖信息已出现，加0.3）；$P_i \in \{0,1\}$ 为刚发过言惩罚（最近2周期内发过言，减0.5）。原始分数通过 $w_i = (\tanh(W_i) + 1) / 2$ 归一化到 $[0,1]$，再由双阈值门控：$w_i \geq 0.82$ 必须发言，$0.40 \leq w_i < 0.82$ 加权随机发言（概率 $p = (w_i - 0.40) / 0.42$），$w_i < 0.40$ 沉默；若所有智能体均未通过阈值，选择意愿最高者发言确保讨论不停滞。该公式完全去中心化、闭式可数学分析、零额外LLM成本。

### 3.6 热力学终止判定

异步引擎在热力学状态指示结晶时终止讨论。主要判据为 $R \geq 0.85$，同时设置40条发言的硬上限。终止判定器基于 $(R, T, H)$ 轨迹将状态分类为结晶态（真收敛）、淬火态（伪收敛）、混沌态（发散）和稳定态，解决了MAST失败模式FM-1.5（"不知何时停止"）。

---

## 4. 实验结果及分析

### 4.1 实验设置

**任务。** 两种隐藏档案排序任务。*危机响应*（困难任务，基线 $\tau = 0.41$）：五名智能体在五个维度上排序五个危机区域，每人持有2-3个维度的私有信息。*供应商选择*（中等任务，基线 $\tau = 0.68$）：五名智能体排序五家供应商，每人持有其领域维度的私有数据加1-2个重叠维度的部分数据。

**条件。** `none`（无检测无干预）、`full`（全部检测器激活，应用干预）、`shuffle`（智能体私有知识旋转+2位，角色标签不变——打破角色-信息一致性但不改变信息内容）。

**基础设施。** 模型：DeepSeek-V3，温度0.2。五名智能体。三轮（同步引擎）或最多40条发言（异步引擎）。危机任务 $n=24$ 每条件，供应商任务 $n=30$ 每条件（shuffle 组 $n=29$）。共416次实验。统计方法采用Kendall $\tau$-b、置换检验（$10^4$次重排，种子42）、Cohen's $d$ 和Benjamini-Hochberg FDR校正。

### 4.2 主要发现：结构重排优于过程治理

**危机任务（困难，$n=24$ 每条件）：**

| 条件 | $\tau$（$\mu \pm \sigma$） | $d$ vs. none | $p$ | 功效 |
|------|---------------------------|--------------|-----|------|
| `none` | $0.408 \pm 0.182$ | — | — | — |
| `full` | $0.617 \pm 0.263$ | +0.92 | 0.005 | 88% |
| `shuffle` | $0.717 \pm 0.243$ | +1.44 | <0.001 | 100% |

**供应商任务（中等，$n=30$ 每条件）：**

| 条件 | $\tau$（$\mu \pm \sigma$） | $d$ vs. none | $p$ | 功效 |
|------|---------------------------|--------------|-----|------|
| `none` | $0.680 \pm 0.186$ | — | — | — |
| `full` | $0.767 \pm 0.183$ | +0.47 | 0.089 | 43% |
| `shuffle` | $0.697 \pm 0.204$ | +0.09 | 0.78 | 6% |

在困难任务上，打破角色-信息一致性产生大效应（$d=1.44$），超过讨论内治理的效果（$d=0.92$）。在中等任务上，shuffle因天花板效应而效果微弱。这一任务依赖性表明：结构重排的效果随任务难度递增，集体讨论质量的相边界由角色与信息的配对方式结构性预设。

### 4.3 虚假共识：共识与正确性不相关

在所有条件和两任务中（$N=169$），最终共识水平（$R$）与最终决策质量（$\tau$）的Pearson相关系数为 $r \approx -0.10$（$p=0.66$，统计不显著）。该相关系数接近零且方向轻微负向，表明共识水平不能作为正确性的可靠代理：智能体可以在信念标准差低于0.05的情况下产生错误排名；反之，高质量排名可从分歧较大的讨论中产生。$R$ 衡量的是方向一致性而非方向正确性——DeGroot模型关于"收敛即正确"的假设在本设置中未获实证支持。

### 4.4 干预效果：反火风险

在一个 rogue-agent 场景中（$N=10$），干预次数与决策质量的相关系数为 $r=-0.55$。成功组（$\tau \geq 0.6$）平均4.0次干预，失败组（$\tau < 0.4$）平均9.5次。此结果被视为探索性信号而非因果断言，因为混杂明显：更困难的场景同时触发更多检测器和更低的决策质量。

同一场景中，依赖链最下游的智能体 $a_2$ 被命中24次——对 rogue 智能体 $a_1$ 的 `reduce_weight` 改变了 $a_2$ 的发言模式，使其类似回声室重复，进而触发对 $a_2$ 的 `reduce_weight`。这揭示了基于症状检测的结构性脆弱：当干预改变症状而非原因时，可在依赖链中级联传播。

### 4.5 发言意愿公式的初步验证

异步引擎实验（采用相同的 Crisis 任务但延长讨论至五轮以匹配异步发言预算）对比了三种配置（每组 $n=10$）：A组（同步引擎基线，五轮讨论）$\tau=0.88 \pm 0.10$，发言25.0次；B组（异步 content_driven 发言意愿公式 + 固定5轮终止）$\tau=0.72 \pm 0.22$，发言12.2次；C组（异步 content_driven + 热力学自适应终止）$\tau=0.46 \pm 0.17$，发言22.4次。content_driven 模式通过依赖触发因子确保了关键信息链的连贯性，避免了早期 random_prob 模式中关键智能体沉默导致的依赖链断裂。但A组基线过高（$\tau=0.88$）提示任务可能过于简单，存在天花板效应；C组在自适应终止下 $\tau$ 反而低于B组，原因是热力学阈值在困难任务上需任务难度感知标定。该组实验为发言意愿公式提供了机制验证但非功效充分的统计对比，扩样至 $n=30$ 后方可作正式结论。

---

## 5. 总结与展望

本文将社会热力学——从结构化信念输出中确定性计算的四维状态空间 $(R, T, H, F)$——工程化为LLM多智能体系统的运行时治理信号，结合七种偏差检测器、基于自由能分解排序的干预策略、五因子加权发言意愿公式和热力学结晶终止准则。416次初步实验揭示了三个具有系统设计意义的发现：共识与正确性不相关（$r \approx -0.10$）；结构重排可优于过程治理（$d=1.44$ vs $0.92$）；干预存在依赖链级联反火风险（$r=-0.55$）。

本文的局限包括：（1）所有实验基于单一模型（DeepSeek-V3），跨模型普适性未验证；（2）理论命题部分形式化（8个中4个已证明，4个为猜想）；（3）MAST对齐检测器通过单元测试但尚无实证触发数据；（4）部分实验组样本量不足（供应商任务功效仅43%）；（5）`force_reflection` 干预的 rogue-agent 反向强化结论因归因混淆而撤回。后续工作将沿以下方向展开：跨模型验证（已预注册GPT-4o、Claude、Zhipu模型的复制协议）、检测器标定（需200+次实验以标定真阳性/假阳性率）、理论形式化（与数学家合作将猜想推进为定理）、发言意愿公式的消融实验（逐一去除各因子验证其必要性）。本文是多智能体认知治理这一问题的早期贡献，框架、代码和数据均为开源，欢迎合作与批判性复制。

---

## 参考文献

[1] Cemri M, Pan M Z, Yang S, et al. Why Do Multi-Agent LLM Systems Fail?[J]. arXiv preprint arXiv:2503.13657, 2025.

[2] OWASP. Top 10 for Agentic Applications for 2026[S]. OWASP Standard, 2025.

[3] Pluchino A, Latora V, Rapisarda A. Changing Opinions in a Changing World: A New Perspective in Sociophysics[J]. International Journal of Modern Physics C, 2004. arXiv:cond-mat/0410217.

[4] Pradhan S, Ujjwal S R. Diversity mitigates polarization and consensus in opinion dynamics[J]. arXiv preprint arXiv:2509.19860, 2025.

[5] Tsekov R. Social Thermodynamics 2.0[J]. arXiv preprint arXiv:2307.05984, 2023.

[6] López-Corona O, Padilla P, Huerta A, et al. Measuring social complexity and the emergence of cooperation from entropic principles[J]. arXiv preprint arXiv:1502.05741, 2015.

[7] Tomé T, Fiore C E, Oliveira M J. Stochastic thermodynamics of opinion dynamics[J]. arXiv preprint arXiv:2212.07268, 2022.

[8] Galam S. Spontaneous Symmetry Breaking, Group Decision Making and Beyond 1: Echo Chambers and Random Polarization[J]. arXiv preprint arXiv:2410.02582, 2024.

[9] Liu X, Shang H, Jin H. CoBRA: Programming Cognitive Bias in Social Agents Using Classic Social Science Experiments[C]. Proceedings of CHI 2026. arXiv:2509.13588.

[10] Nudo J, Pandolfo M E, Loru E, et al. Generative Exaggeration in LLM Social Agents: Consistency, Bias, and Toxicity[J]. arXiv preprint arXiv:2507.00657, 2025.

[11] Du Y, Li S, Torralba A, et al. Improving Factuality and Reasoning in Language Models through Multiagent Debate[C]. Proceedings of ICML 2024. arXiv:2305.14325.

[12] Cui Y, Fu H, Zhang H, et al. Free-MAD: Consensus-Free Multi-Agent Debate[J]. arXiv preprint arXiv:2509.11035, 2025.

[13] Riedl C. Emergent Coordination in Multi-Agent Language Models[C]. Proceedings of ICLR 2026. arXiv:2510.05174.

[14] Jin Y, Zhao Q, Wang Y, et al. AgentReview: Exploring Peer Review Dynamics with LLM Agents[C]. Proceedings of EMNLP 2024 (Oral). arXiv:2406.12708.

[15] Liang T, He Z, Jiao W, et al. Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate[C]. Proceedings of EMNLP 2024. arXiv:2305.19118.

[16] Wu Q, Bansal G, Zhang J, et al. AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation[J]. arXiv preprint arXiv:2308.08155, 2023.

[17] Yang K, Peng T Q, Lee S, et al. Think-Before-Speak: From Internal Evaluation to Public Expression in Multi-Agent Social Simulation[C]. Proceedings of KDD'26 Workshop, 2026. arXiv:2606.03137.

[18] Stasser G, Titus W. Pooling of unshared information in group decision making[J]. Journal of Personality and Social Psychology, 1985, 48(6): 1467-1478.
