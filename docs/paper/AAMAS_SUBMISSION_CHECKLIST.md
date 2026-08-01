# AAMAS 投稿审查清单（逐节诊断 + 必补实验 + 审稿人必问问题）

> 审查对象：`docs/paper/PAPER_DRAFT.md`（2026-07-26 draft）
> 审查基准：AAMAS 主会长文审稿标准
> 审查日期：2026-08-01
> 结论先行：**选题契合 AAMAS（agent 治理），但当前稿子按长文标准直接投，大概率 border-line reject。核心缺口不是写作，是实验证据强度 + 核心创新点自证伪后的叙事重构 + 机制与实验脱节。**

---

## 一、逐节诊断

### 1. Abstract — 硬伤（格式 + 重复）
- **超长且内部重复**：摘要里 v2.0/v2.1 干预的 Δτ 描述出现两遍（第一段末尾 + 最后一段几乎全文重复），AAMAS 摘要通常 ≤150–200 词，当前明显超限，可能被 desk reject。
- **数字过载**：塞了 d=1.44、d=0.92、N=24、N=6、Δτ 等大量数字，把摘要当成了实验表。
- **语气与证据强度不匹配**：finding 2 用 confirmatory 语气（"structural precursors dominate"），但它是单任务、单模型、post-hoc 发现。
- **没回答 "so what"**：摘要讲了框架和 finding，但没讲"对 AAMAS 读者（agent 研究者）意味着什么可操作的设计原则"。

**修复方向**：压缩到 ≤180 词；删除干预实验细节（放正文）；三个 finding 各自一句话 + 一个统一的可操作结论；明确贡献边界。

### 2. Introduction — 自相矛盾的风险
- 标题/定位是 **"measurement framework"**，但 1.3 塞了大量干预实验的 Δτ 数字（L45）——intro 不该放实验细节。
- 大量自我贬低式表述（"early stage""preliminary""provisional"）——诚实是优点，但 AAMAS 审稿人会反问"既然这么初步，为什么现在投？"需要把"初步"转化为"刻意聚焦 measurement 层、治理层明确为 open problem"的强定位。
- 核心贡献点（社会热力学）在第 3 节被自己证伪（R/T/H 塌缩 1 维）——**intro 里还在用"three findings"撑门面，但最大的"发现"其实是负面**。intro 的叙事必须围绕"负面发现的科学价值"重构，否则和正文打架。

### 3. Related Work — 与 AAMAS 社区脱节 + 机制脱节
- **§2.5 Speaker Selection 与论文主体严重脱节**：花一大节讲 content_driven 说话机制，但所有实验用的是同步引擎固定轮次（sync engine, 3 rounds），**根本没有用 content_driven 说话**。审稿人必问：为什么不把机制放进实验？
- **缺 AAMAS 社区核心文献**：social choice theory（投票/聚合与正确性）、argumentation-based dialogue、normative systems、game-theoretic 恶意 agent 模型。当前引用偏"LLM-agent 实证"圈，AAMAS 审稿人会觉得没接上本领域主干。
- **2026 引用需逐一验证**：Refs 21–25（arXiv 2603/2605/2606 系列）和 "Anonymous (2026)" 必须确认存在、页码/venue 准确——审稿人查引用是常见动作，假引用 = 直接毙。

### 4. Theory — 理论贡献薄弱
- **Proposition 1a/1b/1c 大多是 Kuramoto 定义的直接推论**（全同→R=1 是定义级事实），AAMAS 审稿人不会把它当"理论贡献"。
- **"AI-assisted proofs pending human verification"（L161）**——这句在正式投稿里是致命的，必须让彭教授/实验室数学家在投稿前完成人工验证，并删除该句。
- **核心危机：R/T/H 被证伪塌缩为 1 维（r=0.9175）**。正文用 correction box 诚实标注，但审稿人会问：既然三个变量退化成一个维度，"社会热力学"框架的独立价值是什么？现在的 reframing 只有一段话，不够。**必须正面论证：塌缩本身是发现（MAS vs 物理系统的差异），且 δ 诊断/MeasurementLayer 的新路径（r=0.274 解耦）才是框架的"升级版"——建议把论文主证据从旧 R/T/H 切换到新路径**。
- §3.4 干预不动点分析大部分是 conjecture，且基于简化假设（w_ij 时不变），证据链弱。

### 5. Framework — 多个"实现但无效/未验证"
- **3 个 MAST 检测器 0 次实验触发**（L206）——审稿人必问"为什么实现但不验证"。
- **echo chamber 检测器已被自己判定无效**（Limitations #12：separation=0.000）——**保留在框架里却标注无效**，审稿人会问为什么不删。要么删，要么明确它只是 backward-compat 占位。
- **F-decomposition 排序机制 A/B 显示无显著差异**（d_z=−0.354）——核心排序机制无实证支持，却作为默认。
- 阈值全是启发式，无 ground-truth 校准。

### 6. Experiments — 最脆弱的一节
- **几乎全部 claim 是 exploratory 或 confirmatory-but-unreplicated、single-model**（5.2 的证据强度表自己暴露了）。
- **主要 positive finding（shuffle d=1.44）post-hoc、未预注册、单任务、单模型**。
- **finding 3（共识-质量 r≈−0.10, p=0.20 不显著）作为主要 finding**——"一个不显著的结果当卖点"，实证审稿人普遍保守，必须论证 null result 的独立价值（挑战 DeGroot 假设），否则会被删。
- **多重比较**：正文 p 值（0.0038 等）未统一说明是否 BH-FDR 校正；审计报告指出 4 个跨任务主比较未校正——审稿人会抓。
- **干预归因**：多干预同轮混杂（force_reflection 归因已撤回）——正文章节诚实，但审稿人会要求干净的归因隔离实验。
- **🔴 干预有效性判定有双重缺陷（深挖发现，影响 README 附录有效率表 + 论文 §5.6）**：
  1. **无因果对照**：所有"有效率"数字（`reduce_weight` 81.8%、`force_reflection` 79.4%、`introduce_diversity` 4.7%）都来自 `interventionAnalysis.ts` 的 `|beliefAfter − beliefBefore| > 0.05`——**干预后目标 agent 的 belief 动了就算"有效"**，但 LLM 温度 0.2 的自然波动也会让 belief 移动，无对照无法归因到干预。
  2. **`reduce_weight` 测量错位**：它的 prompt 发给接收者 a2–a5（"DO NOT defer to a1"，让他们独立），但"有效率"检查的是**目标 a1 自己的 belief 是否移动**——**测的变量 ≠ 干预作用的变量**。一个成功让 a2–a5 独立于 a1 的干预可能被记为"无效"，反之亦然。
  3. **实测数据佐证**：169 run 中 36.2% 的 belief 轮间零变化（主要是 LLM 信念锚定）——belief-move 判定的"有效性"信号本身就很稀疏。
  → **E10（P0）**：加对照（干预 vs 无干预）、`reduce_weight` 改测接收者独立性，重算所有有效率数字。

### 7. Discussion / Limitations / 写作
- 6.3 role-coherence 假说未形式化——OK 但需明确是 future work。
- Limitations 12 条非常诚实（加分），但其中 single-model、2 tasks、MAST 0 验证、无预注册、smoke test 都是"硬伤级"。
- **全稿重复**：v2.0/v2.1 Δτ 出现至少 5 次（摘要/Intro/5.5/Discussion/Conclusion）——必须收敛到一次。
- **8 页限制**：当前是 546 行 md，编译成 PDF 后远超 8 页，需要大幅压缩。
- References 未按 AAMAS 格式规范；"Target venues: arXiv → AAMAS" 混了预印本和会议。

---

## 二、投稿前必须补的实验（按优先级 + 成本）

| # | 实验 | 解决审稿人哪个问题 | 成本 | 优先级 |
|---|---|---|---|---|
| E1 | **同代码版本跨模型复现**（DeepSeek + Qwen + 智谱，至少 3 模型，同一 codeVersion） | 单模型泛化性（F16 混杂） | ~¥15–25 | 🔴 P0 |
| E2 | **第三个任务**（非 hidden-profile ranking，如分类/开放式决策） | 任务多样性（AAMAS 期望 5+） | 设计 + ~¥10 | 🔴 P0 |
| E3 | **Supplier 扩样至 n=72**（或换一个 baseline 低的硬任务） | 功效 43% → 80% | ~¥10 | 🔴 P0 |
| E4 | **E9 新路径 200 runs**（4 组 A/B/C/D） | 把主证据从旧路径切到新路径（δ 诊断 + 解耦 R/T/H） | ~¥15–20 | 🔴 P0 |
| E5 | **MAST 检测器实证触发验证**（构造 FM-2.4/2.5/2.6 触发场景） | 实现不验证 | ~¥5 | 🟡 P1 |
| E6 | **预注册实验方案**（OSF/AsPredicted，或附录完整预注册表） | 无预注册（post-hoc 质疑） | 0 | 🟡 P1 |
| E7 | **多重比较校正后的完整报告**（BH-FDR 对所有主比较） | 统计严谨性 | 0（分析脚本） | 🟡 P1 |
| E8 | **shuffle effect 独立复现**（新数据点） | post-hoc 未复现 | ~¥10 | 🟡 P1 |
| E9 | **干预归因隔离**（单干预只开一种） | 多干预同轮混杂 | ~¥10 | 🟡 P1 |
| E10 | **干预有效性判定修复**：加"干预 vs 无干预"对照；`reduce_weight` 改测接收者独立性（而非目标 belief） | **无对照 belief-move + reduce_weight 测量错位**（当前 81.8% 等有效率数字失效，见逐节诊断 §6） | 0（分析）+ ~¥10（对照实验） | 🔴 P0 |
| E11 | **删除/替换 echo chamber 检测器**（或明确标为占位） | 无效保留 | 0（工程） | 🟢 P2 |

**关键判断**：E1–E4 是"能不能投长文"的生死线；E5–E9 决定"能不能中"。一个月内 E1+E3+E4 能做到，E2 靠设计能写进 paper 但执行风险高。

---

## 三、审稿人必问的问题（按被问概率排序 + 应对要点）

1. **"为什么只有一个模型？泛化性在哪？"**
   → 应对：E1 补到 ≥3 模型；承认并展示 codeVersion 控制。**当前 F16 混杂若不修，这条必死。**

2. **"你的核心创新（热力学 R/T/H）自己证明塌缩成 1 维，框架的独立贡献是什么？"**
   → 应对：这是**最大危机**。必须正面重构——"塌缩是发现（MAS 与物理系统本质差异）"，且用 E4（新路径 MeasurementLayer，r=0.274 解耦）证明 v6 框架是解耦的升级版。**如果 E4 拿不出解耦证据，整篇论文的理论地基塌了。**

3. **"shuffle d=1.44 是 post-hoc 的，能复现吗？"**
   → 应对：E8 独立复现 + 预注册（E6）。

4. **"一个 p=0.20 的不显著结果作为主要 finding，价值何在？"**
   → 应对：论证 null result 挑战 DeGroot 收敛-正确性假设的独立价值，并引用已有质疑（Free-MAD 等）形成三角验证。

5. **"多重比较校正了吗？"**
   → 应对：E7，给出 BH-FDR 后的完整 p 值表。

6. **"为什么实现 3 个 MAST 检测器却 0 次实证触发？"**
   → 应对：E5 构造触发场景；或诚实降级为"设计 + 单元测试"的 contribution，不claim实证。

7. **"干预效果归因（多干预同轮）怎么隔离？"**
   → 应对：E9 单干预隔离；强调已有撤回（force_reflection）的诚实性。
   → **更深一层（审稿人 2026 年必问）**："你的'有效率'定义是干预后 belief 动了 >0.05——没有对照，凭什么归因到干预？而且 `reduce_weight` 你测的是目标 agent 自己的 belief，但它作用的是接收者——测错变量了。" 应对：E10 重算（对照 + 测接收者独立性）；论文里把有效率数字全部标注为"descriptive, not causal"或撤回。

8. **"为什么 speaker selection（§2.5）写了却不进实验？机制脱节。"**
   → 应对：二选一——(a) 删掉 §2.5 或压缩为一句"另一篇工作"；(b) 补一个 content_driven vs fixed-round 的实验对比（E11，新增）。**不补实验就删节，二选一。**

9. **"你的理论命题是不是太 trivial？'AI-assisted proof' 什么意思？"**
   → 应对：删掉"AI-assisted pending human verification"句，找彭教授实验室数学家验证后正常表述。

10. **"引用（2026 arXiv 系列 + Anonymous）真实吗？AAMAS 核心文献（social choice / argumentation）在哪？"**
    → 应对：逐条验证引用；补 social choice / argumentation / normative 3–5 篇主干文献。

11. **"echo chamber 检测器无效为什么还留着？"**
    → 应对：E10 删除或明确占位。

12. **"检测器阈值无 ground-truth 校准，怎么保证不是瞎调？"**
    → 应对：承认 + 把"阈值敏感性分析"作为补充实验（E12），展示结论对阈值不敏感。

---

## 四、一个月冲刺的最小路径（如果目标是"投出拿意见"）

**第 1 周**：写作整改（摘要压缩 ≤180 词、删重复、§2.5 决策、删 AI-proof 句）+ E10（删 echo chamber 占位）+ E6（预注册表）+ E7（多重比较报告）。
**第 2 周**：E1（跨模型复现，≥3 模型同代码）+ E4（E9 200 runs）跑起来。
**第 3 周**：E3（扩样/换任务）或 E8（shuffle 复现），补 E5（MAST 触发）。
**第 4 周**：E12 阈值敏感性 + 全稿按 8 页重排 + 参考文献规范化 + 投稿。

> 注意：这个路径能完成"一篇格式合规、证据尽量补强的投稿"，但**E2（第三任务）和核心叙事重构（问题 2）需要更多时间**——如果这两个拿不下，一个月内中长文概率极低，目标应锁定"拿审稿意见"。

---

## 五、给彭教授的协作点（深大实验室资源怎么用）

| 资源 | 用在哪 |
|---|---|
| 数学家 | 验证 Proposition 1a–4 的证明（删除 AI-assisted 表述）；审查 §3.4 不动点分析 |
| 实验室算力/API | E1 跨模型（多模型 key）、E4 200 runs、E8 复现——这些是 API 密集实验 |
| 方法学把关 | 预注册表（E6）设计、多重比较方案（E7）、实验矩阵评审 |
| 挂名/背书 | 解决"独立研究者"署名问题 |
| 领域文献 | 补 AAMAS 主干文献（social choice / argumentation / normative），彭教授团队能快速补齐 |

---

## 六、一句话结论

> **当前稿子"诚实有余、证据不足、叙事自相矛盾"——最大风险不是写作，而是"核心创新点（R/T/H）自证伪"这个结构性危机没有解决。一个月内可完成"投出拿意见"，但必须优先做 E1（跨模型）+ E4（E9 200 runs）并围绕"负面发现的科学价值 + 新路径解耦"重构叙事；否则直接投长文等于拿自己的诚信去喂审稿人的 rejection。**
