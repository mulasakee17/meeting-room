# SwarmAlpha v6：未来一周收敛执行计划

日期：2026-08-11 至 2026-08-17
状态：执行基线；与旧计划冲突时，本文件只覆盖未来七天的优先级，不改写理论权威定义。
修订记录：2026-08-11 吸收 08-10 已完成的一次真实 DeepSeek T/B/G 工程 smoke 结果（3 runs / 18 calls / 4604 tokens / exit 0，replay 100%）；Day 1-2 由"首跑 + 事前审计"改为"对已有产物补做逐项审计"，Day 6 trigger go/no-go 提前生效。

## 1. 一周目标

本周不再扩张治理动作、指标或产品形态。唯一目标是把已经闭合的理论和工程内核转换成一条可信的实验路径：

> 真实 provider 工程 smoke → artifact 审计 → 最小任务泛化 → calibration pilot → 冻结预实验契约。

周末应达到的状态不是“论文结论成立”，而是：

1. 至少一轮真实 T/B/G 工程 smoke 可以单次调用、受预算约束地完成或以可解释方式失败；
2. 每个成功 run 都能从 schema-5 artifact 重放，失败 run 不会伪装成完成数据；
3. T/B/G 的 treatment separation、truth firewall、final private elicitation 和 operational Brier 均经人工审计；
4. v6 执行器不再把任务逻辑硬编码为唯一场景，至少形成一个版本化 task-adapter 边界；
5. 用两个分布式信息任务族做小规模 calibration，而不是继续只在一个排序/单一场景里论证普适性；
6. 冻结下一阶段 pilot 的 schema、arm、任务切分、阈值、失败处理和分析表，不运行 confirmatory 实验。

## 2. 当前真实起点

已经成立：

- 显式 belief/evidence 事件、append-only ledger、证据图和聚合内核；
- 治理 observation → diagnosis → eligibility → randomized assignment → action lifecycle；
- Stage-1 T/B/G 分配与执行绑定、Stage-2 apply/holdout/sham；
- final private elicitation、四种 terminal missingness、operational pooled Brier；
- schema-5 单一权威载体、结构/决策/outcome replay；
- dedicated binary v6 production vertical slice；
- DeepSeek 单次调用、实际 usage 计量、执行级预算中止；
- architecture-observed compliance；matched sham 不再执行伪装的主动 verification；
- 全量测试 63 files / 1256 passed / 3 skipped，build 与 dry-run 通过（2026-08-11 复核确认）；
- 一次真实 DeepSeek T/B/G 工程 smoke（2026-08-10：3 runs / 18 calls / 4604 tokens，exit 0）：12 个 schema-5 artifact 全部通过 `sealed_decision_replay_verified`；产物位于 gitignored `pilot_output/v6-smoke/`，尚未提交。
- 首轮真实观测：G 的 governanceTransitions = 0（无 report 达到确定性 ≥0.9）；trigger 稀疏已从理论风险变为当前事实，Day 6 的 go/no-go 提前生效。

尚未成立：

- 没有对 08-10 真实 smoke artifact 的逐项人工尸检表（schema replay 已 100%，但 "已成立" 清单之外的语义核对尚未逐项产出，见 Day 2）；
- 没有跨任务 production adapter 证据（尚无 `V6TaskAdapterV1`，fixture 硬编码在 monolith）；
- 没有正式 calibration、方差和 missingness 数据（首轮触发率 0 是本轮基线）；
- 没有冻结的 confirmatory task split 或公开预注册；
- 没有外部真实性承诺；内部 hash/replay 不能证明 artifact 未被整体重造；产物未提交 git；
- 没有治理有效性、机制特异性或 latent belief 的实证结论。

## 3. 本周研究主张上限

本周允许建立的主张：

- SwarmAlpha 能把多 Agent 文本互动转化为可审计的显式认识状态轨迹；
- T/B/G protocol package 可以在相同最终私密测量下执行和比较；
- 治理决策与动作链可以被结构重放，并区分分配、交付、合规和结果；
- 运行失败、缺失和成本可以作为 estimand 的一部分被保留，而不是事后删除；
- task-specific projection 可以通过版本化 adapter 与 task-agnostic kernel 分离。

本周禁止建立的主张：

- 模型报告等于 Agent 内在或真实信念；
- B 或 G 已提升准确率/校准；
- verification 机制优于一切等成本动作；
- 系统已对任意任务、开放世界或社会模拟普适；
- hash 等于防篡改、Web3 或外部真实性；
- seed-targeted smoke 是随机化因果证据。

## 4. 七天安排

### Day 1：提交基线与对已有真实 smoke 产物的只读审计

目标：确认基线 commit 可追溯，且 08-10 已发生的真实 smoke 在进入校准前没有泄漏、重试或费用失控遗留。

工作：

1. 以本次 commit 为唯一代码基线，记录 commit hash、Node/npm 版本和 provider modelRef。
2. 解决产物可追溯性：08-10 的 12 个 schema-5 artifact 位于 gitignored `pilot_output`。二选一：(a) 提交 artifact；或 (b)（推荐，保持只读）生成 12 个 artifact 的 hash 清单写入提交的只读 audit 文件。
3. 运行默认 dry-run，保存控制台计划；确认输出目录位于 ignored `pilot_output`。
4. 对 08-10 已用 prompt 做 post-hoc 人工复核（三类最终 prompt）：
   - discussion 只见 public context、自己的 private information 和可见 transcript；
   - apply verification 只见公开 claim/message；
   - sham 不见 task/claim/target message，模型内容被丢弃；
   - final elicitation 不见 truth、resolver output 或其他 Agent 私有信息。
5. 复核 `DEEPSEEK_API_KEY` 未进入 invocationConfig、artifact、日志或命令文本（08-10 运行已满足，抽查 artifact 与命令文本）。
6. 冻结后续真实调用的上限：20 calls；token cap 以命令参数冻结（CLI 已有 `--max-provider-calls` / `--max-total-tokens`，确认而非重写）。08-10 实际成本约 ¥0.1；人民币预算上限建议不超过 ¥10，实际费用以 provider 账单为准（artifact 无费用字段），代码中的 token estimate 不视为费用承诺。

Gate D1：dry-run、全量测试、build 全绿；任何 credential、truth 或 other-agent private-view 泄漏均停止后续付费执行。

分工：Codex 审查红区和最终放行；Claude Code 可复核 prompt 字段、命令、路径和文档，不改核心。

### Day 2：对 08-10 真实 smoke 的逐 artifact 尸检（补做，不重新调用）

目标：验证现实 API 与内核已相接；不估计治理效果，不重复付费调用。

工作：

1. 项目所有者已于 08-10 授权本次执行，本轮不再重复授权，也无新 provider 调用。
2. 从已有 artifact 整理：实际 calls、prompt/completion/total tokens、latency、provider/adapter failure、terminal status。总费用以 provider 账单为准（artifact 无费用字段）。
3. 对三个 raw artifact 分别运行 verifier（08-10 已 100%），并人工逐项核对：
   - analysis unit 时间早于 assignment（已核）；
   - manifest arm 与 execution binding 一致（已核）；
   - T 不产生中途 belief events；B/G 产生显式 reports（补核）；
   - G 的 Stage-2 assignment、actionRef 与 delivery 内容一致——08-10 G 无 eligible action，只能核 no_eligible_action 路径；apply/sham/holdout 三支投递在 mock 层验证；
   - final elicitation 在 discussion 后、resolution 前（已核）；
   - run-level tokenUsage 包含 final elicitation（补核）；
   - exact retry 为零 provider calls——mock 已验证；真实 run 仅执行一次，此路径真实未行使，标注”mock 验证、真实未行使”。
4. 生成一份只读 smoke audit 表（含 12 artifact 的 hash 清单），不修改 artifact。

Gate D2：schema replay 必须 100%（08-10 已满足）；任何已完成 artifact 的 source/hash/arm 不一致为 P0；任何预算中止后仍发布完整 artifact 为 P0；任何内部 retry 为 P0。

失败策略：修复后使用新 runId 和新 smoke 版本，旧失败目录保留用于审计；不得覆盖或”补写”旧 artifact。

分工：Codex 判断语义缺陷和是否作废；Claude Code 负责机械汇总、issue-code 表和复现测试。

### Day 3：只修真实 smoke 暴露的问题

目标：避免用新功能掩盖现实边界缺陷。

允许修改：

- provider response parsing、single-attempt cancellation、usage mapping；
- terminal missingness、budget fatal halt；
- task/arm/source/time/hash 交叉绑定；
- apply/sham/holdout delivery separation；
- 错误消息、对抗测试和事实文档。

禁止修改：

- 为让结果“更好看”而改 threshold、prompt 或 seed；
- 新增治理动作、信誉、质押、在线学习或 Web3；
- 看到 outcome 后改变 primary estimand、missingness 或 pooling；
- 把 provider failure 静默重试或删掉。

首轮 G trigger=0 必须在本日分诊：若根因是 belief-certainty 解析/适配缺陷（例如真实输出的 certainty 字段未被正确解析），只修 adapter，不动 threshold；若属真实稀疏，保留现状，留给 Day 6 在 calibration split 上重新版本化。禁止用 confirmatory outcome 调参（见 Day 6）。

Gate D3：所有真实缺陷均有最小复现；修复后全量测试通过；若修改了 schema/estimand/assignment identity，必须 version bump，并宣布 Day 2 artifact 仅为旧版本工程记录。

### Day 4：最小 task-adapter 泛化

目标：证明 kernel 与 task projection 分离，而不是把平台继续绑定在单一 binary smoke fixture。

只定义一个窄接口 `V6TaskAdapterV1`，负责：

- task/schema ref 与 task-family ref；
- public context；
- frozen ordered agent roster；
- per-agent private view；
- 一个预注册 primary claim；
- final resolution adapter；
- 可选的 task-specific source-event projection。

不得让 adapter：

- 自己计算治理 diagnosis 或选择 intervention；
- 自己提供 π0、primary metric 或 missingness policy；
- 读取 treatment assignment 后改变 task、roster、claim 或 truth；
- 绕过 final private elicitation；
- 写 schema-5 authoritative fields。

实现顺序：先把现有 distributed-binary fixture 包装成 adapter，确保 artifact 字节语义不变；再新增第二个不同领域、仍为 binary 的 distributed-information task adapter。暂不同时引入 categorical runtime，以避免一周内把任务泛化和 outcome-domain 泛化混成一个风险包。

Gate D4：同一 runner 能通过两个 adapter 执行；kernel 不 import 具体 task module；两个任务都通过 truth-leak、roster/claim drift 和 replay 对抗测试。

分工：Codex 冻结接口与 authority boundary；Claude Code 做第二 adapter、fixtures、机械测试和文档同步；Codex 最终审查。

### Day 5：免费回放矩阵与 calibration pilot 设计冻结

目标：先验证设计可运行，再付费估计触发率和方差。

离线/Mock 矩阵：2 task families × T/B/G × success/invalid/unavailable/timeout × exact retry。必须覆盖：

- operational Brier 在所有 terminal status 下有限且可重放；
- T/B/G final measurement 完全同构；
- G 的 apply/holdout/sham 三支均有确定性 fixture；
- sham 不携带新增任务证据；
- influence/F/diagnosis 等 mediator 只作为 secondary/exploratory，不改变 primary outcome；
- 任一自洽重算篡改仍被跨对象 replay 拒绝。

冻结 calibration pilot 表：

- primary operational metric：registered-agent ITT pooled Brier；
- primary contrasts：B−T、G−B；
- secondary：accuracy、coverage、四类 missingness、cost、latency；
- mechanistic：trigger rate、apply/holdout/sham counts、false-consensus、cascade/recovery、influence concentration；
- threshold calibration 只使用 calibration tasks，禁止读取 confirmatory outcomes；
- Stage-2 只作 exploratory process analysis。

Gate D5：分析脚本能在纯 fixture artifact 上从零生成同一张表；不允许人工复制指标。

Day 4-5 为可滑动瓶颈：若 Day 3 出现需 version bump 的 P0，顺延；GO/REVISE 判定只依赖本日冻结表，而非矩阵全量覆盖。

### Day 6：小规模 calibration/variance pilot

目标：回答“正式实验是否可运行、需要多少样本”，不是回答“治理是否有效”。

建议规模：每个 task family 的 T/B/G 各 2 个随机 run，合计 12 runs；若首轮（08-10）实际成本或失败率偏高，先减半。累计预算建议控制在 ¥30 内，本周所有真实调用总额不得超过项目所有者设定的 ¥500 总预算。

只观察以下 go/no-go 指标：

- schema replay = 100%；
- completed run 的 assignment/binding/outcome chain = 100% 一致；
- provider request 无内部 retry；
- final valid-answer rate 建议 ≥90%；低于该值停止并修 adapter，不改 outcome missingness；
- run completion rate 建议 ≥90%；
- G eligibility trigger rate 若接近 0% 或 100%，说明 threshold 无法支持比较；只能在 calibration split 上重新版本化，不能用 confirmatory outcome 调参（首轮 08-10 真实观测：无 report 达到 ≥0.9，trigger=0——此 go/no-go 已是当前事实，calibration 的首要目标之一是估出非零触发率）；
- 平均/尾部 token 与 latency 足以估计下一阶段预算；
- 两个 task family 均不能出现结构性 ceiling/floor。

所有效果量只标 `calibration/exploratory`，不做显著性叙事。

### Day 7：冻结预实验包与 Go / Revise / Stop 决策

目标：把下一周从“继续修系统”切换为“按冻结设计收数据”。

输出一个 immutable candidate bundle：

1. study contract 与 schema ref；
2. task adapter 版本和 calibration/confirmatory task split；
3. Stage-1 design、seed namespace、arm probabilities；
4. G eligibility rule、threshold policy、Stage-2 allocation；
5. provider/model/config、timeout、retry=none、per-call maxTokens；
6. final elicitation contract；
7. primary/secondary/mechanistic metric table；
8. missingness、exclusion、failure、cost handling；
9. analysis script commit hash；
10. preregistration draft和外部时间承诺方案。

决策：

- **GO**：两任务均可运行、replay 100%、失败率可接受、G 有非退化触发率，进入更大 pilot/power estimation；
- **REVISE**：接口稳定但 parser/trigger/cost 不合格，只允许版本化修复并重跑 calibration；
- **STOP/REDESIGN**：truth firewall、assignment authority、outcome identity 或 task invariance 失效，停止付费实验，返回理论/机制层。

## 5. 一周内的优先级

### P0：必须完成

1. 08-10 真实 smoke 的逐 artifact 人工尸检、审计表与提交基线（smoke 已执行，本周补审计与可追溯性）；
2. 真实失败必须可解释且不伪造成 completed；
3. task-adapter authority boundary；
4. 第二个 binary distributed-information task family；
5. calibration 分析表与冻结规则；
6. 一周末 Go/Revise/Stop 决策。

### P1：有余力再做

1. detached manifest：至少对 study/task/registry/provider config/analysis script 生成外置 hash 清单；
2. 把真实 smoke audit 自动化为只读报告；
3. categorical adapter gap audit，只做定义和测试规格，不接生产；
4. 将 v6 monolith 机械拆分，但只能在真实 smoke 稳定后做，且行为必须字节级不变。

### 本周冻结

- Web3、stake、reputation、slashing；
- latent-belief inference；
- 通用社会模拟器；
- 多治理动作竞赛；
- online threshold adaptation；
- group randomization；
- UI、演示、性能优化；
- 旧 ranking/F 主线的大规模修补；
- 为追求测试数而新增非风险导向测试。

## 6. 分工原则

Codex 只承担不可替代工作：

- authority/estimand/causal boundary 决策；
- 真实 artifact 深审计；
- task-adapter 契约；
- threshold 与预实验冻结；
- red-zone 代码和最终合并审查。

Claude Code 承担：

- 运行既定命令并整理输出；
- fixture、对抗测试、issue-code 覆盖；
- 第二 task adapter 的机械实现；
- audit 表、文档事实同步、路径/引用扫描；
- 在白名单内进行无语义重构。

项目所有者承担：

- 每次真实/付费调用授权；
- 研究任务族选择与对外主张确认；
- 预注册和外部承诺发布；
- 超过预算或扩大研究范围的决定。

Claude Code 的任何报告都必须包含：修改文件、保护不变量、精确测试数、偏离、red-zone、真实调用与费用声明；一旦发现 authority、truth timing、estimand、randomization 或 replay 缺陷，立即停止并返回 Codex。

## 7. 复杂度预算

本周允许新增的核心抽象最多一个：`V6TaskAdapterV1`。其他需求优先用配置、fixture、只读分析或文档完成。

新增生产代码必须至少删除一处 task-specific branching，或直接关闭一个真实 smoke 缺陷；否则延期。禁止为了“平台感”增加没有实验消费者的 registry、manager、service 或 schema。

评估每项工作的三个问题：

1. 它是否提高测量有效性、因果可识别性或跨任务可迁移性？
2. 它是否能被本周 artifact/test 证伪？
3. 如果治理效果为零，它是否仍构成可复用贡献？

三问均否的工作不进入本周。

## 8. 周末理想交付物

- 一个干净、可追溯的基线 commit；
- 真实 T/B/G engineering smoke artifact 与审计报告；
- 两个 task-family adapter 的 mock/小样本证据；
- calibration/variance 表与费用估计；
- 冻结的 pilot candidate bundle；
- 明确的 Go/Revise/Stop 决议；
- 一页论文贡献映射：
  - 即使 G−B = 0，仍保留显式 belief measurement、审计 DAG、统一终局测量和可重放治理链；
  - 若 B−T 改善，支持 architecture-enforced explicit reporting；
  - 若 G−B 改善，再支持 selective epistemic governance；
  - 若 governance 只改善 calibration/missingness/cost 而非 accuracy，如实报告多目标权衡。

这一周结束后，项目应少一个不确定性层，而不是多一层架构：从“内核是否能跑”转向“现实 provider 下测量是否可靠、任务边界是否可迁移、实验是否值得扩样”。
