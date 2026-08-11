# AI 审计 Claim 逐条核验报告

> **历史审计快照（2026-08-06）：**本文记录当日代码与测试基线，不代表当前 V6 实现状态。当前事实应以实现、最新测试及后续 V6 权威文档为准；保留本文是为了追踪缺陷来源与修复证据。

> 目的：对一份外部 AI 审计报告中的 P0/P1/P2 claim 做**客观代码级核验**，区分"真实缺陷"与"被夸大的指控"，为后续修复提供可信依据。
> 方法：13-agent workflow（22 claims / 13 clusters，258 次工具调用）逐条对照源码 + 独立 tsc/vitest 基线复核 + 对 6 条判断性结论的对抗复核（第二轮 workflow）。
> 基线：`tsc --noEmit` = **14 错误**（全为类型漂移，无其他类）；`vitest run` = **28 files / 630 passed / 3 skipped**。
> 日期：2026-08-06。分支：`refactor/phase-0-dead-code-removal`。

---

## 一、判定总览（22 claims）

| Cluster | Claim | 判定 | 审计严重度定性 | 一句话结论 |
|---|---|---|---|---|
| P0.1 协议漂移 | P0.1.1–P0.1.5（5 条） | **CONFIRMED** | 匹配 | delta 干预类型两套体系（`InterventionType` vs `DeltaInterventionSuggestion`），`devils_advocate` 无处安放 → tsc 14 错误 |
| P0.2 | 收敛/终止绕过治理与审计 | **CONFIRMED** | 匹配 | 主循环 break 顺序导致收敛轮不入 `roundDataArray`，result 与 audit 轮数不一致 |
| P0.3 | 全失败 → NaN | **CONFIRMED** | 匹配 | 0 响应收敛 + `0/0` NaN，输出伪装成 "neutral" 共识 |
| P0.4 | SSRF | **CONFIRMED** | 匹配 | v3/execute 类型断言 + 未文档化 `baseUrl` 直通 `callLocalLLM`，无 SSRF 防护/鉴权 |
| P0.5 | prompt 输出契约冲突 | **PARTIAL**（审计 OVERSTATED） | 夸大 | 冲突仅默认 prompt 路径成立，实验主路径已覆盖完整 schema |
| P1.1 | 配置不流动 | **CONFIRMED**（作用域内全真；workflow 曾过度降级） | 匹配 | adapter/API 管线内 4 条子断言全真；"研究管线已接通"不构成反驳（作用域错位） |
| P1.2 | 语义合并误删 | **CONFIRMED** | 匹配 | `targetAgentId` 不存在 → `Set([undefined])` → 数学层 inject_evidence 全丢 |
| P1.3 | GovernanceRuntime | **CONFIRMED** | 匹配 | 浅拷贝/无守卫/收敛启发式/跨轮重复计数 |
| P1.4 | 异步任务机制 | **CONFIRMED** | 匹配 | 内存 Map 永不清理、超时不取消、无持久化 |
| P1.5 | 重试层叠 | **CONFIRMED** | 匹配 | 单条 utterance 最多 6 个远端请求，无会话级预算 |
| P1.6 | dropout 因果命名 | **CONFIRMED**（严重度微调） | 微调 | 跨轮非配对比较冠因果词汇，机制属实 |
| P1.7 | AutoGen 模拟器 | **PARTIAL**（审计 OVERSTATED） | 夸大 | 模拟器属实，但 opt-in、默认实验不使用、不可混用 |
| P2.1 | 引擎行数 | **CONFIRMED** | 匹配 | ±1 行内吻合 |
| P2.2 | 双 adapter 重名 | **CONFIRMED** | 匹配 | lib/adapters 与 runtime/adapters 各有一套 CustomAdapter/AutoGenAdapter |
| P2.3 | 模块级 PRNG | **PARTIAL** | 部分 | PRNG 顺序依赖属实，但仅影响 HTTP API confidence 回退，不影响实验种子 |
| P2.4 | 输出无状态标记 | **CONFIRMED** | 匹配 | 无 valid/degraded/failed 状态，缺失字段静默默认填充 |
| P2.5 | 自适应剂量反馈 | **CONFIRMED** | 匹配 | 反馈信号来自干预自身 applied 标志，非下一轮响应 |
| P2.6 | CI 契约 | **REFUTED**（审计 OVERSTATED） | 夸大 | 仓库无 CI 配置、无 API 契约测试，claim 无代码支撑 |

**合计：17 CONFIRMED + 4 PARTIAL + 1 REFUTED。** 审计在 P0 严重级与多数 P1 上高度可信；夸大集中在"影响范围"表述（P0.5/P1.1/P1.7/P2.6）。

---

## 二、P0 严重级（8/9 条全 CONFIRMED）

### P0.1 协议漂移（5 条）— tsc 14 错误坐实

核心事实：**没有单一权威 schema 文件**（`src/**/schema*.ts` 不存在）。delta 干预建议类型在 `MeasurementLayer.ts:87-96` 被本地重定义为 `DeltaInterventionSuggestion`，其 type 联合 `"inject_evidence" | "rebalance_attention" | "devils_advocate"`，而规范的 `InterventionType`（`governance/types.ts:3-11`，8 个成员）**不含 `devils_advocate`**。消费端 `nativeCognitiveEngine.ts` 把 delta 建议喂给 `GovernanceIssue` / `Intervention`，于是：

| 错误位置 | 类型 | 原因 |
|---|---|---|
| `nativeCognitiveEngine.ts:715, 729, 839` | TS2322 | `devils_advocate` 不可赋值给 `InterventionType` |
| `computeDelta.ts:105–112`（×8） | TS2353 | `EMPTY_DELTA_DIAGNOSIS` 用了 `DeltaSignal` 上不存在的 `threshold/severity/description` 字段 |
| `MeasurementLayer.ts:1558, 1561` | TS2551 | `targetAgentId` 不存在于 `DeltaInterventionSuggestion`（应为 `targetAgents`） |
| `GovernanceRuntime.ts:801` | TS2322 | 同一 `devils_advocate` 联合类型问题 |

### P0.2 收敛/终止绕过治理与审计 — CONFIRMED

`runMainLoop`（discussion/index.ts）中：

- **L294–298**：`roundResults.push(...)` 先记录轮次（带 `checkConvergence`）；
- **L307**：`if (this.checkConvergence(opinions)) break;` —— **收敛先于治理**；
- **L326**：`applyGovernance` 仅在未收敛时执行；
- **L350**：`if (this.shouldTerminateEarly(round)) break;` —— 热力学终止**先于审计写入**；
- **L357–364**：`roundDataArray.push(...)` 两个 break 之后才执行 → **最终收敛/终止轮缺失**；
- **L366–369**：`round_end` 事件同样被跳过。

后果（已在实验数据中观测）：第 1 轮收敛时 `DiscussionResult.totalRounds=1` 但审计 trace 为 0 轮、0 个 `round_end`；决策事件（`index.ts:159-163`）无条件硬编码 `finalDecision:""`、`converged:false`。测试 `test/discussion.test.ts:129-162` 只断言 result 侧轮数，未连到 roundDataArray/audit，故未捕获。

### P0.3 全失败 → NaN — CONFIRMED

- `index.ts:811-812`：`checkConvergence` 对 `opinions.length < 2` 直接返回 true（0 和 1 个响应都算收敛）；
- 失败路径 `observeAgents` 逐个 catch（`index.ts:711-714`），全失败得 `observations=[]`，`runRound` 返回 `[]`（L651），仍 push 收敛轮并 break；
- `generateFinalDecision`（L1008）：`0/0 = NaN`，L1009 标为 `neutral`，L1011 输出 "overall belief: NaN - neutral"。

### P0.4 SSRF — CONFIRMED

`src/app/api/v3/execute/route.ts`：
- L68 裸 `request.json()` + L91 `body as ExecuteRequest` **类型断言**（`llmConfig` 接口 L17-20 只声明 provider/model，`baseUrl` 未文档化但运行时保留）；
- 校验只覆盖 version/input.type/agentConfig.provider，**不校验 `llmConfig.provider`**，`"local"` 被接受；
- `providers.ts:758`：`baseUrl = config?.baseUrl || LOCAL_LLM_URL || "http://localhost:11434"`；L764-765 `fetch(${baseUrl}/api/chat)`。**无任何 SSRF 防护**（无私网 IP/云 metadata/DNS-rebind 检查），无 auth 中间件（仓库无 `middleware.ts`），限流 `getClientIdentifier` 信任可伪造的 `X-Forwarded-For`（rateLimit.ts:149-151）。

利用链：`agentConfig.provider="custom"` + `llmConfig.provider="local"` + `llmConfig.baseUrl=<内网/云 metadata 主机>`；响应经 `parseLLMResponse` 回显。范围限定为 `${baseUrl}/api/chat`（路径前缀受控），属 host/path 前缀 SSRF + 重定向跟随，公开部署且无外部 auth 代理时可达内网。

---

## 三、P1 中级（7 条：4 CONFIRMED + 3 判断性）

### P1.2 语义合并误删 — CONFIRMED（与 P0.1.3 同根）

`MeasurementLayer.ts:1557-1562`：`enhancedTargets = new Set(enhancedSuggestions.filter(s => s.type==="inject_evidence").map(s => s.targetAgentId))`。
`DeltaInterventionSuggestion` **只有 `targetAgents: string[]`，没有 `targetAgentId`** → 每个 `s.targetAgentId` 都是 `undefined` → `enhancedTargets = Set([undefined])` → **只要 SemanticTool 返回 ≥1 条 inject_evidence，所有数学层 inject_evidence 建议（含 δ_stance_flip/δ_polarization/δ_confidence_gap 的）全被丢弃**——与注释声称的"按 target 去重"修复意图完全相反（注释在 1552-1556）。

`devils_advocate` 语义路径静默丢弃：同步路径（`useSemanticTool=false`）在 `nativeCognitiveEngine.ts:745-752` 手处理；异步路径 `applyCognitiveGovernanceAsync`（L818-872）生成的建议落到 `cognitiveInterventions.ts:508-601`，其 default 分支只处理 `inject_evidence`/`rebalance_attention`，`devils_advocate` 直接 `break` 无声消失。

另注 `GovernanceRuntime.ts:567-568` 同样只读 `targetAgentId`，带 `targetAgents` 的干预在 roundResults 中不浮现。

### P1.3 GovernanceRuntime — CONFIRMED

1. `getState()`（L606-608）返回浅拷贝，`agentBeliefs/issues/interventions` 共享引用，外部可反向改内部状态；
2. `finish()`（L616-618）只置 `active=false`，`processRound`（L168）无 `active` 守卫；
3. round-complete 回调（L411）用 `currentRound >= maxRounds` 启发式报收敛，而存储轮（L201）恒 `converged:false`，timeline（L587）永远显示 "discussion"；
4. `getSessionResult`（L560-582）按 agent 成员过滤**全部累积** issues，不看 `issue.roundNumber` → 跨轮重复；干预过滤（L568）只读 `targetAgentId`。

### P1.4 异步任务机制 — CONFIRMED

`src/app/api/v3/task/route.ts`：模块级内存 `taskStore: Map`（L56-64）+ `setTimeout` 启动（L145-147）；完成/失败路径永不 `delete`（L233-245），`cleanupStaleTasks`（L67-78）只置 `failed` 不删除 → **无界增长**；超时**不取消** LLM 调用（无 AbortController 接线，`runSwarmPipeline` 无 signal 参数）；无持久化。

### P1.5 重试层叠 — CONFIRMED

`providers.ts:87-90`：`callLLM` 内部最多 3 次尝试；`custom.ts:115-124` 失败后**整体重调 `callLLM`**（本身又是 3 次）→ 单条 utterance 最多 **6 个远端请求**。无 `AbortSignal` 参数（全 src 仅 `fetchWithTimeout` 内的一次性 per-request 超时），无会话级 token/时间预算。

### P1.6 dropout 因果命名 — CONFIRMED（严重度微调）

`index.ts:245-269`："absent" 观测来自当前轮 opinions（`sourcePresent:false`），"present" 对照来自上一轮历史（`roundDataArray.find(round-1)`）——**跨时间非配对比较**。`sensitivityTrace.ts:142-168` 计算 `ite = avgWith - avgWithout`，L60 `effectType: "persuasion"|"suppression"`，L327-342 因果别名（CausalObservation/CausalEffect/estimateCausalEffect/buildCausalGraph/answerWhoCausedChange），L293-309 `decomposeBeliefChange`。混杂因素：belief 更新、治理干预、记忆累积、逐轮独立 dropout 选择，SUTVA 违背在 L18-23 自我记录。→ 机制属实；实际影响取决于下游是否真把 `ite` 当因果估计引用（见对抗复核）。

### P1.7 AutoGen 模拟器 — PARTIAL（审计 OVERSTATED）

模拟器**属实**：`autogen.ts:45/53` 随机 belief/confidence、L25-27 echo-only `sendMessage`、L76 硬编码 "positive"。但：(1) opt-in，无实验/默认路径选择它（全实验用 `CustomAgent` + LLM provider）；(2) `AutoGenAgent` 未导出、`runInteraction` 单 adapter 建全 agent → 同 run 内不可与真 LLM 混用，"混合污染"需整体替换才会发生。另注 `src/runtime/adapters/AutoGenAdapter.ts` 是真 HTTP sidecar 集成，审计"AutoGen 不是集成"仅对该 lib 文件成立。

---

## 四、P2 结构项（4 CONFIRMED + 1 PARTIAL + 1 REFUTED）

### P2.1/P2.2/P2.4/P2.5 — CONFIRMED

- P2.1：`wc -l` 实测 1945 / 1699 / 1538 行，与审计 ±1 行吻合（MeasurementLayer/discussion/governance）；
- P2.2：`lib/adapters/custom.ts:195`、`autogen.ts:40` 与 `runtime/adapters/CustomAdapter.ts:21`、`AutoGenAdapter.ts:41` 各自同名同构——**Phase-0 去重的直接对象**；
- P2.4：`AgentState`（adapters/types.ts:27-33）无 status/来源；`custom.ts:187`、`observation/index.ts:67-68`、`discussion/index.ts:489` 对缺失/不可解析 belief/confidence **静默默认填充**（硬调用失败会 throw，但 malformed 响应不标记）；
- P2.5：自适应剂量输入 `computeHistoryEffectiveness`（adaptiveDosage.ts:191-202）来自 `evaluateEffects()`——`belief_diversity_change/mean_change/intervention_success_rate` 中 success 由**干预自身 `applied:true`**（如 reduceWeight.ts:52）定义，非下一轮 agent 响应质量。

### P2.3 模块级 PRNG — PARTIAL

`pipeline.ts:18` `pipelineFallbackRng = mulberry32(0x5EED)` 模块级闭包，状态随每次 draw 前进；`parseAgentStates`（L252）消费。长驻服务里每次请求的 fallback confidence 依赖先前 draw 次数（请求顺序）。**但实验种子不受影响**：Runner.ts:98 每 run 新建种子 PRNG、statsShared.ts:120-121 固定种子常量。`runSwarmPipeline` 仅被 v3/execute 与 v3/task 使用。审计"seed results depend on prior request order"限定为 API 路径才成立。

### P2.6 CI 契约 — REFUTED（审计 OVERSTATED）

仓库**无 CI**：无 `.github`、`git ls-files` 无 workflow yaml；`package.json` 只有 build/lint/test 脚本，无 `typecheck`、无 CI 链；`test/` 无任何文件引用 `api/v3`/`api/health`/`app/api`（无 API 契约测试）。只有少量核心异常分支测试（llm-providers/pipeline/adapters/discussion）且未接 CI。审计断言的"CI 要求 tsc/lint/core-branch/API-contract"在代码层面**无支撑**。

---

## 五、判断性结论（6 条，第二轮对抗复核 workflow 定稿）

> 方法：每个判断性结论一个对抗 agent，任务=**尽力证伪** workflow 的判定（检查降级是否正确、行号有无幻觉）；再一个综合 agent 聚合。全部 MEDIUM-HIGH 置信，0 UNRESOLVED，0 行号幻觉。

| Claim | workflow 判定 | 对抗复核最终判定 | 复核关键修正 |
|---|---|---|---|
| P0.5 prompt 契约 | PARTIAL / OVERSTATED | **PARTIAL**（范围 CORRECTED，impact 维持高估） | 冲突范围比"仅 DEFAULT"更广：2-field prompt 是 actively-used 遗留设计，`lunar_survival/` 全套脚本 + `v2/sensitivity.ts:157` 显式传入；但 belief/confidence 兜底 + 空字段被检测器安全降级，impact 仍高估 |
| P1.1 配置流动 | PARTIAL / OVERSTATED | **CONFIRMED**（CORRECTED，唯一过度降级） | 审计 claim 作用域自限 adapter/API 管线，该域内 4 子断言全真；workflow 用 Runner 研究管线反驳 = 作用域错位。细节：crewai/langgraph 会**通过白名单校验**后才抛 500 |
| P1.6 因果严重度 | CONFIRMED（微调） | **CONFIRMED**，severity OVERSTATED 恰当（HELD） | 机制全核实；且该 dropout 分析是**死代码**（enableDropoutAnalysis 全仓从未置 true、getDropoutObservations 无消费者、sensitivityTrace 仅单元测试消费、Causal* 别名已 @deprecated）——比 workflow 认知更轻 |
| P1.7 AutoGen | PARTIAL / OVERSTATED | **PARTIAL**（HELD） | 判定成立；但 workflow 自身的注记有误：`runtime/adapters/AutoGenAdapter.ts` **无 HTTP/fetch 代码**，applyIntervention 抛 "sidecar not yet built"，非真 sidecar |
| P2.3 PRNG | PARTIAL | **PARTIAL**（HELD，波及面修正） | 仅限 API 路径成立；且顺序依赖的 confidence 还喂 avgConfidence/confidenceDispersion/agentBeliefs 等派生量，API 侧波及面比"仅 confidence 回退"更大 |
| P2.6 CI | REFUTED | **REFUTED**（HELD） | 无 .github、无 typecheck 脚本、test/ 零 API 引用、'branch' 零命中；审计对 CI 基础设施的描述属虚构 |

**对抗复核后的最终判定表**（22 claims）：
17 CONFIRMED + 4 PARTIAL + 1 REFUTED（P1.1 从 PARTIAL 修正为 CONFIRMED）。

**审计可靠性总评**：机制层高度可靠（行号精确、机制识别准、对"误用性 API 表面"敏锐）；判断层偏弱——三层混淆（lib / experiments-Runner / runtime / API 不分，多次用一条路径证据反驳另一路径 claim）、严重性通胀（死代码/诊断代码当实验关键路径）、一次基础设施虚构（P2.6）。修复时应以"该机制实际影响哪个执行层"为先验判断，别被 impact 措辞带偏。

---

## 六、修复建议（按优先级）

### P0-A：类型协议统一（tsc 14 错误 → 0）

落点与建议：
1. **`governance/types.ts:3-11`**：若保留 `devils_advocate` 为一级治理类型 → 加入 `InterventionType` 联合。这是最干净的一条路，立即消掉 nativeCognitiveEngine 3 处 + GovernanceRuntime 1 处 TS2322。
2. **`computeDelta.ts:104-114`**：`EMPTY_DELTA_DIAGNOSIS` 换成 DeltaSignal 合法字段（`value/triggered/explanation/minConfidence/effectiveThreshold`），消 8 处 TS2353。
3. **`MeasurementLayer.ts:1558,1561`**：`targetAgentId` → `targetAgents`，**且去重逻辑要重写**——`targetAgents` 是 `string[]`，需展平进 Set 并做重叠判断（`s.targetAgents.some(t => set.has(t))`），否则换字段名后 `Set` 存的是数组、去重仍失效。

### P0-B：主循环轮序与审计一致性（index.ts）

- 收敛/终止 break 前把最终轮写入 `roundDataArray` 并 track `round_end`（把 L357-369 提前到 break 之前，或重构为统一收尾函数）；
- 决策事件（`index.ts:159-163`）填入真实 `finalDecision`/`converged`；
- 补测试：收敛轮 result 轮数 === audit trace 轮数 === round_end 事件数。

### P0-C：零响应/NaN 处理

- `checkConvergence`（L811-812）：`opinions.length < 2` 不应返回 true，应走失败/重试；
- `generateFinalDecision`（L1008）：空 opinions 防 `0/0`，输出显式 "failed/no consensus" 而非 "neutral"。

### P0-D：v3 安全（route.ts + providers.ts）

- `llmConfig.provider` 白名单校验；`baseUrl` SSRF 防护（私网/云 metadata 段阻断 + DNS-rebind 检查）；
- 增加 auth 中间件 / 服务端限流（不信任 X-Forwarded-For）。

### P1 批次

- **P1.2**：随 P0-A 修复 `targetAgentId`，并补 `cognitiveInterventions.ts` 对 `devils_advocate` 的分支（或映射到现有类型）；
- **P1.3**：`getState` 深拷贝、`processRound` 加 active 守卫、回调收敛用真实检测结果、`getSessionResult` 按 `roundNumber` 过滤 + 干预读 `targetAgents`；
- **P1.4**：完成/超时即清理 Map；超时用 AbortController 真正取消；可选持久化；
- **P1.5**：把重试收敛到单层策略，`callLLM` 透传 AbortSignal，加会话级 deadline；
- **P1.6**：重命名因果词汇（ITE/Causal*/persuasion/suppression）为描述性措辞，文档标注跨轮比较非因果。

### Phase-0 去重专项（P2.2/P2.3 顺带）

- `lib/adapters` 与 `runtime/adapters` 两套 CustomAdapter/AutoGenAdapter 同名同构——审计证据齐全，是 branch 主题的直接对象；
- `pipelineFallbackRng` 注入化或限定为每请求实例。

---

## 七、基线证据

- `npx tsc --noEmit`：14 错误（nativeCognitiveEngine ×3、computeDelta ×8、MeasurementLayer ×2、GovernanceRuntime ×1）——与 P0.1.5 报告一致。
- `vitest run`：28 files / 630 passed / 3 skipped。一次失败运行（28/28 "Cannot read properties of undefined (reading 'config')"）为配置加载环境问题，两次干净复跑证实通过。
- E12 phase C（glm-4-flash）实测：meanAcc 0.571、meanIndAcc 0.170、meanPreAcc **1.0**、meanGain **-0.83**——preAccuracy 恒 1.0 与"全失败→NaN"路径无关，但 0.83 的负增益与 P0.2 轮序/审计缺失问题同框，是后续论文叙事必须处理的观测事实。

---

## 八、已实施修复（2026-08-06 低风险高收益批次）

按"低风险、高收益"原则选取，全部经 `tsc 0 错误 + vitest 630 通过（无回归）`验证：

| 审计 claim | 修复 | 文件 | 验证 |
|---|---|---|---|
| P0.1.1/4/5 | `InterventionType` 加入 `"devils_advocate"`；`Intervention` 补可选 `reason/source`；`GovernanceIssue` 补 `detectedAt/id` | governance/types.ts | tsc 4 处 TS2322 消除 |
| P0.1.2 | `EMPTY_DELTA_DIAGNOSIS` 改用 `DeltaSignal` 合法字段（`value/minConfidence/effectiveThreshold/explanation`） | computeDelta.ts | tsc 8 处 TS2353 消除 |
| P0.1.3 + P1.2 | `MeasurementLayer` 合并逻辑 `targetAgentId` → `targetAgents`（展平 Set + 重叠判断），修复"SemanticTool 返回任意 inject_evidence 时数学层全丢" | MeasurementLayer.ts | tsc 2 处 TS2551 消除 + 行为修复 |
| P0.1.4 | 同步路径 `Intervention` 字面量补必需 `effect` | nativeCognitiveEngine.ts | tsc 消除 |
| P1.2（异步路径） | `generateCognitiveInterventions` default 分支补 `devils_advocate`（镜像同步路径注入 devil's advocate prompt），消除静默丢弃 | cognitiveInterventions.ts | 新增分支 |
| P0.3 | `checkConvergence` `<2 → false`（0/1 响应不再是"收敛"）；`generateFinalDecision` 空 opinions 显式返回 "FAILED, not a consensus" 而非 `0/0 NaN - neutral` | discussion/index.ts | 12 测试过 |
| P1.1（部分） | 删除零消费的 `FrameworkAdapterOptions`；v3/execute `validProviders` 收窄为 `["autogen","custom"]` → crewai/langgraph 提前 400 而非通过校验后 500 | adapters/types.ts、adapters/index.ts、execute/route.ts | tsc 0 |
| P2.3 | `pipelineFallbackRng` 从模块级改函数作用域（每次 runSwarmPipeline 从固定 seed 重启）→ 消除跨请求顺序依赖 | pipeline.ts | tsc 0 |

**验证结果**：`tsc --noEmit` **14 → 0**；`vitest run` **630 passed / 3 skipped（无回归）**；`test/cognitive-interventions.test.ts` 修正占位字段 `detectedAt: 1`（接口补齐后冲突）。

**刻意未纳入本次（需更谨慎的批次）**：
- **P0.2** 主循环轮序（收敛/终止 break 前把最终轮写入 roundDataArray + round_end）——触及核心循环，行为影响需用 E12 数据复跑对照；
- **P0.4** SSRF 防护（provider 校验 + baseUrl 私网/云 metadata 阻断）——安全加固，需同时评估对本地 dev `localhost` 的合法使用影响；
- **P1.3** GovernanceRuntime 四个子项、**P1.4** task 清理/取消、**P1.5** 重试收敛——中等风险，独立成批；
- **P1.6** 死代码 dropout 分析删除——已 @deprecated 且有单元测试消费，删除属更大手术。

---

## 九、第二轮审计（8 claims 核验 + 实验数据有效性判定）

> 输入：用户提供的第二轮 AI 审计报告（4×P0 + 4×P1）。方法：逐条源码级核验 + 4-agent 数据有效性 workflow（S1 文档引用核对 / S2 分析脚本字段核对 / S3 v2 早期数据扫描 / S4 对抗完整性复核）+ 位置回退量化实验（`experiments/campaign/measure_pos_fallback.ts`）。
> 约束：**"会影响到 E12 实验数据的先放一放"** → P0a/P0b/P0c/P0d/P1a/P1c 判实但**延后**；P1b 已修复；P1d 判实但不触及 E12 主路径。

### 9.1 8 claims 核验表

| Claim | 判定 | 证据 | 处理 |
|---|---|---|---|
| P0a 收敛绕过治理 | **CONFIRMED** | `src/lib/discussion/index.ts:307` `if (this.checkConvergence(opinions)) break;` 位于 belief 更新/`applyGovernance` 之前 → 收敛轮不经过治理与审计 | 延后（生命周期重构） |
| P0b 终止丢弃最后一轮 | **CONFIRMED** | `index.ts:350` `if (this.shouldTerminateEarly(round)) break;` 位于 `roundDataArray.push`（:357-364）之前 → 热力学终止轮不入审计 trace | 延后（生命周期重构） |
| P0c 位置回退制造准确率 | **误报（复核更正）** | 回退逻辑确在旧版存在（`0f17e85` 已移除，现 fail-closed）；但 `measure_pos_fallback.ts` 量化判定的 24 个"污染 run"为**误报**——脚本用缺终轮的 `roundOpinions` 重算，而 `finalRanking` 实来自真实终轮（`result.roundResults`）。详见 §9.2b | 撤销重标计划，E12 数据维持有效 |
| P0d 低 F 单独触发结晶 | **CONFIRMED** | `src/lib/thermodynamics/TerminationDecider.ts:268` `if (F < this.thresholds.strongCrystallF)` 单独即可触发 strong_crystallized（:265-274），未要求 R 高 ∧ H 低 ∧ T 低同时成立 | 延后（需消融） |
| P1a seed 不在协议 | **CONFIRMED（低严重度）** | `experiments/campaign/pipeline/Runner.ts:309-314` llmConfig 无 seed 字段 → 参考协议 LLM 调用未锁种子 | 延后 |
| P1b "官方协议"表述过强 | **CONFIRMED + 已修复** | 7 处改为"参考协议/第三方 reference implementation（非论文作者官方仓库），协议细节以 arXiv:2505.11556 为准" | **已修复** |
| P1c 运行后归一化 | **CONFIRMED** | `Runner.ts:500-533` 归一化在 `engine.run()` **之后**执行 → 在线 δ/热力学测量不受影响，无法事后修正 | 延后（需在线归一化） |
| P1d API 默认 schema 冲突 | **CONFIRMED（不触及 E12）** | `src/lib/adapters/custom.ts:81-87` 默认 prompt 只产出 emotion/reasoning 字段；E12 经 CustomAgent `customPrompt` 绕过。默认路径 + `CustomAdapter maxRounds:3` 仍为潜伏缺陷 | 延后（独立批次） |

### 9.2 P0c 位置回退量化（关键实测）— 复核更正为误报

`experiments/campaign/measure_pos_fallback.ts` 模拟 Runner 流程（normalize → extractRanking），对比带回退 vs 无回退，判定 **24 个 E12 run 的 finalAccuracy 被位置回退压低（accDeflated）**。**2026-08-07 数据全量复核推翻了该结论。**

### 9.2b 复核证据链（2026-08-07，见 docs/DATA_ANALYSIS_2026-08-07.md）

1. **measure 用了错误的轮**：脚本取 `roundOpinions` 最后一轮重算排名，但 **158/158 e12 run 的 `totalRounds == len(roundOpinions)+1`**——`roundOpinions` 缺终轮（P0a 修复前 `roundDataArray.push` 在 break 之后）。实际 `finalRanking` 由 `Runner.ts:523-572` 从 `result.roundResults[last]` 计算，那是**真实终轮**，从不依赖 roundDataArray。
2. **同 task 跨 seed 排名多样性**：task35 seed42（已存轮全占位符）finalRanking=[Datacenter Beta, Alpha, Gamma]，seed123（canonical 轮）=[Gamma, Alpha, Beta]。若 finalRanking 是位置回退（固定 Object.keys 原顺序），两者必相同 → **不同 ⇒ 来自真实终轮聚合**。
3. **B_t12 反向对照**：placeholder 与 canonical run 的 finalRanking 相同（overlap=1）——真实聚合本可一致，证明一致性不构成回退证据。
4. **fail-closed 自证**：当前 `extractRanking` 在终轮 itemBeliefs 无法匹配规范名时抛错 → finalRanking 为空。**存储的 finalRanking 全部非空 ⇒ 终轮必然成功匹配了规范名**（自身一致性证明）。
5. 已存轮次中的占位符（"Company A/B/C" 等，e12 中 34 run 全占位、31 部分占位）只是 LLM 在**已存轮次**的输出形式，与终轮生成 finalRanking 无关。

**更正结论**：
- 24 个 run 的 finalRanking/finalAccuracy/finalKendallTau **维持有效，无需重标/重跑**；此前"P0c 固有数据缺陷"的判定作废。
- 代码层回退已在 `0f17e85` 移除（fail-closed），P0c 无残留。
- 真实遗留问题：**终轮轨迹整体缺失**（§9.3 补充）+ LLM 部分轮次占位符输出（值得在论文局限记录）。

### 9.3 E12 主数据有效性判定

**判定：E12 主数据对 08-06 修复有效，可继续用于当前分析（含此前判定受 P0c 影响的 24 runs——2026-08-07 复核确认该判定为误报，见 §9.2b）。**

依据（252+ run 扫描 + workflow S1/S2）：
1. E12 全部 244 raw runs 走 native 同步路径：**0 semantic、0 degenerate、0 形状差异**；
2. 08-06 fix#1/#2（checkConvergence/generateFinalDecision）：不改变 E12 正常路径行为（E12 无 <2 opinions 的收敛 run）；
3. 08-06 fix#3（merge 修复）：E12 路径永不执行（semanticAuditLog 全空，异步分支不触发）；
4. 08-06 fix#4（devils_advocate）：E12 的 81 次 devils_advocate 干预全部来自同步路径，与异步分支无关；
5. P0c 回退缺陷：代码层已在 `0f17e85` 移除（现 fail-closed）；"24/228 runs 被回退压低"的量化判定为**误报**（measure 脚本用缺终轮的 roundOpinions 重算，而 finalRanking 来自真实终轮 `result.roundResults`），E12 finalRanking/finalAccuracy 维持有效；
6. **2026-08-07 新发现（终轮轨迹缺失）**：158/158 e12 run（及 E1 9/9、E9_optimized_a 9/9）的 `roundOpinions`/`itemBeliefsTrajectory`/`thermoHistory`/`deltaDiagnosis` 缺终轮（P0a 修复前 `roundDataArray.push` 位于 break 之后）。**不影响 finalRanking/τ/accuracy**（来自 `result.roundResults` 真实终轮），但**终轮诊断数据不可得**，逐轮机制解读需注明。

**S4 对抗完整性复核（completenessVerdict = needs-followup，核心论断 confirmed-safe）：**

独立复核了"8 个修复未使存储数据失效"的 6 条证据，全部确认：
1. `checkConvergence`/`generateFinalDecision` 改动（index.ts:816/:1010）：353 文件 / 506 run 扫描，opinions<2 的退化行为为 0；
2. `EMPTY_DELTA_DIAGNOSIS` Tier-1 闸门：E12 全走同步路径完全绕过；唯一异步数据 e9_v6_c_semantic 的 semanticAuditLog 中 `outputCount` 全 0、`enhancedSuggestions` 为空 → merge 分支从未执行，对存储 interventions 无影响；
3. 无任何 run 生成于 08-06 19:20 之后；E12 全部原生同步（`native_cognitive`，无 `useSemanticTool`）；
4. `GovernanceRuntime`/`diagnoseAndSuggestSync` 唯一消费者是 experiments/v2/run.ts，07-26 后无改动；
5. `CONFIDENCE_THRESHOLD` 0.30→0.10 只在异步路径，E12 永不触发；
6. switch 类型、FrameworkAdapterOptions、PRNG、config 可选字段等改动只影响未来 run。

**S4 新增 followup（跨目录阈值不可比，已独立实测确认）**：`computeDelta.ts:77` 现为 `oneDMaskThreshold: 0.35`，但存储数据的 `effectiveThreshold` 跨目录混合——**e12/raw 全 0.35（335 条），而 e12_bc / e12_glm_hb / e12_hb_task6 / e12_glm_test / e9_optimized_a / e9_v6_c_semantic 全 0.4（118 条）**，另有 38 个 run 无 deltaDiagnosis。阈值转换发生在 08-04（早于 08-06 修复）。因每 run 用**自身存储**的 effectiveThreshold 判 triggered（MetricComputer.ts:1173 读存储标志不重算），单 run 内部自洽、不影响有效性；但**跨目录/跨实验合并比较 δ_1d_mask 触发指标时 0.4 与 0.35 不可直接比**，聚合或论文比较需按 effectiveThreshold 分层或标注。

### 9.4 全数据集有效性判定表（synthesis 综合 4 agent + 本会话实测）

| 数据集 | 判定 | 理由 |
|---|---|---|
| **E12 全系列**（e12/raw, e12_crisis_v2, e12_crisis_v2_fixed, e12_B_t*, 158+ runs） | ✅ **valid** | 全 native 同步路径、0 退化/假收敛/semantic；checkConvergence/merge/CONFIDENCE_THRESHOLD 修复对其零影响；158 文件 deltaDiagnosis 字段形状完整。analyze_e12.ts 只读 output/e12/（内部全 0.35），无现成分析混桶 |
| **E12 子系列**（e12_bc, e12_glm_*, e12_hb_task6） | ✅ **valid**（含阈值注意） | 修复零影响；但存 effectiveThreshold=0.40，跨 0.35 系列比较 δ_1d_mask 需标注分界（08-04 阈值翻转，非本次修复因果） |
| **E11**（e11_hb_none, e11_hiddenbench） | ✅ **valid** | hiddenbench 外部任务集，native 同步路径，四 agent 无发现，可直接用 |
| **E10**（e10_v6_a_pool） | ✅ **valid** | 与 E12 同源 native 同步路径，修复零影响 |
| **E1**（e1_native_lite, e1_stability） | ✅ **valid** | e1_native_lite 无退化轮、converged 标签不受修复影响；e1_stability 全 0 序列为数据自身特性（非修复因果），建议文档注明 |
| **E9 medium_scale / optimized_a / smoke_supplier** | ✅ **valid**（含阈值注意） | 同步路径无 semantic 依赖；optimized_a 存 0.40 阈值，跨系列比较 δ 需加限定；medium_scale/smoke_supplier 无任何问题 |
| **E9 v6 C semantic** | ⚠️ **needs-rerun** | run0/1 有效（τ=0.571，5 轮，semanticAuditLog=8）；**run2/3/4 为旧 checkConvergence 伪收敛直接产物**（0/1 轮、finalRanking 空、τ=0，fix#1/#2 作废）。metrics meanTau=0.229、idr_diffusion n=3 均值 0.381、IDR_end 63.8%、TECHNICAL_APPENDIX "2 轮即收敛"/"n=3" 全被污染；干预计数（22 inject+6 rebalance）生成于 08-01 旧代码，参数已变不可复现。**SemanticTool/LLM-as-sensor 收益主张需当前代码重跑（n≥10）；run0/1 仅作 n=2 样例**。E12 无 semantic 路径，不能替代此组 |
| **explore / probe / smoke** | ✅ **valid** | 探索/冒烟/协议比对数据，无结论性统计依赖 |
| **experiments/v2 早期数据** | ⚠️ **needs-relabel** | 73 文件 <2 opinions 但 converged=true：data_fraud_qwen 10/10（48 轮）、data_fraud_malicious E/F/G 24 文件（77 轮）、data_crisis_qwen crisis_none_6/shuffle_7（完全截断）、data_fraud_zhipu 2。analyze_malicious.ts "收敛=X/n" 受污染；内部 belief/thermo/governanceTrace 数值未被改写。fix#3/#4 不触及 v2（走 DiscussionEngine.applyGovernance→GovernanceEngine） |
| **lunar_survival** | ✅ **valid** | config 仅加可选字段、task_crisis 仅改提示词，只影响未来 run |
| **data/ 干净子集**（ma_*, data_crisis 主目录, data_crisis_v2, data_supplier, data_invest, data_legacy_broken_loop, data_fraud A 组） | ✅ **valid** | 全 0 退化，converged 标签可信 |

**因果归因（关键）**：fix#1/#2 修正的正是旧退化行为，故上述两处"数据在修复语义下不可信"是其**直接含义**；而 fix#3（merge）与 fix#4（devils_advocate）对任何已存数据**零影响**——唯一 semantic 数据 run0/1 生成于 08-01 C1 代码（早于 C4 merge bug 引入），且其 gap_analysis 全部 outputCount=0 使 merge 分支从未执行。

### 9.4b 纯文档转写错误（已修正，见 §9.6）

- **SWARMALPHA_TECHNICAL_DOCUMENTATION.md §8.3 表**：run3/run4 τ 记 0.571，实测 **0.000**（mean 0.229 只有按 0 才成立）；
- **SWARMALPHA :621 与 RUNTIME_GUIDE :127**：仍描述旧 `targetAgentId` 字段（现 `targetAgents`）；
- **LIMITATIONS §25.4**："C 组从未实际运行"已被 08-01 run0/1 数据证伪。

### 9.5 延后清单（按"先放一放"约束 + 项目健康度优先级）

1. **P0a/P0b（生命周期重构）✅ 已完成**：主循环统一收尾——单点 `finalizeRound`（`src/lib/discussion/index.ts`），保证收敛/终止轮也写入 `roundDataArray` + `round_end` + 治理（治理在终止判定之前、push 在 break 之前）；补收敛轮轮数一致性测试（`test/discussion.test.ts`）。**注意：此修复使未来 run 的 roundOpinions 包含终轮，与历史数据（缺终轮）口径不同，跨版本合并需标注**；
2. **P0c（数据缺陷）✅ 已闭环**：代码层位置回退已在 `0f17e85` 移除（现 fail-closed invalid 标记 + 抛错）；"24 runs 重标"判定经 2026-08-07 复核为**误报**，撤销重标计划（见 §9.2b）。遗留关注点：历史 run 缺终轮轨迹 + LLM 部分轮次占位符输出（写入论文 LIMITATIONS）。
3. **P0d（终止条件）**：F 不单独触发；要求 R 高 ∧ H 低 ∧ T 低同时成立；补消融；
4. **P1a**：协议调用补 seed 透传（锁种子）;
5. **P1c**：归一化移至认知状态更新之前（在线归一化）；
6. **P1d**：统一 canonical response schema + maxRounds 配置线程化。
7. **S4-followup（跨目录阈值不可比）**：聚合/论文比较 δ_1d_mask 触发指标前，按 `effectiveThreshold` 分层（0.4 vs 0.35）或统一重跑——当前跨目录合并会混入不同判定标准。
8. **E9 C semantic 重跑（needs-rerun）**：用当前代码（含 fix#1-#4、CONFIDENCE_THRESHOLD=0.10、oneDMaskThreshold=0.35）重跑 C 组 n≥10；重算 idr_diffusion 为 n=2（run0/1）；重新生成 e9_v6_comparison.json（现有产物 generatedAt=2026-08-01 早于 C 数据、C 组 n=0 已过期；剔除退化 run 后 n=2<3 会触发 :197 n<2 守卫，需在报告中显式注明）。
9. **数据来源↔代码版本映射表**：为每个数据集记录生成时的 commit / 参数阈值（如 oneDMaskThreshold 0.40 vs 0.35、CONFIDENCE_THRESHOLD 0.30 vs 0.10），使后续修复能按版本精确归因，避免再出现 08-04/08-06 因果混淆。

### 9.6 本轮已落地修正（低风险高收益批次，纯文档，零代码/数据影响）

在 §9.4b 核实的 3 处文档错误全部修正，另加数据有效性标注：

| 文件 | 修正 |
|---|---|
| SWARMALPHA_TECHNICAL_DOCUMENTATION.md §8.3 | run3/run4 τ 0.571→**0.000**；run2/3/4 标 ⚠️退化；mean τ=0.229 加"含 3 个伪收敛 run，不可作为结论引用"标注 |
| SWARMALPHA_TECHNICAL_DOCUMENTATION.md :621 | `targetAgentId`→`targetAgents`，注明 08-06 fix#3 与原 bug |
| architecture/RUNTIME_GUIDE.md :127 | 同上 |
| paper/TECHNICAL_APPENDIX.md :328 | semantic 行 n=3→3（有效 2）⚠️；80.0% 与 idrEndMean=0.6375 矛盾说明 |
| paper/PAPER_DRAFT.md :195 | n=3→3（有效 2）⚠️；mean τ=0.381 含退化 run2，有效 n=2 时 τ=0.571 |
| paper/PAPER_PROFESSOR_VERSION.md :453 | 同上（中文标注） |
| paper/LIMITATIONS.md §25.4 | "C 组从未实际运行"→已运行 run0/1（有效）但结论级验证未跑；Bug 已被 fix#3/#4 坐实；缓解方案改为重跑 n≥10 |

> ⚠️ 本轮 8 个修复（08-06）+ 8 个文档修正均**只写文档/改类型与逻辑**，未改动任何实验输出 JSON 数据文件。
