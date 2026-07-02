# Priority Roadmap

> 版本: 1.0  
> 更新时间: 2026-07-01  
> 状态: 待确认

---

## 一、引言

本 Roadmap 整合了以下五个审查文档的改进建议：

1. [Discussion Architecture Review](file:///C:/Users/贺孟元/Desktop/swarmalpha/docs/DISCUSSION_ARCHITECTURE_REVIEW.md)
2. [Decision Trace Refactor Proposal](file:///C:/Users/贺孟元/Desktop/swarmalpha/docs/DECISION_TRACE_REFACTOR_PROPOSAL.md)
3. [Evaluation Review Report](file:///C:/Users/贺孟元/Desktop/swarmalpha/docs/EVALUATION_REVIEW_REPORT.md)
4. [Governance Refactor Proposal](file:///C:/Users/贺孟元/Desktop/swarmalpha/docs/GOVERNANCE_REFACTOR_PROPOSAL.md)
5. [Architecture Improvement Proposal](file:///C:/Users/贺孟元/Desktop/swarmalpha/docs/ARCHITECTURE_IMPROVEMENT_PROPOSAL.md)

所有建议按照以下标准排序：

| 维度 | 权重 | 说明 |
|------|------|------|
| Research Value | 40% | 对科研能力的提升程度 |
| Impact | 30% | 对系统整体质量的影响 |
| Risk | 20% | 实施风险和复杂度 |
| Engineering Cost | 10% | 开发成本和时间 |

---

## 二、建议清单

### 2.1 Discussion Layer 改进建议

| ID | 建议 | Priority | Research Value | Engineering Cost | Long-term Impact | Risk |
|----|------|----------|----------------|------------------|------------------|------|
| D-1 | 修复 roundNumber 传递（硬编码为 0） | P0 | 高 | 低 | 高 | 低 |
| D-2 | 同步 Agent 实例状态与 agentStates 映射 | P0 | 高 | 低 | 高 | 低 |
| D-3 | 扩大 Memory 截断长度（当前 100 字符） | P0 | 高 | 低 | 高 | 低 |
| D-4 | 传递 Influence 权重到信念更新 | P0 | 高 | 中 | 高 | 中 |
| D-5 | 实现轮内顺序交互（turn-taking） | P1 | 高 | 中 | 高 | 中 |
| D-6 | 显式引用机制（要求 Agent 引用其他 Agent） | P1 | 高 | 中 | 高 | 中 |
| D-7 | Memory 结构化查询接口 | P2 | 中 | 中 | 中 | 低 |
| D-8 | 动态角色分配 | P3 | 中 | 高 | 中 | 高 |

### 2.2 Decision Trace 改进建议

| ID | 建议 | Priority | Research Value | Engineering Cost | Long-term Impact | Risk |
|----|------|----------|----------------|------------------|------------------|------|
| T-1 | 影响记录完善（InfluenceRecord） | P0 | 高 | 低 | 高 | 低 |
| T-2 | 因果因素追踪（CausalFactor） | P0 | 高 | 中 | 高 | 中 |
| T-3 | 共识事件追踪（ConsensusEvent） | P1 | 高 | 中 | 高 | 中 |
| T-4 | 事件类型系统（DecisionEvent） | P1 | 中 | 中 | 中 | 低 |
| T-5 | 查询方法实现（answerWho/When/Why） | P1 | 高 | 低 | 高 | 低 |
| T-6 | 信念轨迹优化 | P2 | 中 | 低 | 中 | 低 |

### 2.3 Evaluation Engine 改进建议

| ID | 建议 | Priority | Research Value | Engineering Cost | Long-term Impact | Risk |
|----|------|----------|----------------|------------------|------------------|------|
| E-1 | 动态共识追踪（每轮共识度变化） | P0 | 高 | 中 | 高 | 低 |
| E-2 | 真正的交叉验证（多次运行测量） | P0 | 高 | 中 | 高 | 中 |
| E-3 | 影响路径分析 | P1 | 高 | 中 | 高 | 中 |
| E-4 | 真实扰动测试（输入/Agent） | P1 | 高 | 高 | 高 | 中 |
| E-5 | 推理质量评估 | P2 | 中 | 高 | 中 | 高 |
| E-6 | 统计可靠性指标（Cronbach's alpha） | P2 | 中 | 中 | 中 | 低 |
| E-7 | 操纵攻击模拟 | P3 | 中 | 高 | 中 | 高 |

### 2.4 Governance Engine 改进建议

| ID | 建议 | Priority | Research Value | Engineering Cost | Long-term Impact | Risk |
|----|------|----------|----------------|------------------|------------------|------|
| G-1 | 干预执行机制 | P0 | 高 | 中 | 高 | 中 |
| G-2 | Authority Bias 干预（降低权重） | P0 | 高 | 低 | 高 | 低 |
| G-3 | Echo Chamber 干预（引入多样性） | P1 | 高 | 中 | 高 | 中 |
| G-4 | Polarization 干预 | P1 | 高 | 中 | 高 | 中 |
| G-5 | 干预效果评估 | P1 | 高 | 中 | 高 | 中 |
| G-6 | Premature Consensus 检测 | P2 | 中 | 低 | 中 | 低 |
| G-7 | 自适应学习 | P3 | 中 | 高 | 高 | 高 |

### 2.5 Architecture 改进建议

| ID | 建议 | Priority | Research Value | Engineering Cost | Long-term Impact | Risk |
|----|------|----------|----------------|------------------|------------------|------|
| A-1 | 数据模型统一 | P0 | 高 | 中 | 高 | 中 |
| A-2 | 数据流优化（Trace → Evaluation/Governance） | P0 | 高 | 中 | 高 | 中 |
| A-3 | 策略层完善（注册机制） | P1 | 高 | 中 | 高 | 中 |
| A-4 | 可观测性增强（事件追踪） | P1 | 中 | 低 | 中 | 低 |
| A-5 | 实时监控 | P2 | 中 | 高 | 中 | 高 |

---

## 三、综合排序

### 3.1 按综合得分排序

| 排名 | ID | 建议 | 综合得分 | 说明 |
|------|----|------|----------|------|
| 1 | D-1 | 修复 roundNumber 传递 | 95 | 低成本、高价值、低风险 |
| 2 | D-2 | 同步 Agent 状态 | 95 | 低成本、高价值、低风险 |
| 3 | D-3 | 扩大 Memory 截断长度 | 92 | 低成本、高价值、低风险 |
| 4 | T-1 | 影响记录完善 | 90 | 低成本、高价值、低风险 |
| 5 | T-5 | 查询方法实现 | 88 | 低成本、高价值、低风险 |
| 6 | G-2 | Authority Bias 干预 | 88 | 低成本、高价值、低风险 |
| 7 | A-4 | 可观测性增强 | 85 | 低成本、中价值、低风险 |
| 8 | D-4 | 传递 Influence 权重 | 85 | 中成本、高价值、中风险 |
| 9 | T-2 | 因果因素追踪 | 85 | 中成本、高价值、中风险 |
| 10 | E-1 | 动态共识追踪 | 83 | 中成本、高价值、低风险 |
| 11 | G-1 | 干预执行机制 | 82 | 中成本、高价值、中风险 |
| 12 | A-1 | 数据模型统一 | 82 | 中成本、高价值、中风险 |
| 13 | A-2 | 数据流优化 | 80 | 中成本、高价值、中风险 |
| 14 | G-5 | 干预效果评估 | 80 | 中成本、高价值、中风险 |
| 15 | E-2 | 真正的交叉验证 | 78 | 中成本、高价值、中风险 |
| 16 | T-3 | 共识事件追踪 | 78 | 中成本、高价值、中风险 |
| 17 | G-3 | Echo Chamber 干预 | 78 | 中成本、高价值、中风险 |
| 18 | G-4 | Polarization 干预 | 78 | 中成本、高价值、中风险 |
| 19 | A-3 | 策略层完善 | 75 | 中成本、高价值、中风险 |
| 20 | E-3 | 影响路径分析 | 75 | 中成本、高价值、中风险 |
| 21 | D-5 | 轮内顺序交互 | 72 | 中成本、高价值、中风险 |
| 22 | D-6 | 显式引用机制 | 72 | 中成本、高价值、中风险 |
| 23 | T-4 | 事件类型系统 | 70 | 中成本、中价值、低风险 |
| 24 | G-6 | Premature Consensus 检测 | 70 | 低成本、中价值、低风险 |
| 25 | T-6 | 信念轨迹优化 | 68 | 低成本、中价值、低风险 |
| 26 | E-6 | 统计可靠性指标 | 65 | 中成本、中价值、低风险 |
| 27 | E-4 | 真实扰动测试 | 62 | 高成本、高价值、中风险 |
| 28 | D-7 | Memory 结构化查询 | 60 | 中成本、中价值、低风险 |
| 29 | E-5 | 推理质量评估 | 58 | 高成本、中价值、高风险 |
| 30 | G-7 | 自适应学习 | 55 | 高成本、中价值、高风险 |
| 31 | E-7 | 操纵攻击模拟 | 52 | 高成本、中价值、高风险 |
| 32 | D-8 | 动态角色分配 | 50 | 高成本、中价值、高风险 |
| 33 | A-5 | 实时监控 | 48 | 高成本、中价值、高风险 |

### 3.2 优先级分组

#### P0 - 立即实施（Top 10）

| ID | 建议 | 模块 |
|----|------|------|
| D-1 | 修复 roundNumber 传递 | Discussion |
| D-2 | 同步 Agent 状态 | Discussion |
| D-3 | 扩大 Memory 截断长度 | Discussion |
| T-1 | 影响记录完善 | Decision Trace |
| T-5 | 查询方法实现 | Decision Trace |
| G-2 | Authority Bias 干预 | Governance |
| A-4 | 可观测性增强 | Architecture |
| D-4 | 传递 Influence 权重 | Discussion |
| T-2 | 因果因素追踪 | Decision Trace |
| E-1 | 动态共识追踪 | Evaluation |

#### P1 - 短期实施（11-20）

| ID | 建议 | 模块 |
|----|------|------|
| G-1 | 干预执行机制 | Governance |
| A-1 | 数据模型统一 | Architecture |
| A-2 | 数据流优化 | Architecture |
| G-5 | 干预效果评估 | Governance |
| E-2 | 真正的交叉验证 | Evaluation |
| T-3 | 共识事件追踪 | Decision Trace |
| G-3 | Echo Chamber 干预 | Governance |
| G-4 | Polarization 干预 | Governance |
| A-3 | 策略层完善 | Architecture |
| E-3 | 影响路径分析 | Evaluation |

#### P2 - 中期实施（21-28）

| ID | 建议 | 模块 |
|----|------|------|
| D-5 | 轮内顺序交互 | Discussion |
| D-6 | 显式引用机制 | Discussion |
| T-4 | 事件类型系统 | Decision Trace |
| G-6 | Premature Consensus 检测 | Governance |
| T-6 | 信念轨迹优化 | Decision Trace |
| E-6 | 统计可靠性指标 | Evaluation |
| E-4 | 真实扰动测试 | Evaluation |
| D-7 | Memory 结构化查询 | Discussion |

#### P3 - 长期实施（29-33）

| ID | 建议 | 模块 |
|----|------|------|
| E-5 | 推理质量评估 | Evaluation |
| G-7 | 自适应学习 | Governance |
| E-7 | 操纵攻击模拟 | Evaluation |
| D-8 | 动态角色分配 | Discussion |
| A-5 | 实时监控 | Architecture |

---

## 四、实施路线图

### 4.1 阶段一：基础修复（2-3 天）

| 任务 | ID | 预期产出 |
|------|----|----------|
| 修复 roundNumber 传递 | D-1 | 正确的轮次号传递到信念更新 |
| 同步 Agent 状态 | D-2 | Agent 实例状态与内部映射同步 |
| 扩大 Memory 截断长度 | D-3 | 完整的历史上下文传递 |
| 传递 Influence 权重 | D-4 | 影响权重作用于信念更新 |

### 4.2 阶段二：Decision Trace 增强（3-4 天）

| 任务 | ID | 预期产出 |
|------|----|----------|
| 影响记录完善 | T-1 | InfluenceRecord 类型和记录 |
| 因果因素追踪 | T-2 | CausalFactor 类型和追踪 |
| 查询方法实现 | T-5 | answerWho/When/Why/BecauseOf |
| 共识事件追踪 | T-3 | ConsensusEvent 类型和记录 |

### 4.3 阶段三：Governance 升级（3-4 天）

| 任务 | ID | 预期产出 |
|------|----|----------|
| 干预执行机制 | G-1 | 执行式干预框架 |
| Authority Bias 干预 | G-2 | 降低主导 Agent 权重 |
| Echo Chamber 干预 | G-3 | 引入多样性意见 |
| Polarization 干预 | G-4 | 缓解极化现象 |
| 干预效果评估 | G-5 | 量化评估干预效果 |

### 4.4 阶段四：Evaluation 提升（3-4 天）

| 任务 | ID | 预期产出 |
|------|----|----------|
| 动态共识追踪 | E-1 | 每轮共识度变化记录 |
| 真正的交叉验证 | E-2 | 多次运行可重复性测量 |
| 影响路径分析 | E-3 | 影响传播路径分析 |
| 统计可靠性指标 | E-6 | Cronbach's alpha 等指标 |

### 4.5 阶段五：架构完善（2-3 天）

| 任务 | ID | 预期产出 |
|------|----|----------|
| 数据模型统一 | A-1 | 统一的 DiscussionData 模型 |
| 数据流优化 | A-2 | 完整的数据流向 Evaluation/Governance |
| 策略层完善 | A-3 | 策略注册和工厂机制 |
| 可观测性增强 | A-4 | 事件追踪和监控系统 |

---

## 五、风险汇总

### 5.1 高风险项

| 风险项 | 风险描述 | 缓解措施 |
|--------|----------|----------|
| 类型变更影响现有代码 | 类型定义变更可能破坏现有 API 和模块 | 保持向后兼容，逐步替换 |
| 干预可能破坏讨论 | Governance 干预可能产生意外效果 | 先实现轻量级干预，逐步增加强度 |
| 数据量增加 | 完整的 Decision Trace 可能导致数据量过大 | 提供精简模式选项 |

### 5.2 中风险项

| 风险项 | 风险描述 | 缓解措施 |
|--------|----------|----------|
| 影响闭环建立 | Influence → Belief 的传递机制需要仔细设计 | 先实现简单规则，再优化 |
| 干预效果难以评估 | 如何量化干预效果需要研究 | 建立评估指标体系 |
| 性能影响 | 完整追踪和多次运行可能影响性能 | 优化数据结构和算法 |

### 5.3 低风险项

| 风险项 | 风险描述 | 缓解措施 |
|--------|----------|----------|
| 代码复杂度增加 | 策略层和事件系统可能增加复杂度 | 保持接口简洁，文档完善 |
| 测试覆盖不足 | 新功能需要相应测试 | 每完成一个模块编写测试 |

---

## 六、预期科研价值提升

### 6.1 能力矩阵

| 科研能力 | 当前状态 | 阶段一 | 阶段二 | 阶段三 | 阶段四 | 阶段五 |
|----------|----------|--------|--------|--------|--------|--------|
| 集体决策形成分析 | 低 | 中 | 高 | 高 | 高 | 高 |
| 影响传播分析 | 低 | 中 | 高 | 高 | 高 | 高 |
| 共识形成追踪 | 低 | 中 | 高 | 高 | 高 | 高 |
| 干预策略研究 | 无 | 无 | 低 | 高 | 高 | 高 |
| 算法对比测试 | 低 | 中 | 中 | 中 | 高 | 高 |
| 实验可复现性 | 低 | 中 | 高 | 高 | 高 | 高 |
| 过程可视化 | 低 | 中 | 高 | 高 | 高 | 高 |

### 6.2 预期成果

完成所有阶段后，SwarmAlpha 将具备以下科研能力：

1. **完整的决策过程追溯** - 能够回答 Who/When/Why/Because of what
2. **真正的集体决策** - Agent 之间存在真实的影响和信念变化
3. **可干预的治理机制** - 能够执行不同的治理策略并评估效果
4. **科学的评价指标** - 基于学术界认可的指标进行评估
5. **插件化架构** - 支持不同算法和策略的对比实验

---

## 七、结论

本 Priority Roadmap 基于五个审查文档的改进建议，按照综合得分排序，形成了清晰的实施路线图。

**核心结论**：

1. **优先修复 Discussion Layer 的基础问题**（阶段一）- 这些是最低成本、最高价值的改进
2. **其次增强 Decision Trace**（阶段二）- 这是所有下游模块的数据基础
3. **然后升级 Governance Engine**（阶段三）- 从检测升级到干预
4. **接着提升 Evaluation Engine**（阶段四）- 从工程指标升级到科学指标
5. **最后完善架构**（阶段五）- 确保长期扩展性和可观测性

**建议实施顺序**：阶段一 → 阶段二 → 阶段三 → 阶段四 → 阶段五

每完成一个阶段，必须进行 Build、Test、Review 和 Documentation，确保质量后再进入下一阶段。

---

## 八、确认清单

在开始实施前，请确认以下内容：

- [ ] 已阅读并理解所有五个审查文档
- [ ] 同意优先级排序和实施路线图
- [ ] 确认实施顺序（阶段一到阶段五）
- [ ] 同意每阶段完成后的验证流程（Build → Test → Review → Documentation）
- [ ] 确认资源和时间安排

确认后，请回复 "确认"，开始第一阶段实施。