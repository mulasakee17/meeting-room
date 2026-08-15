# Claude Code Handoff: Measurement Runner v1

日期：2026-08-13

## 1. 任务性质

实现一个**实验层最小编排器**，复用 commit `35fc5a3` 中已经冻结的：

- `MeasurementValidityDesignV1`
- `MeasurementValidityFreezeV1`
- `MeasurementValidityResultIndexV1`
- no-replace stores 与 cross-validation

本任务不创造新的测量构念，不改变 Gate，不修改 V6 raw schema，不生成 scientific variants，不运行真实 provider。

## 2. 唯一白名单

允许新建：

1. `experiments/campaign/measurement/measurementValidityRunner.ts`
2. `test/measurement-validity-runner.test.ts`
3. `docs/plans/MEASUREMENT_VALIDITY_RUNNER_V1_IMPLEMENTATION_2026-08-13.md`

允许只读：

- `experiments/campaign/measurement/measurementValidity.ts`
- `experiments/campaign/measurement/measurementValidityAnalysis.ts`
- `test/measurement-validity.test.ts`
- `experiments/campaign/v6/productionVerticalSlice.ts`
- `docs/architecture/MEASUREMENT_VALIDITY_PROTOCOL_V1.md`
- `docs/plans/TASK_CONTAMINATION_REGISTRY_V1.md`
- `docs/REASONING_PROTOCOL.md`

禁止修改其他任何文件。

## 3. 冻结 public boundary

在 `measurementValidityRunner.ts` 中导出：

```ts
export type MeasurementCellExecutionOutcomeV1 =
  | {
      status: "valid";
      instrumentKind: "final_outcome";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      finalOutcomeHash: string;
    }
  | {
      status: "valid";
      instrumentKind: "in_process_explicit";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
      interactionTraceHash: string;
    }
  | {
      status: "invalid_response";
      runId: string;
      taskManifestHash: string;
      rawArtifactHash: string;
    }
  | {
      status: "provider_error" | "timeout" | "unavailable";
      runId: string;
      absentFields: string[];
      reason: string;
    };

export interface MeasurementCellExecutionContextV1 {
  cell: Readonly<MeasurementRegisteredCellV1>;
  design: Readonly<MeasurementValidityDesignV1>;
  freeze: Readonly<MeasurementValidityFreezeV1>;
  firstProviderAt: string;
}

export interface RunMeasurementValidityV1Input {
  outputDir: string;
  design: MeasurementValidityDesignV1;
  freeze: MeasurementValidityFreezeV1;
  taskBankContentHash: string;
  admittedTaskDefinitionHashes: readonly string[];
  resultIndexRef: VersionedGovernanceRef;
  executeCell: (
    context: MeasurementCellExecutionContextV1,
  ) => Promise<MeasurementCellExecutionOutcomeV1>;
  clock?: () => string;
  allowSealedHeldout?: boolean;
  expectedExistingResultIndexContentHash?: string;
}

export interface RunMeasurementValidityV1Result {
  design: Readonly<MeasurementValidityDesignV1>;
  freeze: Readonly<MeasurementValidityFreezeV1>;
  resultIndex: Readonly<MeasurementValidityResultIndexV1>;
  reused: boolean;
  executedCellCount: number;
}

export async function runMeasurementValidityV1(
  input: RunMeasurementValidityV1Input,
): Promise<RunMeasurementValidityV1Result>;
```

若 `VersionedGovernanceRef` 的实际导出位置不同，可从现有权威模块做 type-only import；不要复制定义。

## 4. 必须满足的执行语义

### 4.1 所有 preflight 都早于 `executeCell`

依次完成：

1. `validateMeasurementValidityDesignV1`；
2. `validateMeasurementValidityDesignAgainstAdmissionV1`；
3. `validateMeasurementValidityFreezeV1`；
4. `validateFreezeAgainstDesignV1`；
5. `validateFreezeTaskBankBindingV1`；
6. 默认拒绝 `measurementRole === "sealed_measurement_heldout"`；只有 `allowSealedHeldout === true` 才可继续；
7. 持久化/读取同一 Design；
8. 持久化/读取同一 Freeze；
9. 再次交叉验证 persisted Design/Freeze/task-bank binding。

任一步失败：`executeCell` 调用次数必须为 0。

### 4.2 默认不允许 held-out 开封

错误码/消息包含稳定片段：

```text
sealed_measurement_heldout_requires_explicit_authorization
```

这只是软件防误触，不代表 owner 已经批准未来真实 held-out。

### 4.3 exact retry

若提供 `expectedExistingResultIndexContentHash`：

- 用 `readMeasurementValidityResultIndexV1` 读取该精确 hash；
- 不存在、损坏或 identity/binding 不一致时 fail-closed；
- 存在且通过 `validateResultIndexAgainstFreezeV1` 时直接返回：
  - `reused: true`
  - `executedCellCount: 0`
  - `executeCell` 0 次
- 不得静默执行缺失 cell，也不得基于同 ref 猜测另一个 result index。

### 4.4 首次执行

- 严格按 `freeze.registeredCells` 的冻结顺序执行；
- 每个 cell 调用 `clock()` 得到 runner-owned `firstProviderAt`，然后才调用 `executeCell`；
- `firstProviderAt` 必须严格晚于 `freeze.createdAt`；
- `executeCell` 返回后调用 `clock()` 得到 `terminalAt`；
- 返回 outcome 的 `instrumentKind` 必须与 `design.instrumentKind` 一致；
- outcome 的 `runId` 必须非空且全局唯一；
- outcome 不含 `cellId`、`firstProviderAt` 或 `terminalAt`，这些由 runner 写入，避免调用方替代时序权威；
- `executeCell` 抛出的任何异常直接向上传播，不得自动映射为 `provider_error`，不得 seal ResultIndex；
- provider error/timeout/unavailable 必须由 adapter/executor 显式返回 terminal outcome；
- failure outcome 不得携带任何 source hash；valid/invalid 的必需 hash 由既有 validator fail-closed。

### 4.5 Seal

- 只有全部注册 cell 都返回 terminal outcome 后，才能创建 ResultIndex；
- `sealedAt` 来自 runner clock，且不早于所有 `terminalAt`；
- `registeredCellCount` 必须等于 Freeze；
- 调用：
  - `createMeasurementValidityResultIndexV1`
  - `validateResultIndexAgainstFreezeV1`
  - `validateMeasurementValidityResultIndexAgainstSourcesV1`
- 通过 `loadOrCreateMeasurementValidityResultIndexV1` no-replace 持久化；
- 持久化后再次完成上述验证；
- 返回 `reused:false`、`executedCellCount=registeredCells.length`。

## 5. 时钟规则

- 默认 clock 可用 `new Date().toISOString()`，但测试使用确定性严格递增 clock；
- runner 必须检查 canonical ISO 与严格顺序，不可只依赖下游偶然报错；
- clock 倒退、等于 freeze、terminal 早于 firstProvider、sealed 早于 terminal 均 fail-closed；
- 不引入 sleep、随机 timer 或网络。

## 6. 必需测试

至少覆盖以下 18 项；全部使用临时目录和 mock callback：

1. valid final-outcome 全链：Design/Freeze 先落盘，ResultIndex seal；
2. valid in-process 全链；
3. mixed valid + invalid + provider_error，失败仍占注册分母；
4. callback 顺序严格等于 frozen cell order；
5. persisted Design/Freeze 在 callback 第一次被调用前已经存在；
6. malformed design → callback 0；
7. admission hash 不匹配 → callback 0；
8. freeze/design mismatch → callback 0；
9. task-bank hash mismatch → callback 0；
10. held-out 默认拒绝 → callback 0；
11. held-out 显式授权后可用 mock 执行；
12. callback throw → 不产生 ResultIndex；
13. duplicate runId → 不 seal；
14. wrong instrumentKind → 不 seal；
15. failure outcome 试图附加 source hash（以 hostile cast）→ fail-closed；
16. clock 等于/早于 freeze 或倒退 → fail-closed；
17. exact retry 给出正确 result hash → callback 0，返回 reused；
18. exact retry hash 缺失/错误/跨 freeze → callback 0 且 fail-closed；
19. mutation isolation：callback 修改 context 克隆不污染 persisted Design/Freeze；
20. 结果 index source hash 自洽篡改/意外字段由既有 validator 拒绝。

不要用源码字符串断言代替行为测试；不要测试真实 provider。

## 7. Red-zone / stop conditions

发现以下任一情况，写最小失败测试并停止，不修改 `measurementValidity.ts`：

- 既有 store 无法保证 Design/Freeze 在 callback 前持久化；
- ResultIndex 可以缺失注册 cell 仍 seal；
- exact retry 仍调用 callback；
- callback 异常被吞并或伪装为 terminal provider failure；
- held-out 默认可执行；
- failure cell 能携带伪造 source hash；
- persisted authority 能被 callback mutation 污染；
- 需要修改 raw schema-5 或 V6 core 才能完成本 runner。

## 8. 验收命令

```powershell
git diff --check
npx.cmd tsc --noEmit
npx.cmd vitest run test/measurement-validity.test.ts test/measurement-validity-runner.test.ts --reporter=dot --maxWorkers=1
npm.cmd run build
git status --short
```

禁止全量付费调用；禁止读取/输出 `.env`；禁止 git add/commit/reset/checkout/clean。

## 9. 最终报告

必须报告：

1. 修改文件；
2. public API；
3. 每项测试保护的不变量；
4. 精确命令结果；
5. red-zone 缺陷；
6. 与指南偏离；
7. 明确声明未运行真实/付费 LLM、未读取凭据、未做 git 写操作。
