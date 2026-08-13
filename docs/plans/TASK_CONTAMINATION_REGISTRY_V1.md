# SwarmAlpha Task Contamination Registry v1

日期：2026-08-13
状态：NORMATIVE SPLIT BOUNDARY；登记已观察任务与尚未取得科学准入的候选任务。

## 1. 权威规则

1. 被用于 prompt/parser 开发、真实 pilot、结果审查、阈值观察或机制设计的任务，不得再进入 measurement held-out、detector held-out 或 confirmatory split。
2. “未在本轮实验中使用”不等于“可作 held-out”。候选任务必须先通过 accepted human semantic review，并获得显式 leakage-group identity。
3. 同一 semantic/leakage group 不得跨 measurement development、measurement held-out、detector calibration、detector held-out 或 confirmatory split。
4. 本登记只降低权限，不自动授予权限。任何升级必须产生新 task-bank manifest，且早于相应 provider call。
5. 已读过任务内容的人可以进行 semantic review，但不能以自己的未知性作为 held-out 保证；隔离对象是模型调用、分析选择与 task/leakage group，而不是研究者记忆的虚构清零。

## 2. 当前登记

### 2.1 Engineering canary only

```text
1, 4, 8, 9, 17
```

这些任务已用于开发、smoke 或早期机制检查。权限上限为 engineering canary；禁止进入效度或论文效果样本。

### 2.2 Observed development/calibration only

```text
2, 6, 10, 25, 26, 30, 34, 36, 41, 42,
43, 44, 46, 48, 53, 56, 58, 59, 60, 62
```

这些任务进入了 2026-08-12 的 80-run Verification Verdict V2 探索实验，结果、arm 分布、Brier、置信度和 verdict 已被观察。它们可继续用于：

- 离线 detector census；
- calibration/development；
- debug 与回归测试；
- action information-gain 的假说生成。

它们不得用于：

- measurement held-out；
- detector held-out；
- confirmatory outcome；
- 看过结果后重新挑 threshold，再声称是独立验证。

### 2.3 Unreviewed scientific candidates — no held-out authority

```text
3, 5, 7, 11, 12, 13, 14, 15, 16, 18,
19, 20, 21, 22, 23, 24, 27, 28, 29, 31,
32, 33, 35, 37, 38, 39, 40, 45, 47, 49,
50, 51, 52, 54, 55, 57, 61, 63, 64, 65
```

FACT：这些 task ID 未进入上述 80-run 计划，也不属于列出的 canary 集合。

UNKNOWN：它们是否与已观察任务共享模板、语义结构、rationale family、答案构造或其他 leakage group；当前没有 accepted semantic review manifest。

因此当前权限是 `unreviewed_candidate_only`。不得从本列表直接抽取 held-out 或 confirmatory 样本。

## 3. 下一次准入所需最小证据

每个 scientific entry 至少需要：

- source task identity 与 task-definition hash；
- accepted semantic review identity、reviewer 与时间；
- semantic/leakage group ID；
- task family、K、agent count 与信息分布结构；
- 与所有已有 split 的 leakage-group 不交叉证明；
- 明确角色：measurement development、measurement held-out、detector calibration、detector held-out 或 confirmatory；
- manifest 冻结时间早于首次 provider call。

如果可用的独立 leakage group 少于权威协议要求，应判 `DEFER/INSUFFICIENT`，不得把同组多个 task、多个 Agent 或重复调用当作独立 cluster。

## 4. 目前允许的下一步

- 允许：对 20 个已观察任务做免费、只读 detector census。
- 允许：为 controlled-evidence measurement 新建独立、可生成且带已知 evidence ladder 的 base-task clusters。
- 允许：对未审查候选做人工 semantic/leakage review，但在 manifest 冻结前不得调用 provider。
- 禁止：继续扩大当前 V2 治理效果样本。
- 禁止：把剩余 40 个 task ID 直接当作独立 held-out。
- 禁止：在看过 held-out 结果后调整 threshold、candidate detector 或 leakage group。
