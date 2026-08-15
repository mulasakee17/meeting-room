# Verification Verdict V2 — Gap Audit & 返回 Codex 的实现清单

> **AUTHORITATIVE IMPLEMENTATION ADDENDUM — 2026-08-12.** The original gap audit below is retained as historical design input. Verification Verdict V2 is now implemented for the version-isolated engineering profile `mechanism-verdict-v2-v1`: request schema `2.0.0`, response contract `verdict_json_v2`, and verification-result event `2.0.0`. Accepted verdicts are exactly `supported`, `contradicted`, and `insufficient_evidence`, with `evidenceScope: public_only` and a non-empty explanation. Unexpected/substitute-answer fields fail closed. Apply, matched-attention sham, and holdout are deterministically tested through artifact persistence and zero-call replay. Legacy V1 artifacts remain readable and are not inferred or upgraded to V2. This establishes implementation and internal replay consistency only; it does not establish verifier accuracy, intervention benefit, external authenticity, or confirmatory readiness.

日期：2026-08-12
状态：只读/规格工作包（WP-A 事实盘点 + WP-B 测试规格 + WP-C 失败模式 + WP-D 实现清单）。**未修改任何生产代码。**
配套测试：[`test/v6-verification-verdict-v2.test.ts`](../../test/v6-verification-verdict-v2.test.ts)（8 项 V1 风险复现通过 + 16 项 V2 不变量 `it.todo`）。
约束：不运行真实/付费 LLM；不读取凭据；不执行 git 写操作；不修改 `src/**`、`productionVerticalSlice.ts`、`providerAdapters.ts`、schema、既有 artifact 或既有测试/配置/文档。

按 [`docs/REASONING_PROTOCOL.md`](../REASONING_PROTOCOL.md) 纪律，本文区分 FACT（实现/artifact 中直接读到）、INFERENCE（由事实推得）、DESIGN INTENT（预定语义或建议）、UNKNOWN（无法核实）。

---

## 0. 背景事实（Codex 已提供，作为本文基线）

- **FACT** mechanism-pilot-v1：HiddenBench task 1、task 4，各 6 个 G-arm replicate；12/12 eligible；Stage-2 分配 apply=3、sham=3、holdout=6。
- **FACT** Task 4 apply 两 run：n=2，mean Brier=1.283056，accuracy=0.5。
- **FACT** Task 4 一个 apply verifier 只看到 public context，却断言正确答案为 "Mr. Z"；真实答案是 "Mr. X's son"；群体随后被该错误核验结果带偏（Brier=2、accuracy=0）。
- **INFERENCE（Codex 诊断）** 当前 verification adapter 只输出自由文本 `publicContent`，不能区分 supported / contradicted / insufficient_evidence；public-only verifier 可能在证据不足时生成替代答案，形成"权威化幻觉"。

---

## 1. WP-A：当前 V1 调用链事实盘点（逐行追踪）

### 1.1 调用链总览

```text
验证请求构造(V6VerificationRequestV1)
  → requestHash = hashValue(request)
  → verificationAdapter.verify(request)   [providerAdapters.ts]
      → 非 sham: 构建 public-only prompt（publicContext + claim + targetPublicMessage）
      → 解析 JSON，仅接受单字段 publicContent（多字段/畸形 → unavailable）
      → 返回 { status:"response", publicContent }
  → governance source event (swarmalpha.event.verification-result v1.0.0, kind=tool_result)
  → action transitions: queued → delivered → compliance_observed → completed
  → publicTranscript 追加 round-2 governance 消息（content = publicContent）
  → round-2 讨论请求携带该 governance 消息（visibleTranscript 含同 round governance）
  → replay: requestHash 重放 + transcript 与 source event 逐字段绑定
```

### 1.2 逐环节 FACT

| # | 环节 | 位置（FACT） |
|---|---|---|
| 1 | 验证请求构造：`requestId=verification:${runId}:${instance.id}`，携带 `runId/taskId/actionRef/targetAgentId/claim/publicContext/targetPublicMessage/matchedTokenBudget/modelRef/invocationConfig`，**无 privateInformation、无 groundTruth、无 resolution** | `productionVerticalSlice.ts:1570-1583` |
| 2 | `requestHash = hashValue(verificationRequest)` | `:1584` |
| 3 | 超时/失败映射：`withTimeout` → timeout；异常 → `unavailable + providerFailureCode` | `:1585-1592` |
| 4 | 非 sham prompt：`Task public context + Claim + Public message to verify`，返回"exactly one field: publicContent"；sham prompt 只要求 `acknowledgment` | `providerAdapters.ts:169-175` |
| 5 | 解析：非 sham 只接受"恰好一个字段 publicContent（非空 string）"；多余字段（如 verdict/complied）→ `unavailable/adapter_unavailable`；sham 只接受 `acknowledgment`，内容被丢弃 | `providerAdapters.ts:204-219`、`:186-203` |
| 6 | source event：`swarmalpha.event.verification-result` v1.0.0，payload={requestId, requestHash, actionInstanceId, actionRef, complied:true, publicContent}，`contentHash` 自算 | `:1604-1622` |
| 7 | 生命周期：`queued→delivered→compliance_observed→completed`，全部绑定该 source event id | `:1624-1628` |
| 8 | transcript：`{round:2, agentId:"governance:${refKey(actionRef)}", content:publicContent, source:"governance"}` | `:1629-1634` |
| 9 | round-2 可见性：讨论请求重放时 `visibleTranscript` 含"同 round governance 消息" | `:636-637` |
| 10 | 讨论请求重放：按冻结 task/adapter/trace 重建请求并核对 requestHash | `:638-656` |
| 11 | 验证结果重放：toolResults 数==governance 消息数；payload 字段；经 actionInstance→diagnosis→beliefReportId 恢复 targetPublicMessage；重建 expectedRequest 并核对 requestHash；transcript governance 消息 content==publicContent | `:875-932` |
| 12 | round-2 排序守卫：governance 上下文必须先于 round-2 agent 调用提交 | `:714-721` |

### 1.3 WP-A 关键结论

- **FACT** 验证请求与 prompt 是 **public-only**：请求对象无 privateInformation/groundTruth/resolution 字段（`productionVerticalSlice.ts:1570-1583`）；prompt 只含 publicContext、claim 命题、targetPublicMessage（`providerAdapters.ts:169-175`）；artifact 实测无 hidden-information 子句进入验证调用。
- **FACT** V1 只承载**单一自由文本** `publicContent`：既作为 delivered 内容（source event payload + transcript），也是唯一可区分字段；`verdict/evidenceScope/explanation` 在 V1 artifact 中不存在（实测 `contains verdict: false`、`contains evidenceScope: false`）。
- **FACT** 投递文本的原始 provider 输出**未持久化**：`v6InteractionTrace` 无 `rawResponse`；讨论/验证路径只存解析后的 `publicMessage`/`publicContent`（final 私有采集另存 `rawResponse` 于 `finalOutcome`，属于另一 instrument）。
- **INFERENCE** 当前 replay 能把"投递文本"绑定到 source event 与 transcript（内容逐字段相等），但**没有** provider 原始输出的参照，无法证明投递文本就是 provider 实际输出——自洽重写 event+transcript+contentHash 可通过 replay。见 §5 red-zone 2。

---

## 2. WP-B：对抗测试规格与实现状态

新建 `test/v6-verification-verdict-v2.test.ts`（未修改既有测试/生产代码）。命令：`npx.cmd vitest run test/v6-verification-verdict-v2.test.ts --maxWorkers=1`。

- **8 项 V1 风险复现测试（当前通过）**：锁定 V1 的既有（缺陷）行为，V2 必须改变它们——
  1. 验证请求 public-only（无 private/truth/resolution；prompt 无 hidden 子句）；
  2. adapter **接受**"替代正确答案"自由文本（权威化幻觉在 V1 是正常 response）；
  3. verdict 形响应被 V1 拒绝（无 V2 carrier）；
  4. contradicted 与 insufficient_evidence 自由文本结构不可区分；
  5. 畸形输出 → unavailable，从不产生 verdict；
  6. sham 返回固定内容且无 verdict/evidenceScope；
  7. V1 artifact 的 verification-result source event 只含 publicContent（无 verdict/evidenceScope/alternativeOutcome/correctAnswer/recommendedAnswer）；
  8. V1 artifact 的 governance transcript 逐字携带 verifier 自由文本。
- **16 项 V2 冻结不变量（`it.todo`，未通过、未声称通过）**：对应预定语义清单 1–16（见文档开头区块），涵盖 verdict 枚举合法性、未知/缺失 verdict 拒绝、unexpected fields 拒绝、替代答案字段拒绝、evidence-scope 篡改 replay 拒绝、V1/V2 区分、sham 无 verdict authority、failure→insufficient 不可转换、insufficient 不传播、JSON round-trip 可重放。

### 测试/todo 保护的不变量（逐项）

| # | 不变量 | 测试形态 |
|---|---|---|
| 1 | public-only request 不含 privateInformation/groundTruth/resolver opening | V1 风险复现（passing）|
| 2 | `supported` 合法 | todo |
| 3 | `contradicted` 合法但无替代答案 | todo |
| 4 | `insufficient_evidence` 合法 | todo |
| 5 | 未知 verdict 拒绝 | todo |
| 6 | 缺失 verdict 拒绝 | todo |
| 7 | unexpected fields 拒绝 | todo |
| 8 | alternativeOutcome/correctAnswer/recommendedAnswer 拒绝 | todo |
| 9 | 证据不足时 verifier 不可输出"正确答案是 X" | V1 风险复现（passing，证明确实可输出）+ todo（V2 必须禁止）|
| 10 | verdict/explanation/evidenceScope 篡改 → replay 不匹配 | todo |
| 11 | transcript 与 source event 逐字段一致 | V1 风险复现（passing，V1 已逐字绑定 content）+ todo（V2 扩展绑定）|
| 12 | V1 artifact 只读 legacy，不冒充 V2 | V1 风险复现（passing，实测无 verdict 字段）|
| 13 | sham 不调用 verifier 且无 verdict authority | V1 风险复现（passing）+ todo |
| 14 | unavailable/timeout 不可转 insufficient_evidence | V1 风险复现（passing）+ todo |
| 15 | insufficient_evidence 完成 delivery 但不作为支持/反驳传播 | todo |
| 16 | structured clone/JSON round-trip 后仍可 replay 验证 | todo |

---

## 3. WP-C：实验失败模式记录（只读 artifact 分析）

### 3.1 数据（FACT，来自机制 pilot task4 目录）

**Run 1（apply）**：`run_v6-hb-task4-mechanism-pilot-v1-20260812_epistemic_governance_v1_1.0dc6a1c21366.raw-run.v5.json`

- 监控选中目标：agent `hiddenbench:4:3`，round-1 belief `{Mr. X's son: 1}`（正确）。
- verifier（deepseek-chat，temperature 0）返回 `publicContent`："The public message is incorrect. The guilty person is Mr. Z, not Mr. X's son… The correct perpetrator is Mr. Z."
- governance transcript 追加 round-2 消息 `governance:swarmalpha.action.verification-request@2.0.0`，内容即上述文本（逐字）。
- round-2：3 个 agent 全部翻转为 `{Mr. Z: 1}`，并在 publicMessage 中明确引用"the verification request explicitly states… the correct perpetrator is Mr. Z"。
- final pooled Brier = 2（4 类 categorical 满分错误），`taskOutcome.quality = 0`。

**Run 4（apply）**：`run_v6-hb-task4-mechanism-pilot-v1-20260812_epistemic_governance_v1_4.a9fe7e758860.raw-run.v5.json`

- verifier 返回："The public message is not verifiable as the correct answer… cannot be independently verified based on the given information."（语义上近似 insufficient_evidence，但 V1 无结构标识）。
- final pooled Brier = 0.5661111，`taskOutcome.quality = 1`（群体未被带偏）。

**Task 4 事实**（`benchmark.json` id=4 `toma_butera_2009`）：shared 信息含红鲱鱼"Mr. Z … speeding on the N13 road"；正确答案 `Mr. X's son` 需 hidden（private）信息才能确定——guilty 驾车（非摩托车）、<30 岁、经验不足、父亲间接责任、110 km/h、酒精 1.5、自认分心。

### 3.2 失败机制（INFERENCE）

- verifier 的证据范围确实 public-only（§1.3），因此它在**结构上无法**判定 "Mr. X's son" 为正确——public context 在无 private 信息时欠定。
- 但 V1 只要求"Give an independent verification"并返回自由文本，未提供"证据不足 → insufficient_evidence"的出口；模型因而在欠定场景下生成了**自信的替代答案**（"The correct perpetrator is Mr. Z"）。
- 该自由文本被**逐字投递**到 round-2 transcript（`governance:` 身份），3 个 agent 将其当作权威 ground truth 全盘采信 → Brier=2。

### 3.3 为什么这是 verification authority risk，而不是已建立的负因果效应

- **FACT** apply 仅 n=2；run 4 的 verifier 输出"not verifiable"且群体正确。单案例（1/2）无因果识别力。
- **INFERENCE** 该失败是**测量机制缺陷**（verifier 输出不可结构化、不可校验、以权威身份逐字投递），不是"治理干预导致决策变差"的处理效应。按 REASONING_PROTOCOL §7，不能从单个失败案例推断因果；正确的表述是"verification-authority 机制风险"，而非"治理有负效应"。
- **INFERENCE** 该风险污染的是任何未来治理效应估计的 **内部效度**：如果 verifier 输出可以自信地断言错误答案并翻转群体决策，那么 apply/sham 的 pooled-Brier 差异混入了这个不受控注入，无法解释为干预效果。

### 3.4 为什么不能靠补样本掩盖

- 补 replicate 只会对机制噪声取平均，不会移除混淆源：错误但自信的 verifier 断言可以在任意样本量下翻转 pooled decision。缺陷在**测量仪器**（输出格式无法验证/门控），不在抽样。
- 单个此类失败即已宣告当前 verifier instrument 不合格；正确动作是**结构性修复（V2 structured verdict）**，而不是加大 N。
- mechanism pilot 的定位本就是机制检验（apply=3/sham=3/holdout=6、n 远低于效应估计所需），补样本也不会把机制风险变成效应估计。

---

## 4. WP-D：返回 Codex 的最小实现清单

> 以下为**建议**（DESIGN INTENT），不实现、不自行决定核心 API。标注 UNKNOWN 处需 Codex 决策。

### 4.1 需要 V2 的 public types

| type | V1 现状（FACT） | V2 建议（DESIGN INTENT） |
|---|---|---|
| `VerificationVerdictV2`（新） | 不存在 | `"supported" \| "contradicted" \| "insufficient_evidence"` 枚举 |
| `V6VerificationRequestV1` | 无 response-contract 字段 | 增加 `responseContract: "verdict_json_v2"` 或升版本 request schema ref（UNKNOWN：字段 vs 新 ref 版本，由 Codex 定）|
| `V6VerificationAdapterResultV1` | `{status:"response", publicContent, usage?}` | V2：`{status:"response", verdict, explanation, evidenceScope:"public_only", usage?}`，且**禁止** alternativeOutcome/correctAnswer/recommendedAnswer 字段 |
| 验证 source event payload | `{requestId, requestHash, actionInstanceId, actionRef, complied, publicContent}` | 追加 `verdict`、`explanation`、`evidenceScope`；`publicContent` 保留为 human-readable delivery 文本（UNKNOWN：是否与 verdict 冗余）|
| `verificationAdapterContract` | `{…, retryPolicy:"none"}` | 增加 `responseContract`/`responseSchemaRef` 以驱动 replay 分支与 analysis 分层 |

### 4.2 event payload 如何版本化

- **DESIGN INTENT**：将 `swarmalpha.event.verification-result` 升到 v2.0.0（或新增 `-v2` 事件 id），使旧 v1 source event 与新 v2 可并存、可区分。**raw schema `"5.0"` 不变**（事件 ref 版本与 raw schema 独立）。
- **FACT** 既有 V1 artifact 必须保持可读；不得设计静默升级或回填推断。

### 4.3 replay 如何同时读取 V1/V2

- **DESIGN INTENT**：replay 依 `verificationAdapterContract.responseContract`（或 eventRef version）分支——V1 路径按现有 `publicContent` 绑定；V2 路径额外绑定 `verdict+explanation+evidenceScope`，并对 verdict 合法性、evidenceScope=="public_only"、禁止替代答案字段做 replay 校验。
- **FACT** 验证请求 public-only 已由 requestHash 冻结；V2 只扩展响应契约，不改请求的 evidence scope。

### 4.4 stable issue codes（建议）

`vv2_private_leak`、`vv2_unknown_verdict`、`vv2_missing_verdict`、`vv2_extra_field`、`vv2_substitute_answer`、`vv2_evidence_scope_mismatch`、`vv2_replay_payload_drift`、`vv2_sham_verdict`、`vv2_failure_as_insufficient`、`vv2_insufficient_propagated`。

### 4.5 哪些测试必须从 todo 变通过

`test/v6-verification-verdict-v2.test.ts` 的 16 项 `it.todo` 全部对应 V2 生产实现；V2 落地后逐项 flip。同时 **8 项 V1 风险复现测试需改写**：其当前断言锁定的是 V1 缺陷行为（如"adapter 接受替代答案自由文本"），V2 落地后应反转为"拒绝此类输出"。

### 4.6 是否需要新 actionRef/version

- **FACT** `swarmalpha.action.verification-request` 已是 v2.0.0（`VERIFICATION_REQUEST_V2`，`src/lib/governance/standardEpistemicActions.ts:74-112`）；sham 为 `swarmalpha.action.verification-attention-sham` v2.0.0。
- **DESIGN INTENT**：verdict 契约应挂在**响应契约版本**（responseContract）而非再 bump action version；是否需要新 request schema ref 版本由 Codex 定（UNKNOWN）。

### 4.7 production profile 隔离

- **DESIGN INTENT**：V2 source event（含 verdict）与旧 mechanism-check 结果（仅 publicContent）不得混合进入同一验证统计。建议按 eventRef version + `responseContract` 分层；旧 pilot 结果只作 legacy 可读，不进入 V2 verdict 的 coverage/agreement 统计。
- **FACT** 本文 §5 red-zone 2 的"投递文本无原始输出参照"在 V2 中仍存在，除非 Codex 决定把 provider 原始输出也持久化（UNKNOWN）。

---

## 5. 停止条件 / red-zone 检查

| 停止条件 | 判定 | 证据 |
|---|---|---|
| verifier 实际读到 private information 或 ground truth → 立即停并报 P0 | **未触发** | 请求对象无 private/truth 字段（`productionVerticalSlice.ts:1570-1583`）；prompt 无 hidden 子句（`providerAdapters.ts:169-175`）；artifact 实测无泄漏。 |
| current replay 无法区分 provider 原始输出与投递文本 → 报告 red-zone | **RED-ZONE（报告，不修复）** | 验证路径未持久化 `rawResponse`（`v6InteractionTrace` 无该字段，实测 `contains rawResponse: false`）；replay 只能绑定"投递文本==event==transcript"（`:926-931`），无原始输出参照，自洽重写可通过。final 私有采集另存 rawResponse（`finalOutcome`），证明"持久化原始输出"是既有可行选项。返回 Codex 决策是否在 V2 持久化验证原始输出。 |
| V1/V2 无法在不 bump raw schema 的情况下明确区分 → 返回 Codex | **可区分（需 Codex 确认方案）** | eventRef 版本（v1→v2）+ adapter contract responseContract 可在 raw schema `"5.0"` 不变下分支；raw schema 与事件 ref 版本独立。最终方案由 Codex 定。 |
| 不运行真实/付费 LLM；不读 .env/凭据 | 遵守 | 全程仅确定性 fixture 与静态 artifact 读取。 |
| 不执行 git 写操作 | 遵守 | 未执行 add/commit/reset/checkout/clean。 |

---

## 6. 与指南偏离

- **UNKNOWN** `sham 语义"不调用 verifier"`：当前 V1 sham **确实发起一次 provider 调用**（acknowledgment prompt，内容被丢弃；`providerAdapters.ts:186-203`）。本文将"不调用 verifier"解读为"不进行验证、不产出 verdict、不引入证据"（与 V1 既有 matched-attention 实现一致）。若 Codex 原意是 sham 连 provider 调用都不发，需另行决策（UNKNOWN）。
- 未偏离其余指南。

---

## 7. 精确命令结果

```
git diff --check                                     → exit 0
npx tsc --noEmit                                     → exit 0
npx vitest run test/v6-verification-verdict-v2.test.ts --reporter=verbose --maxWorkers=1
                                                     → 8 passed | 16 todo（todo 不计通过）
npx vitest run test/v6-provider-adapters.test.ts --reporter=dot --maxWorkers=1
                                                     → 12 passed
git status --short
```

---

## 8. 明确声明

未运行任何真实/付费 LLM；未读取凭据或 `.env`；未修改 `src/**`、`experiments/campaign/v6/productionVerticalSlice.ts`、`experiments/campaign/v6/providerAdapters.ts`、schema version、既有实验 artifact、既有测试/配置/文档；未执行任何 git 写操作。新建仅两处：`test/v6-verification-verdict-v2.test.ts` 与本文档。
