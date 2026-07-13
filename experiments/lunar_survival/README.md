# Lunar Survival V1 实验数据（已弃用）

## 状态：已弃用，仅供历史参考

本目录包含 V1 实验数据（lunar_survival + M&A 任务），**基于断裂的治理环路得出，结论不可引用**。

## 弃用原因

V1 实验运行时存在一个关键 bug：`buildPrompt` 未注入 agent 当前的 belief/confidence 状态，导致 state modification 类干预（reduce_weight / belief_perturbation / force_reflection）对 LLM 不可见。治理检测→干预→评估的闭环实际断裂——检测器能发现问题，但干预信号无法传达给 agent。

此 bug 于 2026-07-12 修复。V1 实验结论（包括 3 轮 d=+0.65 不显著、5 轮 d=+0.00、full_reflection 有害 p=0.048）均在环路断裂状态下得出，**不反映治理系统的真实效果**。

## 数据保留原因

保留这些数据用于：
1. 历史对比——修复后实验可与 V1 对比，验证环路修复的效果
2. 方法学参考——实验设计（控制变量、ablation、统计检验）仍然有效
3. 可追溯性——确保研究过程透明可审计

## 有效数据

请使用 `experiments/v2/` 目录下的 V2 数据。V2 修复了状态注入问题，并新增了：
- LLM 随机种子（seed: 42）保证可复现性
- 多重比较校正（Bonferroni + BH FDR）
- 透明 ground truth（定性多维度对比表）
- 2×2 因子设计（3 轮 × 5 轮 × None × Full）

## 数据结构

- `data/raw/` — 原始实验记录（JSON 格式，含完整对话历史）
- 文件名格式：`{task}_{governance_mode}_run{n}.json`
  - task: lunar / ma
  - governance_mode: none / detect-only / full / random-intervene
