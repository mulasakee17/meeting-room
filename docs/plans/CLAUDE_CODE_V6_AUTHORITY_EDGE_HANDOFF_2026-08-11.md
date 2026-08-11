# Claude Code 执行指南：V6 权威边界的边缘验证与事实同步

日期：2026-08-11

任务性质：低风险、机械性、可独立验收

预算上限：USD 2.00

前提：Codex 已完成任务清单、监测设计、校准数据准入和分析入口的核心语义；本指南不得重新设计这些语义。

## 可直接粘贴给 Claude Code 的提示词

你正在 SwarmAlpha 仓库中执行一个严格白名单任务。先阅读 `AGENTS.md` 与 `docs/REASONING_PROTOCOL.md`，然后只读取下列核心文件作为事实来源：

- `experiments/campaign/v6/v6TaskManifest.ts`
- `experiments/campaign/v6/monitoringDesign.ts`
- `experiments/campaign/v6/verifiedCalibrationDataset.ts`
- `experiments/campaign/v6/analyzeV6Calibration.ts`
- `experiments/campaign/v6/productionVerticalSlice.ts`
- `experiments/campaign/v6/v6BinarySmokeFixture.ts`
- `test/v6-authority-boundaries.test.ts`

你可以写入的文件仅限：

- `test/v6-authority-boundaries.test.ts`
- 新建 `test/v6-authority-adversarial.test.ts`（仅在现有文件过长时）
- 新建 `docs/architecture/V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1.md`
- 本文件 `docs/plans/CLAUDE_CODE_V6_AUTHORITY_EDGE_HANDOFF_2026-08-11.md`（仅附加最终执行报告，不重写任务要求）

禁止修改任何 `src/**`、任何 `experiments/campaign/v6/*.ts` 生产文件、schema 常量、配置、manifest、生成数据、既有实验输出、package.json 或其他测试。禁止运行 `--execute`、真实 provider 或付费 LLM。禁止读取或输出 `.env*`、密钥、token。禁止 git add/commit/reset/checkout/clean。

### 工作包 A：对抗测试

只根据现有 public boundary 补测试，不修改核心实现，不为了全绿弱化断言。

1. `V6TaskManifestV1`
   - 重复/空 agent ID、roster 重排、private information 漂移、public context 漂移、claim 漂移、resolution 漂移均 fail-closed；
   - ground-truth commitment 只能证明与预先承诺内容一致，测试不得将其描述为 hiding、encryption 或外部防篡改；
   - 非 canonical 时间戳、错误 content hash、错误 monitoring design ref/hash、跨 run/study/task opening 拒绝；
   - store 的 no-replace、路径净化、读取隔离、损坏 JSON 拒绝；不得声称磁盘事务或外部真实性。

2. `V6MonitoringDesignV1`
   - candidate IDs 输入顺序不影响选择；重复/空 ID 拒绝；不同 run/seed 的承诺变化；
   - 空总体必须得到显式 `empty_population`，不得发明 target、改用最终报告或 silently skip；
   - selection 的 candidate set、draw、selected ID、probability、时间、content hash 任一篡改均拒绝；
   - lineage 仅统计已验证且来源为 tool/dataset/external 的独立 lineage；agent 自报不计，多条证据共享 lineage 只计一次，未出现在 report 的 evidence 不计；
   - 测试不得把当前 `verifiedIndependentLineageCount = 0` 解释为“无独立证据”，只能解释为“当前生产切片未提供合格的预干预验证记录”。

3. `VerifiedV6CalibrationArtifactV1`
   - 非 schema-5、错误 study/rule registry、未允许的 taskDefinitionHash、重复 runId（含跨目录）、损坏 JSON、缺失 usage/latency 一律拒绝；
   - task manifest → operational analysis unit → Stage-1 assignment 的时序顺序不可逆；
   - assigned protocol、trace protocol、primary arm binding 必须一致；
   - unresolved/invalid task outcome 必须保留在分母和状态计数中，不得静默过滤；accuracy 只在 scored 子集有定义，Brier primary metric 仍须有限；
   - bare raw JSON 不得直接进入 `analyzeVerifiedV6Run`，description table 必须标为 descriptive calibration contrast；
   - 旧 V6 artifact 没有 task manifest/monitoring design 时应被新校准准入层拒绝，但不得修改或删除旧 artifact。

4. 精确重试
   - 已存在 artifact 时，task outcome/public/private/claim/monitoring design 任一漂移必须在 provider 调用前拒绝；
   - exact retry 必须零新增 provider call；
   - task-manifest-only、analysis-unit-only、assignment-only 等 partial state 必须 fail-closed。

如任一测试揭示生产核心确有缺陷：停止，不修改生产代码；给出最小复现、期望不变量、实际行为和建议修复位置，返回 Codex。

### 工作包 B：事实同步文档

新建 `docs/architecture/V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1.md`，只写能够由代码或测试支持的事实，并按 FACT / DESIGN INTENT / LIMITATION 区分。至少说明：

- task manifest 冻结 public/private/claim/resolution/truth integrity commitment，发生在 analysis unit 与 Stage-1 assignment 之前；
- commitment 是内部完整性绑定，不提供 confidentiality、external timestamp 或 tamper-proof；
- monitoring population 是 round-1、primary-claim、architecture-recorded belief reports；selection 是 diagnosis 前、canonical IDs 上的 seeded uniform one；
- 当前生产没有预干预 evidence verification adapter，因此 verified lineage measurement 可能为 0；0 是缺失合格验证记录，不是观测到“没有来源”；
- verified calibration loader 是分析准入门；旧 artifact 不自动升级；
- operational Brier 是 primary measurement，task accuracy 是 secondary 且可能 unresolved；
- 当前证据只支持 kernel/vertical-slice/replay-clean calibration readiness，不支持治理有效、因果效果成立、构念效度已证实、confirmatory-ready 或 AAMAS-ready。

不得更新 README、论文主张或总计划，不得发明实验数字。

### 工作包 C：旧 CLI 子进程失败只读分诊

当前已知事实：全量测试为 `1274 passed / 3 skipped / 7 failed`；7 个失败全部位于 `test/governance-estimator-replay.test.ts` 的 `verify_replay CLI exit codes (subprocess)`，stderr 为 Node 24.15.0 在 `tsx` temporary-directory 模块调用 `os.userInfo()` 时返回 `uv_os_get_passwd ENOMEM`。该文件单独运行仍复现。

只做只读/临时目录分诊：记录 Node/npm/tsx 版本，验证直接 Node/tsx 最小调用是否复现，判断是机器资源、Node 24/tsx 兼容、环境变量或测试启动方式问题。不得改测试语义、不得跳过这 7 个测试、不得把环境错误伪装为通过、不得修改业务代码。若需要代码修复，先只提交建议与最小复现给 Codex。

### 验收命令

依次运行，禁止并行运行 `next build` 与 `tsc`：

1. `git diff --check`
2. `npm.cmd exec -- tsc --noEmit`
3. `npm.cmd exec -- vitest run test/v6-authority-boundaries.test.ts test/v6-authority-adversarial.test.ts test/production-vertical-slice.test.ts test/v6-smoke-cli.test.ts test/v6-task-adapter.test.ts test/v6-calibration.test.ts test/v6-calibration-matrix.test.ts --reporter=dot`（若未新建 adversarial 文件，移除该参数）
4. `npm.cmd exec -- vitest run --reporter=dot`
5. `npm.cmd run build`

最终报告必须列出：修改文件、每个新增测试保护的不变量、精确测试数量、全部命令结果、任何 red-zone 缺陷、与指南偏离、CLI 环境问题结论，以及“未运行真实/付费 LLM、未读取凭据、未执行 git 写操作”的明确声明。

## Codex 验收边界

Claude 的产出只可增加对抗覆盖、同步事实或报告环境问题。任何 public type、hash/identity、时序、随机化、准入、指标定义、缺失值处理或因果解释变化，均必须退回 Codex 决策与实现。

---

## Claude Code 最终执行报告（2026-08-11，附加）

### 修改文件

- **新建** `test/v6-authority-adversarial.test.ts`（15 项对抗测试）。既有 `test/v6-authority-boundaries.test.ts` 为 242 行，指南允许独立新建 adversarial 文件，故未在其上追加。
- **新建** `docs/architecture/V6_TASK_MONITORING_CALIBRATION_AUTHORITY_V1.md`（事实同步文档）。
- 未修改任何 `src/**`、`experiments/campaign/v6/*.ts` 生产文件、schema、配置、manifest、生成数据、既有输出、package.json 或其他测试。

### 每个新测试保护的不变量

`test/v6-authority-adversarial.test.ts`：

1. 重复/空 agent ID → manifest fail-closed（`unique agent roster` / `agentId`）。
2. roster 重排、public-context 漂移、claim 漂移 → opening fail-closed；resolution resolver 与 claim 不一致 → 创建拒绝。
3. ground-truth commitment 是 `integrity_only_not_hiding`、确定性、只对承诺 outcome 打开；测试不将其描述为 hiding/encryption/tamper-proof。
4. 非 canonical 时间戳、错误 contentHash、非 canonical monitoringDesignHash → 拒绝。
5. manifest store no-replace（冲突 manifest 不覆盖已发布）、read 隔离（缺失→null）、路径净化（hostile runId 不出目录）。
6. 损坏 JSON / 磁盘上 hash 篡改文件 → 读取拒绝。
7. monitoring candidate 重复/空 ID → 拒绝。
8. monitoring commitment 随 run/seed 变化；selection 的派生字段（selectedReportId/randomDraw/selectionProbability）篡改含自洽重算 → replay 拒绝。
9. lineage：未引用 evidence 不计、共享 lineage 去重、agent 自报不计、空验证记录计 0（标注为"缺失合格验证记录"而非"无来源"）。
10. 准入：非 schema-5、错误 study registry、taskDefinitionHash 不在 allowlist、bare raw JSON 进入分析 → 拒绝。
11. 准入：monitoringDesignHash 分歧、预分配时序违反（均含自洽重算 contentHash）→ 拒绝。
12. 准入：assigned/trace protocol 不一致（含 trace 自洽重算）→ 拒绝。
13. 准入：无 task manifest 的 legacy artifact → 拒绝，且磁盘文件不被修改/删除。
14. exact retry：public-context、monitoring-design 漂移 → provider 调用前拒绝，零新增调用。
15. manifest-only 部分态 → `incomplete_v6_run_requires_fresh_run_id` fail-closed，零调用。

### 命令结果

1. `git diff --check` → 通过（仅 CRLF 提示）。
2. `npm.cmd exec -- tsc --noEmit` → 通过。
3. 白名单 vitest（7 文件）→ **55 passed**。
4. 全量 vitest → **68 files / 1296 passed / 3 skipped / 0 failed**。
5. `npm.cmd run build` → exit 0。

### Red-zone 缺陷

无。未发现要求停止并返回的生产核心缺陷，未修改任何生产代码。

### 与指南偏离

- 采用指南允许的"新建 `test/v6-authority-adversarial.test.ts`"分支（既有文件 242 行，判定为过长）。
- monitoring selection 的 `selectedAt` 语义观察：`selectedAt` 是**输入字段**（同 committedAt/computedAt），自洽重算时间戳会被 replay 接受；只有派生字段（selectedReportId/randomDraw/selectionProbability/seedCommitment/status）被 replay 固定。指南"时间篡改均拒绝"对**非自洽重算**成立（contentHash 不匹配），自洽重算时间戳是否应拒绝属设计语义，**退回 Codex 决策**。

### CLI 环境问题结论（工作包 C）

- 版本：Node v24.15.0 / npm 11.12.1 / tsx v4.23.1。
- 7 个 `verify_replay CLI exit codes (subprocess)` 失败（`uv_os_get_passwd ENOMEM`）**在当前环境下无法复现**：该文件单独运行 69/69 通过；全量套件 1296/1296 通过（0 失败）。
- 最小复现：`os.userInfo()` 在 plain node、tsx、临时目录 tsx 下均正常返回（uid=-1, username=贺孟元）。
- 判定：**机器资源性间歇错误**——Node 24 的 `uv_os_get_passwd`（getpwuid）在并发子进程 + 内存压力下可能返回 ENOMEM；不是测试逻辑或业务代码缺陷。建议：若复现，重跑或以 `--pool=threads --poolOptions.threads.maxThreads=<N>` 降低并发；若持续复现再深入 Node24/Windows 的 getpwuid 内存行为。
- 未修改测试语义、未跳过这 7 个测试、未将环境错误伪装为通过。

### 声明

未运行真实/付费 LLM、未读取或输出凭据、未执行 git 写操作（未 add/commit/reset/checkout/clean）。
