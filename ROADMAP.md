# SwarmAlpha 发展路线图

## 战略定位

> **不做多智能体框架，做多智能体社会的治理操作系统。**
>
> 不做"决策优化工具"，做"群体过程的可观测性基础设施"。

竞争优势：
- 所有人的注意力在"如何构建 agent"和"如何让 agent 协作"——AutoGen、CrewAI、LangGraph
- 没人在做"agent 协作过程中出了什么问题"和"如何治理"
- SwarmAlpha 的核心引擎已实现、已审计、零耦合——先发优势

---

## Phase 1：止血与验证

**目标：代码+文档自洽，过得了自己这关**

### 1.1 文档叙事统一
- [x] PROJECT_SUMMARY.md —— 三层独立价值（监控/审计/治理）
- [x] ROADMAP.md —— 本文件
- [x] README.md —— 更新实验数据和技术亮点，对齐新叙事
- [x] ONEPAGER.md —— 更新一页摘要
- [x] README_CN.md —— 同步中文版 README
- [x] ~~RESEARCH_STATEMENT.md~~ —— 已合并入 PROJECT_EVALUATION.md

### 1.2 代码清理
- [x] 保留 AutoGenAdapter 的 throw Error（不静默降级是正确行为），转而给 StateInferenceBridge 补 LLM 推断层
- [x] 给 StateInferenceBridge 补 LLM 推断层（inferMissingBeliefs 方法，agent 不输出 [GOV] 标签时用 LLM 推断信念）
- [x] 清理死代码：删除 beliefUpdate.ts（RuleBasedBeliefUpdate）、strategyRegistry.ts、3 个空干预类型（break_connections/introduce_dissent/pair_opposites）
- [x] V1 实验数据加说明 README（标注"基于断裂环路，结论不可引用"）
- [ ] 给 GovernanceRuntime 写 3 个使用示例（node 脚本、Express 中间件、WebSocket 实时监控）

### 1.3 测试与质量
- [x] 确认 229 tests 全部通过
- [x] 给 StateInferenceBridge 补测试（34 个测试覆盖三级提取、干预转译、LLM 推断、统计监控）
- [x] 修复 extractGovTag 截断 JSON 容错 bug（正则匹配失效，改为 indexOf 定位 + 手动补全）

---

## Phase 2：过程监控演示（1-2 周）

**目标：不依赖 τ，展示治理引擎的独立价值**

### 2.1 静态演示：病例分析
取一次真实实验的完整对话记录，做"过程审计报告"：
- 第 1 轮：回声室检测触发（3/5 agent 已有相同观点）→ 即使最终 τ=1.0，过程是有缺陷的
- 第 3 轮：CEO 的发言被引用 7 次，其他 agent 被引用 0-2 次 → 权威偏差存在
- 展示：如果当时有 diversity 干预，讨论会更快覆盖缺失信息

这份报告的价值：**证明引擎能看见人类看不见的东西**。τ 是滞后指标——决策做完才知道对不对。检测是实时指标——决策过程中就能发现问题。

### 2.2 Web UI 决策审计视图
在现有的 Demo 页面上加一个 tab："Decision Audit"。
- 左栏：讨论时间线（每轮每人的发言）
- 中栏：信念演化图（每人 belief 随时间变化）
- 右栏：检测事件线（何时触发了什么偏差检测）
- 不要求实时——静态回放即可

### 2.3 框架适配器 MVP
- [ ] 完善 `AutoGenAdapter`——消息转换已可用，applyIntervention 保留抛错（不静默降级），通过 StateInferenceBridge 的 LLM 推断层兜底
- [ ] 新增 `CrewAIAdapter`——需先验证 StateInferenceBridge + LLM 推断层在 CrewAI 场景的可行性（CrewAI 无原生 belief/confidence，依赖 LLM 推断成本较高）
- [ ] 写集成文档：`docs/INTEGRATION.md`（"如何用 5 分钟把 SwarmAlpha 接入你的 agent 系统"）

---

## Phase 3：智能体社会模拟（2-4 周）

**目标：扩展实验范式的边界——从 5 agent 决策到 50+ agent 社会动态**

这阶段是**与教授合作的最佳敲门砖**——"智能体社会"比"决策优化"更前沿，且完全避开 τ 天花板。

### 3.1 信息传播与回声室实验
- **场景**：50 agent，社交媒体拓扑（关注/粉关系），一个"新闻事件"在不同子群中传播
- **变量**：有无治理干预（diversity 注入打破信息茧房）
- **度量**：不是 τ——是信息覆盖率、信念极化度、回声室持续时间
- **成本**：50 agent × 1 轮（单向转发）≈ 无 LLM 调用——可以纯模拟

### 3.2 组织结构对比实验
- **场景**：100 agent 完成同一个任务，对比三种拓扑（Flat / Grouped / Committee）
- **度量**：决策速度、信息损失、影响力集中度
- **关键**：Committee 拓扑有信息瓶颈但可扩展——探索"效率 vs 质量"的权衡
- **成本**：可以用规则 agent（非 LLM）做大规模，LLM agent 做小规模验证

### 3.3 治理结构的比较制度分析
- **场景**：同一个 20-agent 社会，测试不同治理制度（无治理 / 多数投票 / 专家委员会 / SwarmAlpha 自适应）
- **度量**：长期满意度、少数意见存活率、决策切换频率
- **学术价值**：这是政治科学+AI 的交叉——比较制度分析在 agent 社会中的应用

---

## Phase 4：学术合作（与 Phase 3 并行）

### 4.1 产出准备
在联系教授前，确保以下材料是现成的：

| 材料 | 状态 | 说明 |
|------|------|------|
| 代码仓库 | ✅ 已有 | GitHub 公开，README 英文完善 |
| 项目摘要 | ✅ 已写 | ONEPAGER.md（英文概览）；中文摘要见 README_CN.md |
| 一页 Pitch | 待写 | 三段式：我做了什么 / 我发现了什么 / 我想探索什么 |
| 演示视频 | 待做 | 3 分钟：架构概览 → 偏差检测演示 → 智能体社会展望 |
| 技术白皮书 | 待写 | 10-15 页，正式的学术风格——如果 Phase 3 有结果就更好 |

### 4.2 目标实验室

| 优先级 | 机构 | 方向 | 对接策略 |
|--------|------|------|----------|
| S 级 | 清华 AIR（张亚勤组） | 多智能体系统、AI 安全 | 强调治理基础设施价值 |
| S 级 | 上海 AI Lab | 大规模 agent 模拟 | 强调拓扑层+社会模拟 |
| A 级 | 北大 CFCS（董豪） | 多智能体协作 | 强调框架无关的嵌入能力 |
| A 级 | 上交大（张伟楠） | 强化学习+多智能体 | 强调治理作为 reward shaping |
| B 级 | 中科院自动化所（曾大军） | 群体智能 | 强调社会动态分析 |

### 4.3 发送策略
1. **不要海投**。挑 2-3 个最匹配的，做功课（读他们近 3 篇论文）
2. **邮件正文 5 句以内**：你是谁 / 你做了什么 / 为什么跟他们的研究相关 / 你希望什么 / GitHub 链接
3. **附件**：1 页 PDF pitch（不要发 10 页——教授没时间）
4. **时间**：Phase 3 有初步结果后发（有 demo > 没 demo）

---

## Phase 5：长期（3-6 个月）

### 5.1 Python SDK
- TypeScript 核心 + Python 绑定（通过 REST API 或直接编译）
- 这打开 AutoGen/CrewAI 的原生集成——目前它们都是 Python 生态

### 5.2 正式论文
- 如果 Phase 3 的智能体社会实验成功 → 论文主体
- 如果 Phase 3 实验不显著 → 论文主体改为"治理引擎的架构与边界条件"，加上自纠错叙事
- 目标期刊：NeurIPS Workshop / AAMAS / ICML Workshop（高中生可以投 Workshop，门槛更低）

### 5.3 开源社区
- 写好 CONTRIBUTING.md
- 录 5 个 tutorial video（YouTube）
- 在 AutoGen/LangGraph 的 Discord/论坛推广

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| Phase 3 实验结果不显著 | 中 | 转为定性分析+案例研究；"过程监控"本身仍有展示价值 |
| API 费用超预算 | 高 | Phase 3 用规则 agent 做大规模，LLM agent 仅做验证 |
| 教授不回复 | 中 | 准备多位教授；先参加线上 Workshop 建立联系 |
| 单人精力瓶颈 | 确定 | 不追求完美——每个 Phase 有最小可交付物，不贪多 |

---

> 当前时间：2026年7月19日
> 当前阶段：Phase 1 完成 → Phase 2（过程监控演示）。406 次实验完成，信念转变修复 + B/D 组重跑完成，K=2 修复生效，codeVersion 标记机制上线。异步引擎三阶段演进（旧阈值→新阈值→beliefShift）记录完整。
