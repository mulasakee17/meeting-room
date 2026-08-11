# HiddenBench → V6 Fidelity Gap Audit

> **状态补充（2026-08-11）：**commit `4ce0c85` 已实现并确定性测试 pinned-data → V6 categorical task projection；本文关于 legacy Runner/官方协议保真度的缺口仍成立。数据投影可用不等于官方协议复现、人工语义 split 完成或经验有效性建立。

日期：2026-08-11。任务类型：严格白名单、只读审计。产出物：本文件（唯一仓库变更）。

本审计核验本地 HiddenBench 数据 / prompt / 运行协议 / 评分逻辑与论文作者官方实现是否一致，并盘点 V6 接线差距。**不实现接线，不修改生产代码。**

主张分层：FACT / INFERENCE / DESIGN INTENT / UNKNOWN。实现与官方源优先于本地旧文档。

---

## 1. Executive Verdict

**数据一致（65/65 canonical 一致），协议不一致（多处实质性差异），V6 接线为零（0/12）。**

- **数据层：FACT**——本地 `benchmark.json` 与官方 `data/benchmark.json` 在 canonical JSON hash 下 **65/65 任务完全一致**（字段、顺序、内容全同）；字节差异纯属格式化（空白/属性序）。本地数据可以放心作为"官方 65 题内容"使用，但字节源链无法确认（UNKNOWN）。
- **协议层：FACT（差异）**——本地 `hiddenbenchProtocol.ts` 与官方 `simulator.py`+prompts 存在**多项实质性差异**：agent 数（官方 = hidden 条数，本地硬编码 4）、prompt 逐字不同、讨论上下文（官方只看其他 agent 最后一条，本地看全部历史）、投票校验/重试语义、seed 语义、duplication、温度处理。**不能声称本地复现了官方协议。**
- **评分层：FACT（差异）**——average/majority/improvement 公式一致；**缺失 gap-to-full-profile**；**invalid vote 分母与官方不一致**（本地记错，官方重试至有效或 run 失败）。
- **V6 接线：FACT**——legacy HiddenBench 路径对 12 项 V6 authority 属性 **全无（0/12）**。
- **Red-zone：2 项已触发**（非 DeepSeek provider 丢失多轮历史；provider 间 retry 语义不一致），按 stop condition 记录、不修复、返回 Codex。

---

## 2. 官方 source / commit / license 表

| 项 | 值 | 状态 |
|---|---|---|
| Paper | arXiv:2505.11556（"Systematic Failures in Collective Reasoning under Distributed Information in Multi-Agent LLMs"，ICML 2026；Li, Naito, Shirado） | arxiv 正文被网络策略拦截，无法直接抓取；论文声明以官方仓库 README/CITATION 为准 |
| Author repo | github.com/Yassellee/HiddenBench_ICML | 已浅克隆 |
| **Commit SHA** | `3be6ca16973e4fb751ffc0dfb7eb11f2d28335d1`（HEAD） | FACT |
| Access date | 2026-08-11 | FACT |
| License | MIT（Copyright 2026 Yuxuan Li，`LICENSE`） | FACT |
| HF raw dataset | `YuxuanLi1225/HiddenBench`（README 声明） | README 声明，未直接访问 |
| HF results dataset | `YuxuanLi1225/HiddenBench-results`（README 声明） | README 声明，未直接访问 |
| 第三方参考 | github.com/jonradoff/hiddenbench（非官方）@`9c9491ad` | 仅供来源判定，不作权威 |

---

## 3. 数据逐项审计结果

### 3.1 文件哈希

| 文件 | SHA-256 | 字节 |
|---|---|---|
| 本地 `experiments/campaign/tasks/hiddenbench/benchmark.json` | `2815afffca4e470d1dfbc81e625160447df1109ce371968181c9e1e6b90443a3` | 220,086 |
| 官方 `data/benchmark.json`（Yassellee） | `7b8ed05b4ccc1632666701ad52df5df63208ca7b1376ff902d7868aafd19b39d` | 221,628 |
| 官方 `src/hiddenbench/data/benchmark.json` | `7b8ed05b…`（同上） | — |
| jonradoff `data/hiddenbench_official/benchmark.json` | `7b8ed05b…`（与官方同） | — |

**哈希不同、大小差 1,542 字节**，但 canonical 内容比对：

### 3.2 Canonical 逐字段比对（FACT）

对每个任务做 key 排序的稳定 JSON hash 比对：

- 任务数：本地 65 = 官方 65；
- id 顺序一致、id 集合一致；
- **identical=65，fieldDiff=0，orderDiff=0，officialOnly=0，localOnly=0**；
- 字段 key 集合一致：`correct_answer / description / hidden_information / id / name / possible_answers / shared_information`；
- 逐字段（description / shared_information / hidden_information / possible_answers 内容与顺序 / correct_answer）全部一致。

**结论（FACT）：本地数据内容 = 官方 65 题内容。字节差异为格式化差异，非内容差异。**

### 3.3 分布（FACT）

- `hidden_information` 条数：**3 条 × 7 题，4 条 × 58 题**。
- `possible_answers` 数量：3 个 × 59 题，4 个 × 6 题。

---

## 4. 协议逐项审计矩阵（本地 hiddenbenchProtocol.ts vs 官方 simulator.py + prompts）

| # | 项 | 官方（simulator.py / prompts） | 本地 | 判定 |
|---|---|---|---|---|
| 1 | agent 数 | `num_agents = len(hidden_information)`（7 题 = 3，58 题 = 4） | 硬编码 **4**（ROLE_NAMES×4，循环分配） | ❌ 差异（3-hidden 任务 agent 数与信息分配不同） |
| 2 | hidden/full profile | hidden = 每 agent 1 条 hidden；full = 每 agent 全量（`instantiate_agents`） | run_e12 F 组自建 full（拼接 allInfo） | ⚠️ 语义对齐但实现不同 |
| 3 | 事实呈现结构 | 官方把 description+facts+乱序警告放 **system prompt** | 本地放独立 user "scenario" prompt，system 为通用文案 | ❌ 结构不同 |
| 4 | prompt 原文 | `system_prompt.txt` / `first_user_prompt.txt` / `user_prompt.txt` / `vote.txt` / `first_vote_prompt.txt` | HB_SYSTEM_PROMPT 等 6 个本地模板，**逐字不同** | ❌ 不匹配（本地声称对齐 jonradoff 第三方） |
| 5 | pre-discussion vote | `first_vote_prompt.txt`（无 preamble）+ schema enum | buildPreDiscussionVotePrompt（含 "Based solely…" preamble） | ❌ 不同 |
| 6 | round-0 首发言 | 官方首 agent 收到 `initial_vote+rationale` 前缀 + "You are the first to speak." | 本地无 initial-vote 前缀 | ❌ 不同 |
| 7 | 讨论上下文（round>0） | 官方 prompt 只渲染**其他 agent 的最后一条** `other.history[-1]` | 本地渲染**全部历史** `discussionHistory` | ❌ 差异（信息量不同） |
| 8 | 每 agent 历史保留 | 官方 `agent.history` 累积本 agent 全量 | 本地 DeepSeek 分支累积全量；**非 DeepSeek 分支退化为单轮（只取最后一条 user）** | ❌ **red-zone（历史丢失）** |
| 9 | 讨论轮数 | `rounds` 参数（默认 15），无 early stop | `maxRounds` 默认 15，无 early stop | ✅ 一致 |
| 10 | post-discussion vote scope | 官方默认 `final_vote_scope="last_round"`（只看最后一轮） | 本地看**全部** `discussionHistory`（round 标签） | ❌ 差异 |
| 11 | 投票校验 | 官方 `chat_json` + schema enum + **重试 3 次** + 仍无效则 **raise**（无效票不进输出） | 本地 `parseVote` 归一化+唯一性模糊匹配，**不重试**，无效记 vote=""（判错） | ❌ 差异（分母语义不同） |
| 12 | provider retry | 官方单 `OpenAICompatibleClient`，统一 `max_retries=3`（指数退避） | DeepSeek 分支 fetchWithTimeout **无重试**；callLLM 分支有 maxRetries | ❌ **red-zone（retry 语义不一致）** |
| 13 | seed 语义 | `_scenario_seed = base + task_index×10000 + dup`；`random.Random(seed)` 洗 hidden 全局 + facts | `mulberry32((seed + agentIndex×0x9E3779B1)>>>0)` 每 agent 洗 private 行；无 task_index/dup 偏移 | ❌ 不同 |
| 14 | duplication | 官方 CLI `--duplications`（默认 1） | 本地无 duplication 参数 | ❌ 缺失 |
| 15 | temperature | 官方 model client 默认 `temperature=None`（provider 默认）；README 未声明 0.7 | 本地 A 组 hardcode `0.7`，注释称"官方所有 provider 默认 0.7" | ⚠️ 与官方代码默认不符（官方代码默认 None） |
| 16 | hint/nohint | 官方**无 hint 条件**（hidden-profile 主实验不提示信息不对称） | 本地 adapter 有 `hint`（提示主动分享）与 `nohint`；**nohint ≈ 官方**，hint 是本地偏离 | ⚠️ hint 非官方；nohint 语义接近官方但文案不同 |
| 17 | truth 进 prompt | 官方 `correct_answer` 存于 run_data（仅评分用），**不进入任何 prompt** | 本地 `resolveCandidateOptions` 只用 searchKeys（非 truth）；测试证明 correct_answer 不进 prompt | ✅ 两边都不泄漏 |

---

## 5. 评分审计矩阵

| # | 指标 | 官方 metrics.py | 本地 scoreHiddenBenchTranscript / Runner | 判定 |
|---|---|---|---|---|
| 1 | pre-discussion average accuracy | `_individual_accuracy(initial_votes)` = 正确票/票数 | `preAccuracy = preCorrect/agentCount` | ✅ 公式一致 |
| 2 | post-discussion average accuracy | `_individual_accuracy(final_votes)` | `postAccuracy` | ✅ 一致 |
| 3 | majority accuracy | `sum(correct) > len/2`（严格多数，平票→0） | `preCorrect > agentCount/2`（严格多数） | ✅ 一致 |
| 4 | improvement | `post − pre` | `collectiveGain = post − pre` | ✅ 一致 |
| 5 | gap to full profile | `hidden post − full pre`（`gap_to_full_profile_pre`） | **无此字段**（run_e12 F 单独算 full，但 summary 不合并 gap） | ❌ 缺失 |
| 6 | 无效票分母 | 官方重试至有效，仍无效则 run 失败 → 输出无无效票 | 本地无效票记 vote="" 计入分母并判错 | ❌ 分母语义不同 |
| 7 | Runner 映射 | — | `finalAccuracy = hbResult.postAccuracy`（average rule）；`taskOutcome.quality = finalAccuracy`；`evaluationContractRef = "swarmalpha.categorical.ranking"` | ⚠️ ranking ref 用于 categorical 任务（legacy schema 4 语义，非 V6 权威） |

---

## 6. truth / private-information leakage 结论

- **truth（correct_answer）泄漏：未发现。** FACT——官方把 correct_answer 存入 run_data 但只用于评分；本地 `resolveCandidateOptions` 只消费 `searchKeys`（候选注册表），`test/hiddenbench-schema.test.ts` 明确断言候选顺序保持原序且 prompt 不含 "correct answer"。本地 `taskConfigToBundle` 分离 PromptTask（prompt 路径）与 scoringTask（truth，讨论后释放）。
- **candidate 顺序由 correct_answer 派生：未发现。** FACT——adapter 按 `possible_answers` 原顺序构建 searchKeys；`hiddenbench-schema.test.ts` 用 "correct answer 不在第一位" 的任务证明顺序不被派生。
- **私有信息泄漏：未发现到其他 agent 的 prompt。** 本地每 agent 只拿自己 `privateInformation`（经 adapter 的 knownItems）；官方每 agent 只拿自己的 facts。
- 但注意：**讨论上下文差异**（官方只看他人最后一条 vs 本地看全历史）改变的是信息暴露量，不是越权泄漏——两者都只暴露"讨论中已公开发言"，不暴露私有原始信息。

---

## 7. local legacy vs V6 gap（事实盘点，不设计实现）

legacy HiddenBench 路径（`Runner.runHiddenBenchSingle` + `hiddenbenchProtocol.ts`）相对 V6 authority 属性：

| V6 属性 | legacy HiddenBench 路径 | 判定 |
|---|---|---|
| schema-5 carrier | 无（legacy RawRunData，无 v6TaskManifest/monitoringDesign） | ❌ |
| Stage-1 T/B/G assignment | 无（单一 `arm: "vanilla_interaction"`） | ❌ |
| Stage-2 apply/holdout/sham | 无（单一 no_action applicationReceipt） | ❌ |
| GovernanceAuditTrail | 无（`governanceIssues: []` 占位） | ❌ |
| explicit categorical belief | 无（votes 为 `{vote, rationale}` JSON） | ❌ |
| final private categorical elicitation | 无（post-discussion 投票非私密终局测量） | ❌ |
| multiclass Brier | 无（average-rule accuracy） | ❌ |
| task-bank admission | 无（直接 JSON 加载） | ❌ |
| leakage-group split | 无 | ❌ |
| provider single-attempt | 无（callLLM 重试 / DeepSeek 分支无重试） | ❌ |
| operational outcome replay | 无（非 schema-5，无 operational outcome） | ❌ |
| detached commitment | 无 | ❌ |

**合计：0/12。** legacy HiddenBench 路径不具备任何 V6 authority 属性；任何以它为准的 artifact 都不得进入 V6 权威路径。

---

## 8. reuse / rewrite / reject 清单

### 可直接复用
- **benchmark 数据**：65/65 canonical 与官方一致（MIT license）。可作数据源，但需固定字节规范（避免格式差异）。
- **candidate-order firewall 原则**：候选顺序保持 `possible_answers` 原序、不从 correct_answer 派生（`hiddenbench-schema.test.ts` 已验证）。
- **truth/private firewall 模式**：PromptTask vs scoringTask 分离、truth 讨论后释放（模式可借鉴，V6 已有等价物）。

### 修正后复用
- **adapter.ts**：agent 数必须改为 `len(hidden_information)`（7 题应为 3 agent）；hint/nohint 需与官方主实验对齐语义。
- **protocol prompts**：必须替换为官方 prompt 原文（system/user/first/vote 五件），当前文案与官方逐字不同。
- **讨论上下文**：round>0 只渲染其他 agent 最后一条（对齐官方），或显式选择 full_transcript 并记录为非默认偏离。
- **投票处理**：改为 exact-match + 重试语义，或显式记录 invalid-vote 分母与官方不一致。
- **seed/duplication**：按官方 `base + task_index×10000 + dup` 语义；补 duplication 支持。
- **评分**：补 gap-to-full-profile；对齐 invalid-vote 分母。
- **E11 configs / run_e12**：温度默认、duplication、agent 数均需按官方校准。

### 不得进入 V6 权威路径
- **legacy `Runner.runHiddenBenchSingle` 产物**（schema-4，无 V6 authority）。
- **callLLM fallback**（非 DeepSeek 分支多轮历史丢失）——red-zone。
- **provider 间 retry 语义不一致**——red-zone。
- **"17/18 满分"作为官方 benchmark 结论**（见 §9，本地证据不可复现）。
- **jonradoff/hiddenbench 作为协议权威**（第三方，非官方）。

---

## 9. 数据来源与历史结果风险

### 9.1 本地数据来源

- 本地内容 = 官方（65/65 canonical 一致，FACT）。
- jonradoff/hiddenbench 打包的官方数据 hash 与官方一致（`7b8ed05b…`），但本地文件 hash（`2815afff…`）与两者**字节均不同**。
- 精确来源链（HF 重导出 / jonradoff / 本地重排）**UNKNOWN**（adapter.ts 声明 "HuggingFace/GitHub 公开，MIT"，无精确 commit 记录）。

### 9.2 "17/18 满分"陈述的本地证据状态

- 陈述位置：`docs/experiments/E12_PROTOCOL_COMPARISON.md:110`（"deepseek-chat 在 17/18 个 HiddenBench 任务上 post-discussion = 100%"）。
- 本地 on-disk 汇总：
  - `summary_A_deepseek-chat.json`（当前协议）：15 runs，post=1 仅 **9/15**；
  - `summary_A_deepseek-chat.OLD_protocol.json`：33 runs，post=1 仅 **27/33**。
- **两者都不等于 "17/18 = 100%"**。该陈述的确切来源 run 不在现有汇总中（可能来自未保存的 18 任务扫描）。**本地证据状态：UNKNOWN / 不可从当前 artifact 复现。**
- 不得把它升级为官方 benchmark 结论；它被文档自身框定为"模型行为发现"，但该数字的本地证据链缺失。

### 9.3 可能造成本地结果 vs 论文差异的已证实因素

1. agent 数（7 题 3-agent vs 本地 4-agent）；
2. prompt 文案与结构（system vs user scenario、讨论/投票 prompt 逐字不同）；
3. 讨论上下文信息量（全历史 vs 其他 agent 最后一条）；
4. post-vote scope（全历史 vs 默认 last_round）；
5. 无效票处理与分母（记错 vs 重试至有效/失败）；
6. seed 语义与 duplication 缺失；
7. temperature 默认（本地 0.7 vs 官方代码 None）；
8. gap-to-full-profile 缺失；
9. 非 DeepSeek 分支多轮历史丢失（只影响非 DeepSeek 运行）。

---

## 10. Red-zone findings（stop condition 已触发，记录最小证据，不修复）

1. **[red-zone] 非 DeepSeek provider 丢失多轮历史**：`hiddenbenchProtocol.ts` `callLLMFreeText` 非 DeepSeek 分支（L126-135）退化为单轮，`finalUserPrompt = chatMessages[最后一条]`，历史拼入单轮场景。证据：`hiddenbenchProtocol.ts:126-135`。期望不变量：所有 provider 讨论历史语义一致。实际行为：非 DeepSeek 分支丢失历史。建议修复位置：为 callLLM 增加多轮历史支持，或禁止非 DeepSeek 走该协议。
2. **[red-zone] provider 间 retry 语义不一致**：DeepSeek 分支 `fetchWithTimeout` 无重试；callLLM 分支有 `maxRetries`（`src/lib/llm/providers.ts:120`）。期望不变量：provider 行为一致。建议修复位置：统一 single-attempt 或统一重试语义。
3. **[差异，非 red-zone 但高风险] invalid vote 分母与官方不一致**（见 §5 #6）。
4. **[差异] 官方与本地任务实质不一致（协议层）**：agent 数、prompt、讨论上下文、vote scope、seed（§4 #1,3,4,7,10,11,13）。

未触发的 stop condition：answer key 进 prompt（未发现）；candidate 顺序由 correct_answer 派生（未发现）。

---

## 11. 返回 Codex 的高风险决策

1. **协议复刻级别**：是否要求本地 HiddenBench 协议严格逐字对齐官方（agent 数 = hidden 数、prompt 原文、last-round 讨论上下文、vote retry、seed 语义、duplication）？若论文要引用 HiddenBench 复现基线，必须对齐；否则当前差异使任何"我们复现了 HiddenBench 失败"的声明不成立。
2. **非 DeepSeek provider 支持**：是否禁止非 DeepSeek 走该协议，或补多轮历史支持？
3. **"17/18 满分"陈述**：是否删除 / 标注 UNKNOWN / 补跑可复现的 18 任务扫描？
4. **legacy HiddenBench 数据是否进入 V6 task-bank**：若进，须经 V6 准入层（schema-5 + manifest + replay + leakage split），且按 §8 修正后复用。
5. **gap-to-full-profile 是否作为 V6 基线对比臂**：官方指标含此 gap，V6 需决定是否引入。

---

## 12. 声明

- 未运行任何真实/付费 LLM、未读取 `.env`、未安装依赖、未修改任何代码或数据。
- 唯一仓库变更为本审计文档（待验收确认）。
- arxiv 论文正文因网络策略无法直接访问，论文级细节以官方仓库 README/CITATION 为准（其余标 UNKNOWN）。
- 官方源访问：github.com/Yassellee/HiddenBench_ICML@`3be6ca16`（2026-08-11，MIT）。
# Post-audit implementation addendum (2026-08-11, FACT)

After this fidelity audit, the V6 kernel added a separate categorical
`detection-validation-record@2.0.0` while retaining binary V1. The projection
replays canonical option geometry, maximum-mass certainty, categorical/K rule
domain, multiclass Brier loss, hard top-option outcome, and its schema-5 source
bindings. A descriptive pre-action census can also be projected from every
first-round B/G explicit report without creating control authority or provider
calls.

Categorical thresholds must exceed `1/K`; binary/K=2 remains strictly above
`0.5`. Current production has no pre-action evidence-verification records, so
qualified-lineage count `0` denotes absence of such records, not absence of
real-world provenance.

This addendum does not change the audit's official-protocol conclusion.
Official HiddenBench reproduction, empirical K-specific threshold calibration,
real-model detector validity, and governance effects remain unestablished.
