# 项目优化审计报告

> 审计日期：2026-07-26
> 审计范围：实验复现能力 + 实验体系统一性 + 分析脚本一致性
> 审计方法：三路并行深度调研（目录结构 / 分析脚本 / Campaign 完整性）

---

## 一、核心发现：为什么"实验跑的很乱"

### 1.1 三套实验体系并存且互相依赖

```
experiments/
├── lunar_survival/   ← v1，已弃用，120 文件（断裂环路）
├── v2/               ← 当前主体系，445 文件（含 v1 的 120）
└── campaign/         ← 新体系，仅 28 文件
```

**关键混乱点**：
- campaign/Runner.ts **反向依赖** v2 的 task 定义（require("../../v2/task_crisis")）
- v2/audit_manifest.json 包含 v1 的 120 个 broken-loop 文件
- v2/data/ 下 165+ 个断裂环路文件**无任何标记**，与修复后数据混存

### 1.2 d 值不一致的真正原因

| 脚本 | d 值 | 根因 |
|---|---|---|
| powerAnalysis.ts | 0.98 | startsWith("crisis_full") 误包含 8 个 fixed 文件（n=32） |
| power_analysis_temp.ts | 0.921 | ablation 字段过滤（n=24，干净数据） |
| **verifyFindings.ts** | **1.82** | **第 269 行硬编码字符串，根本不是计算值！** |
| 论文写的 | 0.92 | 接近 ablation 过滤的 0.921 |

### 1.3 分析脚本的严重 bug

| Bug | 位置 | 影响 |
|---|---|---|
| **d=1.82 硬编码** | verifyFindings.ts:269 | 论文引用的 d 值无法复现 |
| **cohensD 公式错误** | backtest_weight_assumption.ts:187 | 用简单平均 `(va+vb)/2` 替代加权 pooled |
| **kendallTau 无 tie 修正** | verifyBlindSpot.ts:163-185 | τ 值在有 ties 时不准确 |
| **loadSummary 返回空数组** | analyzeSupplierFull.ts:48-56 | summary.json 只有 8 个 fixed，Crisis 对比全部为 0/NaN |
| **注释与代码不一致** | recalc_consensus_corr.ts:8 | 注释说排除 fixed，代码实际未排除 |

### 1.4 统计函数重复实现

| 函数 | 重复数 | 问题 |
|---|---|---|
| mean | 13 份 | 12 个脚本未用 statsShared |
| std/sampleStd | 12 份 | 两种除法（/n vs /(n-1)）混用 |
| cohensD | 4 份 | 1 份公式错误 |
| permutationTest | 9 份 | nPerm 不统一（5000 vs 10000），seed 不统一 |
| pearsonCorr | 4 份 | 公式一致但重复 |

### 1.5 数据存储规范问题

| 问题 | 证据 |
|---|---|
| codeVersion 字段缺失 | v2/data/ 下 165+ 文件无 codeVersion |
| crisis_full vs crisis_full_fixed 混存 | 同一目录 32 文件，论文 n=24 vs 实际 n=32 |
| fraud 系列 7 个子目录爆炸 | 用目录后缀区分版本，非 codeVersion 字段 |
| summary.json 严重过时 | data_crisis/summary.json 报 8 个，实际 80 个 |
| manifest 手动生成 | v2 和 campaign 均需手动 npx，未集成到 run 流水线 |

### 1.6 Campaign 架构现状

| 阶段 | 评分 | 状态 |
|---|---|---|
| Runner | 5/5 | 完整闭环，含 resume、错误隔离 |
| MetricComputer | 5/5 | E1-E9 全覆盖 |
| StatisticalTest | 5/5 | 置换+Bootstrap+Holm+F分布 |
| **FigureGenerator** | **2/5** | **仅 E1/E2/E6 有图，6/9 实验无图** |
| ReportGenerator | 3/5 | 仅 E1/E2/E6 有定制章节 |
| run_all.ts | 4/5 | E9M 未注册 |

### 1.7 复现能力真相

| 维度 | 可复现性 |
|---|---|
| Agent 初始状态 | ✅ 完全可复现（mulberry32(seed)） |
| Governance 决策 | ✅ 完全可复现 |
| Bootstrap/Permutation p 值 | ✅ 完全可复现 |
| **LLM 输出** | **❌ 本质不可复现**（即使 temp=0，API 端有非确定性） |
| 最终 Kendall τ | ⚠️ 高方差（依赖 LLM 输出） |

**future.md 声称"实验完全可复现"是部分错误**：audit_manifest 中同 seed 重跑产生不同 SHA-256。

---

## 二、优化路线图

### Phase A：数据治理（零风险，不跑实验）

**A1. 隔离 broken-loop 数据**
- 将 v2/data/ 下 2026-07-13 之前的文件迁移至 data_legacy_broken_loop/
- 或添加 .legacy.json 后缀
- 从 audit_manifest.json 统计中剔除

**A2. 规范 crisis_full_fixed**
- 迁移至独立目录 data_crisis_fixed/
- 或重命名为 crisis_full_sortfixed_（消除"修复版"误解）

**A3. 统一 codeVersion**
- 为 v2/run.ts 添加 --codeVersion CLI 参数
- 为老数据补标 codeVersion（基于 timestamp 推断）

**A4. 重新生成 summary.json**
- 修复 data_crisis/summary.json（从 8 个 → 80 个）

### Phase B：脚本统一修复（低风险）

**B1. 修复硬编码 bug**
- verifyFindings.ts:269 — d=1.82 改为实际计算
- backtest_weight_assumption.ts:187 — 修复 cohensD 公式
- verifyBlindSpot.ts:163-185 — 补 tie 修正或改用 statsShared.kendallTau
- recalc_consensus_corr.ts:8 — 代码与注释一致化

**B2. 统一数据加载层**
- 在 statsShared.ts 新增 loadExperiments() 函数
- 默认用 ablation 字段过滤（排除 fixed）
- 所有分析脚本改用此函数

**B3. 消除统计函数重复**
- 13 份 mean → 全部改用 statsShared.mean
- 12 份 std → 全部改用 statsShared.std/sampleStd
- 4 份 cohensD → 全部改用 statsShared.cohensD
- 9 份 permutationTest → 统一 nPerm=10000, seed=PERMUTATION_SEED

### Phase C：Campaign 补全（中风险）

**C1. 补全 FigureGenerator**
- 为 E3/E4/E5/E7/E8/E9 添加图表生成
- 每个实验至少一张图

**C2. 注册 E9M 到 run_all.ts**
- 在 MAIN_EXPERIMENTS 数组中添加 E9M_ALL

**C3. 补全 ReportGenerator**
- 为 E3/E4/E5/E7/E8/E9 添加定制章节

**C4. 集成 manifest 生成**
- 在 run_all.ts 末尾自动调用 generate_manifest.ts

### Phase D：复现工具链（中风险）

**D1. v2 → Campaign 数据迁移工具**
- 新建 migrate_v2.ts
- 关键限制：迁移后只能跑 Belief 分析（v2 无 cognitiveTrajectory）

**D2. 通用 A vs B 对比工具**
- 新建 compare.ts
- 复用 StatisticalTest 的 permutationTest + cohensD

**D3. JSON Schema 校验**
- 用 ajv 校验 RawRunData 必填字段

**D4. package.json 标准化入口**
- 添加 "campaign": "tsx experiments/campaign/run_all.ts"
- 添加 "manifest": "tsx experiments/v2/generate_manifest.ts"

---

## 三、优先级建议

| 优先级 | Phase | 工作量 | 收益 |
|---|---|---|---|
| **P0** | B1 修复硬编码 bug | 2 小时 | 消除 d=1.82 等虚假数字 |
| **P0** | A1 隔离 broken-loop | 1 小时 | 避免误分析无效数据 |
| **P0** | A2 规范 crisis_full_fixed | 30 分钟 | 消除 n=24 vs n=32 歧义 |
| **P1** | B2 统一数据加载层 | 3 小时 | 消除 startsWith 污染 |
| **P1** | B3 消除统计函数重复 | 4 小时 | 降低维护成本 |
| **P1** | C2 注册 E9M | 5 分钟 | 消除孤儿配置 |
| **P2** | A3 统一 codeVersion | 2 小时 | 版本可追溯 |
| **P2** | A4 重新生成 summary | 1 小时 | 修复过时元数据 |
| **P2** | C1 补全 FigureGenerator | 2-3 天 | 论文图表完整 |
| **P2** | C4 集成 manifest | 30 分钟 | 自动化审计 |
| **P3** | D1 v2 迁移工具 | 2-3 天 | 数据格式统一 |
| **P3** | D2 通用对比工具 | 1-2 天 | 分析标准化 |
