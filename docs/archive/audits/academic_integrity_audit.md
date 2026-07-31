# 学术诚信核查报告

> **核查日期**: 2026-07-26
> **核查范围**: PAPER_DRAFT.md 全文 + 实验脚本输出 + 原始数据
> **核查方法**: 逐项追溯每个统计数字到源脚本运行结果，对比一致性
> **核查标准**: 是否存在学术造假（fabrication, falsification, overclaiming）

---

## 一、核查结论概览

**总体判断**: 未发现主观造假的意图，但存在 **4 项严重的数字不一致** 和 **1 项过度声明**，如果以当前状态提交，审稿人有合理理由质疑数据完整性。这些问题多数源于多个分析脚本使用不同计算方式且未统一，而非故意操纵，但后果是论文中的数字无法被单一脚本复现。

**风险等级**:
- 🔴 高风险（可能导致 desk reject 或撤稿）: 4 项
- 🟡 中风险（审稿人要求修改）: 4 项
- 🟢 低风险（已诚实标注）: 5 项

---

## 二、🔴 高风险问题

### 问题 1: r ≈ -0.10 不显著（p=0.20）但作为"发现"

**论文声明** (Abstract, §5.4):
> "the correlation between final consensus level (R) and decision quality (Kendall τ) is r ≈ -0.10... consensus is essentially uncorrelated with correctness"

**脚本实际输出** ([recalc_consensus_corr.ts](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\recalc_consensus_corr.ts)):
```
跨任务全样本: r = -0.0988, p = 0.2004 (n=169)
Crisis 子集:  r = -0.0491, p = 0.6644 (n=80)
Supplier 子集: r = -0.0291, p = 0.7844 (n=89)
```

**问题**:
1. r ≈ -0.10 数字正确，但 **p = 0.20 远不显著**
2. 论文将此命名为 "False consensus" 发现，暗示这是一个真实效应
3. "essentially uncorrelated" 描述在技术上正确，但作为"发现"呈现是过度声明
4. 审稿人会问：p=0.20 意味着无法拒绝 r=0，如何称之为"发现"？

**严重性**: 🔴 高
- 这不是造假（数字真实），但**过度声明**（overclaiming）
- 论文需要明确标注 "this correlation is not statistically significant (p=0.20)"
- "False consensus" 命名需要降级为 "Weak or absent correlation"

**建议修正**:
- Abstract 中添加 "(p=0.20, not significant)"
- §5.4 标题改为 "Consensus-Quality Correlation: Weak and Non-Significant"
- 明确说明这是一个探索性观察而非确认性发现

---

### 问题 2: d 值不一致（0.92 vs 0.98 vs 1.82）

**论文声明** (§5.3):
- Crisis full vs none: d = +0.92, power = 88%
- Crisis shuffle vs none: d = +1.44, power = 100%

**三个脚本的输出**:

| 脚本 | full vs none d | shuffle vs none d | 说明 |
|---|---|---|---|
| [powerAnalysis.ts](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\powerAnalysis.ts) | **0.98** | **1.44** | 正式脚本，前缀加载 crisis_full（含 full_fixed，n=32） |
| [verifyFindings.ts](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\verifyFindings.ts) | 未报告 d | **1.82** | 关键发现脚本，计算方式不同 |
| power_analysis_temp.ts（本核查） | **0.921** | **1.439** | ablation 字段过滤（n=24） |

**问题**:
1. **d=0.92 vs d=0.98**: powerAnalysis.ts 用前缀 "crisis_full" 加载了 32 个文件（含 8 个 full_fixed），但报告 n=24（Math.min(32,24)）。d=0.98 基于 32 vs 24 计算
2. **d=1.44 vs d=1.82**: verifyFindings.ts 输出 d=1.82，与论文和 powerAnalysis.ts 的 d=1.44 不一致
3. 论文选择了 d=0.92（接近 ablation 过滤的 0.921）但 power 声称 88%（接近 powerAnalysis.ts 的 92%），**混合了两个不同计算方式的结果**

**严重性**: 🔴 高
- 同一比较有 3 个不同 d 值，审稿人无法复现
- 论文混合使用不同脚本的结果（d 来自一个脚本，power 来自另一个）
- 这不是造假，但**数字来源混乱**，构成"无法复现"问题

**建议修正**:
- 统一使用一个脚本的计算结果
- 推荐用 ablation 字段过滤（n=24 vs 24），因为 full_fixed 是不同条件
- d=0.92, power=89% (来自 power_analysis_temp.ts) 或 d=0.98, power=92% (来自 powerAnalysis.ts)，二选一
- 必须在论文中说明 full_fixed 被排除

---

### 问题 3: 预注册声明无文档支撑

**论文声明**（多处出现）:
- §5.2 表格: "Discovered post-hoc; not pre-registered"
- §6.4: "Future experiments have been pre-registered"
- §7: "No pre-registration for the primary experimental findings. Future experiments have been pre-registered."
- §8: "pre-registered replication of the shuffle effect"

**实际核查**:
- 搜索 `preregistration*`, `pre_reg*` — **无文件**
- 全项目搜索 "pre-registered"/"预注册" — 仅在文档和论文中出现，无独立预注册文档
- 唯一接近的是 [ab_fdecomposition_paired.ts](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\ab_fdecomposition_paired.ts) 注释中的 "H_F（预注册）"

**问题**:
- 论文多次声称 "Future experiments have been pre-registered"，但**不存在预注册文档**
- 预注册通常指在 OSF、AsPredicted 等平台注册实验方案
- 仅有代码注释不算正式预注册

**严重性**: 🔴 高
- 这是一个**虚假声明**（false claim）
- 审稿人如果要求查看预注册链接，将无法提供
- 这可能被判定为学术不端

**建议修正**:
- 立即删除所有 "pre-registered" 声明，改为 "Future experiments will be pre-registered"
- 或者立即在 OSF/AsPredicted 创建预注册文档并补充链接

---

### 问题 4: n=24 per cell 声明但实际用 32

**论文声明** (§5.1, §5.3):
> "Crisis: n = 24 per condition"
> "Crisis (hard task, n = 24 per cell)"

**实际数据**:
- [recalc_consensus_corr.ts](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\recalc_consensus_corr.ts) 输出:
  ```
  Crisis: none=24 full=32 shuffle=24 → 80
  ```
- crisis_full 目录有 32 个文件（24 个 ablation="full" + 8 个 ablation="full_fixed"）
- 虚假共识分析 (N=169) **包含了这 8 个 full_fixed 文件**
- 治理效应分析 (d=0.92) 可能排除了 full_fixed（取决于脚本）

**问题**:
1. 论文说 n=24 per cell，但 crisis_full 实际有 32 个文件
2. 虚假共识分析 N=169 = Crisis 80 + Supplier 89，其中 Crisis 80 包含了 8 个 full_fixed
3. 如果 full_fixed 是 "D1-D4 修复后的补充实验"（如 recalc_consensus_corr.ts 注释所述），它们是否应该包含在分析中？
4. 论文未说明 full_fixed 的存在和处理方式

**严重性**: 🔴 高
- 审稿人如果检查数据会发现 n≠24
- 样本量声明不准确影响 power 分析的可信度

**建议修正**:
- 方案 A: 明确说明 "Crisis full condition has n=32 (24 original + 8 supplementary full_fixed runs); primary analysis uses n=24 via ablation field filtering"
- 方案 B: 如果 full_fixed 与 full 是相同条件（只是代码修复），则统一为 n=32 并更新所有 power 分析

---

## 三、🟡 中风险问题

### 问题 5: 测试数过时（已修复）

**论文声明** (§6.4, Appendix C):
> "307 of 310 passing unit tests"

**实际运行** (2026-07-26):
```
Test Files  19 passed (19)
Tests  332 passed | 3 skipped (335)
```

**状态**: 已修复。论文数字已更新为 "332 passed, 3 skipped"（SOT §1）。本节保留作为历史记录。

---

### 问题 6: 279 sync-engine runs 包含 broken-loop 数据

**论文声明** (§4.2):
> "Empirical trigger rates for the four classical detectors, measured from 279 sync-engine runs"

**实际来源** ([detector_validation_report.md](file:///c:\Users\贺孟元\Desktop\swarmalpha\experiments\v2\detector_validation_report.md)):
> "同步引擎 runs（data/ + data_crisis/ + data_supplier/），共 279 runs"

**问题**:
- 279 包含了 data/ (v1 旧数据) + data_crisis/ + data_supplier/
- 论文 §5.1 说 "120 historical broken-loop" 数据存在
- broken-loop 数据中干预无效，但检测器触发是独立的（不依赖干预生效）
- 用 broken-loop 数据计算检测器触发率**可能合理**（检测器仍会触发），但论文未说明

**建议**: 在 §4.2 添加 "279 runs include 120 broken-loop runs where interventions were logged but could not affect agent behavior; detector trigger rates are independent of intervention efficacy"

---

### 问题 7: N=6 smoke test 在 Abstract 中未充分限定

**论文声明** (Abstract):
> "non-destructive alternatives... reversed this to Δτ = +0.533"

**问题**:
- Abstract 中未标注 N=6
- §5.2 和 §7.8 虽然标注了 "smoke test" 和 "power≈50%"
- 但 Abstract 的呈现方式让读者误以为这是一个可靠结果

**建议**: Abstract 中添加 "(N=6, preliminary)" 或移至正文

---

### 问题 8: r=-0.55 基于 N=10（n=2 in failure group）

**论文声明** (§5.5):
> "intervention count and decision quality correlate at r = -0.55"

**问题**:
- N=10, failure group 仅 n=2
- 论文已标注 "exploratory signal, not a causal claim"
- 但 r=-0.55 的数值在论文中多次引用

**建议**: 进一步强调 "based on N=10 with only n=2 in the failure group; this correlation has extremely low statistical power and should be treated as anecdotal"

---

## 四、🟢 已诚实标注的问题（无需修改）

9. **shuffle 未预注册** — §5.2 已标注 "Discovered post-hoc"
10. **force_reflection 撤回** — §5.5 已详细记录撤回原因
11. **天花板效应** — §5.3 和 §7.10 已标注
12. **单模型限制** — §7.1 已标注
13. **MAST 检测器零触发** — §4.2 和 §7.6 已标注

---

## 五、审稿人视角模拟

### 最可能的拒稿理由（按优先级）

1. **"虚假共识"发现基于 p=0.20 的不显著相关性**
   - 审稿人会写："The headline finding of 'false consensus' is based on a non-significant correlation (r=-0.10, p=0.20). The authors cannot claim a 'finding' from a null result without adequate power analysis. This is overclaiming."
   - **风险**: 直接拒稿

2. **d 值无法复现**
   - 审稿人会写："The effect size d=0.92 in Table 1 cannot be reproduced from the provided code. powerAnalysis.ts produces d=0.98, while verifyFindings.ts produces d=1.82 for shuffle. The authors must clarify which script produces the reported numbers."
   - **风险**: 要求大修

3. **预注册声明无文档**
   - 审稿人会写："The paper claims 'Future experiments have been pre-registered' but no pre-registration link is provided. Please provide the OSF/AsPredicted link."
   - **风险**: 信任危机

4. **n=24 vs n=32 不一致**
   - 审稿人会写："The paper claims n=24 per condition for Crisis, but the data directory contains 32 crisis_full files. Please clarify."
   - **风险**: 要求修改

### 可能的接受路径（如果修正后）

如果修正以上 4 个高风险问题：
- 将"False consensus"降级为"Weak/non-significant correlation"
- 统一所有 d 值到单一脚本输出
- 删除预注册声明或创建实际预注册
- 澄清 n=24 vs n=32

修正后论文定位为"preliminary measurement framework with exploratory findings"，可提交 arXiv 预印本。但顶级会议（AAMAS/AAAI）仍需更多数据。

---

## 六、是否构成学术造假？

**严格定义下的学术造假**（fabrication/falsification/plagiarism）:
- ❌ **无数据捏造**: 所有数字来自真实实验数据
- ❌ **无数据篡改**: 未人为修改实验结果
- ❌ **无抄袭**: 引用规范

**但存在以下问题**:
- ⚠️ **过度声明**: r=-0.10 (p=0.20) 作为"发现"呈现
- ⚠️ **数字不一致**: 同一比较有多个 d 值，论文混合使用
- ⚠️ **虚假声明**: "pre-registered" 无文档支撑
- ⚠️ **样本量不准确**: n=24 声明但实际 n=32

**结论**: **不构成主观学术造假，但存在严重的严谨性缺陷**。如果以当前状态提交，审稿人有合理理由质疑数据完整性。这些问题多数源于多个分析脚本未统一，而非故意操纵，但后果是论文中的数字无法被单一脚本复现。

---

## 七、修正优先级

| 优先级 | 问题 | 修正方式 | 工作量 |
|---|---|---|---|
| P0 | 预注册虚假声明 | 删除或创建 OSF 预注册 | 10 分钟（删除） |
| P0 | r=-0.10 过度声明 | 添加 p 值，降级措辞 | 30 分钟 |
| P1 | d 值不一致 | 统一到单一脚本输出 | 1 小时 |
| P1 | n=24 vs n=32 | 澄清 full_fixed 处理 | 30 分钟 |
| P2 | 307/310 测试数 | 更新为 331/334 | 5 分钟 |
| P2 | 279 runs 说明 | 添加 broken-loop 说明 | 10 分钟 |
| P2 | N=6 在 Abstract | 添加限定 | 5 分钟 |

---

## 八、建议的下一步行动

1. **立即修正 P0 问题**（预注册 + r 值过度声明）
2. **统一 d 值**：选择一个脚本作为权威来源，更新论文
3. **澄清 n=24 vs n=32**：明确 full_fixed 的处理方式
4. **更新测试数**：307/310 → 331/334
5. **修正后再提交 arXiv**

**不要在修正前提交任何平台。**

---

> **核查人**: AI Assistant (GLM-5.2)
> **核查立场**: 严格学术诚信标准，模拟 reviewer 视角
> **免责声明**: 本核查基于代码和数据文件，未验证实验执行过程。如需更高级别的诚信认证，需独立第三方复现实验。
