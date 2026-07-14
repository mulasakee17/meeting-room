# 联系目标实验室邮件模板

> **使用原则**：
> 1. 每次只发 1-2 位教授，不要群发
> 2. 发之前读对方近 3 篇论文，正文里必须提到具体关联
> 3. 附件只放 1 页 PDF pitch，不要发 10 页文档
> 4. 如果 5 个工作日没回复，可以礼貌地跟一次
> 5. 标 `[方括号]` 的部分需要你替换为针对该教授的内容

---

## 邮件正文（中文版，推荐用于国内实验室）

```
主题：一个高一学生的多智能体实验——发现了你研究方向相关的现象，求指教

[教授姓]老师，您好。

冒昧打扰。我是贺孟元，高一学生，独立做了一个多智能体认知治理的项目。
最近在实验中观察到一些现象，和您在 [该教授 1-2 个具体研究方向] 的工作
可能有关联，想请您帮忙看看方向对不对。

项目概括（15天，独立完成）：
- 构建了一个可嵌入多智能体框架的认知治理运行时（~13,000行 TypeScript），
  检测 4 种群决策偏差（回声室/权威偏差/极化/过早共识），在检测到偏差时
  靶向干预
- 全部 209 个自动化测试通过，代码开源，实验可复现（种子化 PRNG）
- 在 DeepSeek-V3 上完成了 89 次对照实验（2 个独立 Hidden Profile 任务 ×
  3 种条件 × 15 次运行），含完整的统计推断（置换检验 + Bootstrap CI +
  多重比较校正）

实验中观察到两个可能有点价值的发现：
1. 打乱 agent 角色标签与私有信息的对应关系后，决策质量显著且大幅度提升
   （一个任务 ΔQ=+18.3, p=0.001；另一个独立任务复现了方向一致的效应）。
   而自适应治理干预对决策质量的提升在两个任务上均不显著（p=0.36, p=0.06）。
2. 在这两个任务的实验数据中，共识水平与决策正确性的相关性都趋近于零
   （r≈0；r≈-0.2），即 agent 们高度一致 ≠ 答案正确。

另：在实验过程中发现并修复了 4 个导致治理环路断裂的认知缺陷（状态感知缺失、
对话历史缺失、顺序发言断裂、影响力网络断裂），修复前后对比数据均完整保留。

我读过您的 [具体论文标题或方向，比如："大规模智能体社会模拟"或"多智能体
强化学习中的协调机制"]，感觉您在 [具体方向] 的框架可能能解释我观察到的
"打乱角色-信息绑定后决策质量跃升"的现象——但我目前的数学和理论基础，确实
不足以把这些实验发现形式化为严谨的学术论证。

所以想请教：
- 从您的角度看，这个发现方向有学术价值吗？
- 如果有，我应该在哪些方面优先补强，才能让这个项目从"玩具"变成可以投稿的
  学术工作？
- 如果您实验室有相关方向的博士生或硕士生，不知道是否有可能请他/她帮忙看一眼
  实验设计和数据？

附件是 1 页项目 Pitch。完整代码、实验数据和统计分析都在 GitHub：
https://github.com/mulasakee17/swarmalpha

无论如何，感谢您花时间读这封邮件。

贺孟元
[日期]
[联系方式]
```

---

## 邮件正文（英文版，用于国际实验室或 arXiv 合作者）

```
Subject: A high school experiment in multi-agent consensus — relevance to your work on [topic]

Dear Professor [Last Name],

I'm a 10th-grade student in China, working independently on cognitive governance
for LLM multi-agent systems. I recently ran a set of controlled experiments that
produced findings potentially relevant to your work on [specific topic], and I
would be grateful for your perspective on whether this direction has merit.

What I built (15 days, solo):
- An embeddable governance runtime for multi-agent LLM systems (~13K lines
  TypeScript, 209 passing tests). It detects 4 collective decision failures
  (echo chamber, authority bias, polarization, premature consensus) and applies
  targeted interventions.
- 89 controlled experiments across 2 independent hidden-profile tasks
  (3 conditions × 15 runs each), using DeepSeek-V3. Statistical inference:
  permutation tests, bootstrap CIs, multiple comparison correction.

What the data shows:
1. Breaking the coherence between agent role labels and their private
   information ("shuffle" condition) significantly improves decision quality
   (ΔQ=+18.3, p=0.001 on Task 1; directionally consistent on Task 2).
   Meanwhile, targeted governance interventions do not significantly
   outperform baseline on either task (p=0.36, p=0.06).
2. Consensus level and decision correctness are uncorrelated in both tasks
   (r≈0; r≈-0.2). Agreement is not a valid proxy for accuracy.

I read your paper "[specific paper title]" and your framework for [specific
concept] seems like it could explain the "role-coherence overconfidence"
mechanism I'm observing. However, my mathematical background is insufficient
to formalize these findings into a rigorous contribution.

My questions:
- From your perspective, are these findings academically interesting?
- What should I prioritize to turn this from an engineering artifact into
  publishable research?
- If anyone in your lab works on related topics, would a brief look at my
  experimental design be possible?

One-page pitch attached. Full code, data, and analysis at:
https://github.com/mulasakee17/swarmalpha

Thank you for your time.

He Mengyuan
[Date]
[Contact]
```

---

## 1 页 Pitch 内容（作为 PDF 附件）

这页 PDF 应该在邮件附件中。内容结构如下——你可以用 RESEARCH_STATEMENT.md 精简成一页：

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ROLE-COHERENCE OVERCONFIDENCE                           │
│   IN LLM MULTI-AGENT DECISION SYSTEMS                     │
│                                                          │
│   He Mengyuan | Grade 10 | Independent Research           │
│   github.com/mulasakee17/swarmalpha                       │
│                                                          │
│   WHAT I DID                                              │
│   Built an embeddable governance runtime for multi-agent  │
│   LLM systems. 209 tests. 89 experiments across 2 tasks.  │
│                                                          │
│   CORE FINDING                                            │
│   Breaking the coherence between agent roles and their    │
│   private information (shuffle) produces a large,         │
│   significant improvement in decision quality:            │
│                                                          │
│   Task 1 (Crisis):  ΔQ=+18.7, p<0.001, d=+1.82           │
│   Task 2 (Supplier): ΔQ=+18.3, p=0.001                   │
│                                                          │
│   Meanwhile, targeted governance interventions (detect    │
│   bias → intervene) do NOT significantly outperform       │
│   baseline: p=0.36 (Task 1), p=0.06 (Task 2).            │
│                                                          │
│   BONUS FINDING: Consensus ≠ Correctness                  │
│   r(consensus, accuracy) ≈ 0 in both tasks.               │
│                                                          │
│   WHAT I'M LOOKING FOR                                    │
│   A mentor/advisor to help formalize these experimental   │
│   findings into an academically rigorous contribution.    │
│   I can execute experiments; I need guidance on theory.   │
│                                                          │
│   Experiment design: 2 hidden-profile tasks × 3 cond.     │
│   × 15 runs. Permutation test + bootstrap CI.             │
│   All code/data open-source. Seeded PRNG for repro.       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 发件策略

### 第一波（本周）：2 位教授

选 **1 位 S 级 + 1 位 A 级**，分别发送定制版邮件。不要两个都发 S 级——如果都被拒，心态会有影响。

| 优先级 | 教授 | 需要读的论文 | 邮件里怎么关联 |
|--------|------|-------------|---------------|
| 首选 | **上交大 张伟楠** | 近 3 篇多智能体 RL 论文 | "您的多智能体协调机制研究，是否可以用来解释角色-信息一致性对 agent 策略的影响？" |
| 备选 | **北大 董豪** | 近 3 篇多智能体协作论文 | "您在多智能体协作方面的工作，和我在实验中观察到的'打乱角色后协作改善'可能有联系" |

> 选择理由：张伟楠做 RL+多智能体，你的发现直接触及 agent policy 层面的问题（角色提示如何影响决策策略）。董豪做多智能体协作——你的实验就是在测量协作质量。两位的实验室都不像清华 AIR 那样"门槛高到不回复"。

### 第二波（2-3 周后，如果第一波无回复）

换 2 位教授 + 调整邮件内容。如果第一波有回复但无下文，礼貌追问一次。

### 第三波（1 个月后）

如果前两波都无回复，考虑：
- 把项目提交到 **AAAI 2027 Student Abstract**（高中生可以投——这是专门开放给学生的短篇 track）
- 或者直接在 arXiv 挂预印本，然后拿 arXiv 链接去联系教授（有预印本比没有分量重得多）

---

## 发邮件前检查清单

- [ ] 读了该教授近 3 篇论文，知道他在做什么
- [ ] 邮件正文里至少提到 1 篇具体论文或具体研究方向（不能泛泛说"您的研究方向"）
- [ ] GitHub README 是最新状态（实验数据、统计结果都有）
- [ ] 1 页 Pitch PDF 已准备好（排版干净，没有错别字）
- [ ] 邮件主题不超过 30 个字
- [ ] 正文不超过 300 字（教授不会读长邮件）
- [ ] 没有用"希望您收我为学生/给我一个机会"之类的措辞——你在请求学术意见，不是在申请学校
- [ ] 发送时间是对方时区的周二/周三/周四上午 9-10 点（周一忙、周五心不在）

---

## 如果教授回复了

### 可能的回复类型 & 应对

**A. "很有意思，我们聊聊"** → 立即回复约时间。准备一个 5 分钟的屏幕共享演示：打开 GitHub → 跑一次实验 → 展示分析结果。不要说太多，让他提问。

**B. "有潜力，但需要补 X/Y/Z"** → 这是最好的回复。他已经在指导你了。回复："感谢您的建议。我接下来在 X/Y/Z 方面优先补强。如果过程中遇到问题，方便偶尔请教您吗？"

**C. "建议你联系 XXX"** → 这是间接拒绝，但给了你引荐。回复："感谢您的建议。我会联系 XXX。如果方便的话，我可以在邮件中提到是您推荐的吗？"

**D. 无回复（5 个工作日）** → 礼貌追问一次："[教授姓]老师您好，上周给您发过一封关于多智能体实验的邮件，不知是否收到。如果方便的话，希望能听听您的看法。附上之前邮件的内容。"——70% 不会回，但追问不扣分。

---

## 永远不要做的事

- ❌ 群发——教授们互相认识，群发会被看出来
- ❌ "我发现了 XX 理论，颠覆了 XX 领域"——你不是，而且这会让人反感
- ❌ 描述自己多努力、15 天没睡觉——学术圈只看产出，不看过程
- ❌ 正文超过 300 字
- ❌ 用"您一定要看我的项目"之类的措辞
- ❌ 暗示"如果您不收我我就放弃了"——情感勒索没用
