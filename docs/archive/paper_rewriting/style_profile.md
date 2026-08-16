# SwarmAlpha 论文写作风格画像

## 1. 目标文体

目标是 AAMAS 长文风格的中文研究白皮书/论文初稿，而非产品白皮书。正文应以一个可证伪贡献为中心，依次回答：研究对象是什么、为什么现有方法不足、每个量是什么、如何获得解释或控制权限、实验如何识别、现有证据说明什么、哪些主张仍被禁止。

## 2. 论证单元

每个关键段落采用：

```text
主张 → 操作定义/机制 → 证据 → 允许解释 → 禁止解释
```

每个结果小节采用：

```text
RQ → estimand/分析单位 → frozen inclusion/missingness
→ denominator/coverage → point estimate/uncertainty
→ Gate → 支持什么/不支持什么
```

## 3. 术语纪律

### 必须使用

- `prompt-conditioned explicit probability report` / 提示词条件化显式概率报告；
- `elicitation contract` / 引出契约或测量协议；
- `reported certainty` / 报告集中度，不裸写 confidence；
- `derived descriptive quantity` / 确定性派生描述量；
- `authorized resolution` / 授权结果；
- `proper loss` / 恰当损失；
- `measurement qualification`、`detector qualification`、`control permission`；
- `protocol-arm assignment` 与 `governance-action assignment` 分开；
- `DEFER_INSUFFICIENT` 与 zero/no effect 分开。

### 禁止或限制

- 不把模型报告称为“读取内部/真实信念”；
- 不把 prompt 当透明管道；
- 不把 entropy、certainty、JSD、TV、lineage count、Gini 或共识直接称为正确性、独立性、公平性或治理质量；
- 不把单样本 Brier 称为 calibration；
- 不把 ECE 作为唯一 calibration/validity 证据；
- 不把 replay 称为外部真实性或测量效度；
- 不把 `R/T/H/F` 称为物理状态或跨任务自然常数；
- 不用“AAMAS-ready”“通用”“证明治理有效”等超出证据的措辞。

## 4. 数学表达风格

每个方程前说明它回答的问题，方程后说明它不能回答的问题。主文只保留与识别链直接相关的量：

1. 概率报告 `\hat p`；
2. certainty、entropy、margin；
3. JSD/TV 与 evidence response；
4. Brier proper loss；
5. coverage/missingness；
6. randomized assignment 与 ITT estimand；
7. cluster-aware uncertainty；
8. 作为未来定义的 CEC/MCV。

旧 `R/T/H/F` 只在宏观态讨论中出现，并以 ST-0 至 ST-4 权限阶梯约束。

## 5. 图表风格

优先图表：

1. 识别链/权限升级图；
2. 量的 ontology 表；
3. report/action/outcome 时序图；
4. Measurement Validity 操纵—指标—Gate 表；
5. coverage + stability + evidence-response 结果；
6. reliability/risk characterization；
7. governance assignment support 与 DEFER；
8. Implemented/Tested/Unknown/Proposed 审计表。

避免架构模块全景图、测试数徽章和功能列表占据主文。

## 6. 语言强度

| 证据 | 可用措辞 |
|---|---|
| 实现/测试 | 已实现；确定性测试保护；可重放 |
| 探索数据 | 在记录条件下观察到；初步表征；与……一致 |
| Gate 未通过 | DEFER；不足以解释；撤销/不授予控制权限 |
| 假设 | 我们检验；若……则；可被以下结果证伪 |
| 设计 | 我们提出；设计意图；进入条件为…… |

“demonstrate/证明”只在逻辑性质或充足的预注册证据上使用。

## 7. 人类作者感

- 每段只推进一个判断；
- 少用连续抽象名词与宣传性形容词；
- 主动写出反例和退化情形；
- 负结果必须转化为权限撤销或路线收缩，而非用更多复杂度掩盖；
- 讨论中允许提出异构智能、私人 Agent 社会和社会热力学，但必须与当前证据分层。

