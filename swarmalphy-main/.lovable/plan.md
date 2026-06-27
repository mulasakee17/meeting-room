# SwarmAlpha Collective Intelligence Lab — 实现计划

## 设计方向

科研实验平台风格(参考 OpenAI Research / Anthropic Console / Bloomberg Terminal 极简版)。深色单页纵向滚动布局,全部 10 区块默认展开。

**视觉令牌** (写入 `src/styles.css`):
- 背景 `#050505`,卡片 `#111111`,边框 `rgba(255,255,255,0.08)`
- 强调色:Bullish=emerald-400 `#34d399`,Bearish=red-400 `#f87171`,Neutral=zinc-400
- 指标色:Consensus=blue-400,Polarization=orange-400,Fragility=purple-400
- 字体:`Inter` (UI) + `JetBrains Mono` (数字/代码),通过 `<link>` 在 `__root.tsx` 注入
- 圆角 16px,细 1px 边框,微 backdrop-blur,无重阴影

## 页面结构(单页纵向,`src/routes/index.tsx`)

```
Header  →  ExperimentConsole  →  LiveDashboard  →  FactorAnalysis
  →  AgentSocietyNetwork  →  ExplainableTimeline  →  ConsensusEvolution
  →  CounterfactualLab  →  Diagnostics  →  Replay
```

## 组件清单 (`src/components/swarm/`)

| 组件 | 关键库 | 数据来源 |
|---|---|---|
| `Header.tsx` | lucide | LLM/Model 选择,Run/History/Export 按钮 |
| `ExperimentConsole.tsx` | shadcn Switch/Input/Select | 新闻输入 + rounds + 6 个消融 Toggle + 共识方法下拉 |
| `LiveDashboard.tsx` | framer-motion | 3 个环形仪表盘 (SVG) + DirectionBadge + 状态解读 |
| `RingGauge.tsx` | SVG + motion (count-up) | 通用环形指标 |
| `FactorAnalysis.tsx` | shadcn Card | 5 张因子卡片,可展开 evidence |
| `AgentSocietyNetwork.tsx` | **@xyflow/react** | 节点=Agent,大小=influence,颜色=belief,边=trust,Drawer 详情 |
| `AgentDrawer.tsx` | shadcn Sheet | 点击节点显示完整信息 |
| `ExplainableTimeline.tsx` | shadcn Collapsible | 每个 Agent 纵向时间线 (Round1→Final) |
| `ConsensusEvolution.tsx` | **recharts** LineChart | Consensus / BeliefStd / Kuramoto r |
| `CounterfactualLab.tsx` | Card grid | variants[] 卡片 + impact 颜色 |
| `Diagnostics.tsx` | Card×4 | Attribution / Coalition / Risk / Summary,用 mini 图表+Badge |
| `Replay.tsx` | Slider + motion | 时间轴回放整套状态 |

## 数据与状态

- **类型定义** `src/lib/swarm/types.ts` — 完整复刻 API_CONTRACT 的接口
- **Mock 实现** `src/lib/swarm/mock.ts` — `runSwarmExperiment(req): Promise<SwarmResponse>`,基于新闻文本和参数生成确定性但有变化的数据(因子值用 hash,Agent belief 随轮次扩散收敛),包含 9 个 Agent (institution/value/trend/panic/quant/media/contrarian/retail/policy)
- **状态管理** Zustand store `src/lib/swarm/store.ts`:`currentResult`, `loading`, `selectedAgentId`, `replayRound`, `history[]`(持久化到 localStorage)
- **API 客户端** `src/lib/swarm/client.ts` — 现在调用 mock,留好真接口切换位置

## 历史 / 导出

- localStorage key `swarm.history`,保存最近 50 次实验 (request + summary)
- Header History → Sheet 显示列表点击恢复
- Export Report → 下载当前 result 为 JSON

## 依赖

```
bun add @xyflow/react recharts framer-motion zustand
```

## 文件清单

新建:
- `src/lib/swarm/{types.ts, mock.ts, client.ts, store.ts, colors.ts}`
- `src/components/swarm/*.tsx` (上表 12 个)
- 改写 `src/routes/index.tsx` 组装所有区块
- 改 `src/styles.css` 加入设计令牌
- 改 `src/routes/__root.tsx` 注入 Inter + JetBrains Mono `<link>` 与 meta

## 范围与取舍

- LLM 不真调用,Run 按钮触发 mock(模拟 800-1500ms 延迟,带流式 toast)
- React Flow 用自动 force-like 初始布局 + 拖拽缩放
- Replay 通过驱动 store.replayRound 让 Network/Evolution/Timeline 同步动画
- 所有区块默认展开,无 Tab
- 不接入 Cloud,纯前端

完成后效果应明显呈现"AI 社会实验平台"而非金融工具。
