# Measurement Validity Runner v1：实现状态

日期：2026-08-13
状态：IMPLEMENTED + deterministic-tested；真实 provider development pilot 尚未运行

## 1. 实现

新增：

- `experiments/campaign/measurement/measurementValidityRunner.ts`
- `test/measurement-validity-runner.test.ts`

runner 复用既有 `MeasurementValidityDesignV1`、`MeasurementValidityFreezeV1`、`MeasurementValidityResultIndexV1` 和 no-replace stores；未修改 raw schema-5、V6 production slice 或测量 Gate。

public entry：

```ts
runMeasurementValidityV1(input): Promise<RunMeasurementValidityV1Result>
```

## 2. 已保护的不变量

- design/admission/freeze/task-bank/held-out preflight 全部早于 `executeCell`；
- Design 与 Freeze 在第一个 callback 前 no-replace 持久化并再次交叉验证；
- `sealed_measurement_heldout` 默认稳定拒绝，只能显式授权 mock/未来 owner-approved 执行；
- cell 严格按冻结顺序执行；runner 自己拥有 `firstProviderAt`、`terminalAt` 和 `sealedAt`；
- custom clock 不规范、倒退或不前进时 fail-closed；
- callback 异常向上传播，不伪装为 provider terminal status，不封存 ResultIndex；
- valid / invalid / provider_error / timeout / unavailable 均保留在注册分母；
- instrument kind、非空/唯一 runId 和 status-specific source fields fail-closed；
- executor 自报 hash 不被当作实际 source replay；`readCellSourceHashes` 从持久化 artifact 独立读取，首次 seal 与 exact retry 均须跨检；
- hostile failure source hash 由 exact-key validator 拒绝；
- 全部 cell terminal 后才可创建、交叉重放并 no-replace 持久化 ResultIndex；
- exact retry 必须指明已存在的精确 ResultIndex contentHash，成功时 callback 零调用；缺失/错误/跨 freeze 均 fail-closed；
- callback 获得的是克隆 context，不能污染已持久化 authority。

## 3. 明确边界

### 3.1 不提供跨进程 cell-level resume

runner 在 ResultIndex seal 前不持久化单 cell completion journal。若进程在若干 provider calls 后崩溃，只剩 Design/Freeze 无法证明究竟执行了哪些 cell。

因此：

- Design/Freeze 存在不等于 provider call 已发生，也不等于未发生；
- 无精确 ResultIndex hash 时不得把再次执行称为 `exact retry`；
- 真实 pilot 的上层 launcher 必须使用唯一 study/output identity、保留调用日志，并在部分态后 fail-closed；
- 部分态若需重跑，必须由 owner/Codex 明确建立新 execution identity，旧目录保留审计，不做自动补 cell；
- v1 不为解决这一点增加 per-cell WAL、resume state machine 或 raw schema 变更。

### 3.2 软件授权不等于研究批准

`allowSealedHeldout: true` 只解除软件防误触；它不证明 task split、owner authorization、preregistration 或外部事前承诺已经满足。真实 sealed held-out 仍需单独批准。

### 3.3 完整性不等于外部真实性

no-replace 和 hash/replay 证明仓库内对象绑定与重算一致，不提供可信时间戳、签名、防伪造或现实世界 truth 保证。

## 4. 验证

截至 2026-08-13：

- `npx.cmd tsc --noEmit`：通过；
- `test/measurement-validity.test.ts` + `test/measurement-validity-runner.test.ts`：2 files / 81 passed；
- 未运行真实/付费 LLM；
- 未读取凭据；
- 未运行 sealed held-out。

## 5. 下一步

下一步不是修改 runner，而是建立一个**development-only adapter/plan**：冻结少量 measurement development cells，把现有 V6 single-attempt provider boundary 映射为 `MeasurementCellExecutionOutcomeV1`，先执行 `--plan`/mock smoke，再由 owner 授权小规模真实 development pilot。
