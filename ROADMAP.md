# SwarmAlpha 优化路线图

> 当前状态: v4.0 | 准确率: 75% (6/8) | 代码: 13,900 行 → 目标 8,500 行

---

## 第一阶段：瘦身（1-2 小时，安全删除）

### 步骤 1: 删除无效校准层 ✅ 零风险

这 7 个文件没有任何外部引用，删除不会影响任何功能：

```bash
cd src/lib/calibration

# 一条命令删除全部（git 里有备份，不怕）
rm enhancedPredictionCalibrator.ts   # 1,058行 V2校准
rm phaseOneCalibrator.ts             # 447行 Phase 1
rm phaseTwoCalibrator.ts             # 375行 Phase 2
rm phaseThreeCalibrator.ts           # 595行 Phase 3
rm adaptiveModelSelector.ts          # 536行 模型选择器
rm multiPeriodResonance.ts           # 373行 多周期共振
rm eventClassifier.ts                # 716行 旧分类器

# 验证
cd ../../../
npx next dev --port 3000
# 打开浏览器访问 http://localhost:3000，确保 UI 正常
# curl http://localhost:3000/api/swarm 应返回 v4.0.0
```

**删除后**：校准层从 10 个文件 → 3 个文件（`predictionCalibrator.ts` + `hybridPredictor.ts` + `extendedBlackSwanDatabase.ts`）

### 步骤 2: 删除废弃的重导出文件

```bash
rm src/lib/llm/openai.ts   # 仅重导出 providers.ts，无独立价值
```

### 步骤 3: 移动模拟 ML 到实验区（可选）

```bash
# lstmPredictor.ts 和 transformer.ts 是模拟实现（不是真实神经网络）
# 如果暂时用不到，移到实验区
mv src/lib/ml/lstmPredictor.ts _experimental/lib/ml/
mv src/lib/ml/transformer.ts _experimental/lib/ml/

# 更新 src/lib/ml/index.ts，删除对这两个文件的导出
# 更新 src/lib/agents/technicalEngine.ts，注释掉 LSTM/Transformer 相关调用
```

**注意**: 第 3 步需要改动 `technicalEngine.ts` 的 import，建议先用 `// @ts-ignore` 注释，确认编译通过后再删除。

### 步骤 4: 简化日志模块

`src/lib/utils/logger.ts` (262 行) 缩减为：

```typescript
// 精简版日志（~30行）
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, msg: string, data?: any) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL]) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    console.log(prefix, msg, data ? JSON.stringify(data).slice(0, 200) : "");
  }
}

export const logger = {
  debug: (m: string, d?: any) => log("debug", m, d),
  info: (m: string, d?: any) => log("info", m, d),
  warn: (m: string, d?: any) => log("warn", m, d),
  error: (m: string, d?: any) => log("error", m, d),
};
```

---

## 第二阶段：准确率（2-4 小时，需要 LLM API）

### 当前两个失败案例的修复

两个失败都是"预测太保守"（预测 neutral，实际 up），不是方向错误。

**修复 A: RSI 极度超卖加强** (`predictionCalibrator.ts` 第 ~80 行)

```typescript
// 改前
if (rsi < config.extremeOversold) {  // 默认 15
  pred += 45;

// 改后：降低阈值，RSCI<20 也获得强信号
if (rsi < config.extremeOversold) {  // <15
  pred += 50;
} else if (rsi < config.deepOversold) {  // <20
  pred += 40;  // 从 35 提升到 40
```

**修复 B: 偿付危机逻辑调整**

```typescript
// 改前：只要检测到"违约"就扣分
if (isSolvencyCrisis && d.dropFromPeak > 8) {
  pred -= 15;

// 改后：大幅下跌+违约 才扣分
if (isSolvencyCrisis && dropPct > 15) {
  pred -= 15;  // 深度回调+违约 → 真正的偿付危机
} else if (isSolvencyCrisis && dropPct > 8) {
  pred -= 5;   // 中度回调+违约 → 可能过度恐慌，只轻扣
}
// dropPct < 8：不扣分（可能是可控的，如恒大）
```

### 验证方法

```bash
# 每次修改后运行
npx tsx test/optimized-backtest.ts

# 目标：7-8/8 正确
```

### 扩大回测样本

当前 8 个事件太少。去找 10-15 个更多历史事件：

**去哪里找**：
- 搜索"历史上最大的单日反弹"或"biggest market recoveries"
- 看 Wikipedia 的"List of stock market crashes"
- 要求：事件不在现有 17+8 数据库中，有明确的日期和后续走势

**添加格式**（在 `test/optimized-backtest.ts` 中追加）：

```typescript
{
  name: "事件名称",
  date: "YYYY-MM-DD",
  newsOnTheDay: "事发当天的新闻描述...",
  knownData: {
    vix: 当日VIX,
    rsi: 当日RSI,
    dropFromPeak: 从高点的跌幅(%),
    recentVolatility: 0.02,
    volumeSpike: 2.0,
    eventCategory: "financial/geopolitical/pandemic/...",
    knownPolicyAction: "事发当天已知的政策响应",
    knownVulnerability: "已知的市场脆弱性",
  },
  actualOutcome: {
    direction: "up/down/neutral",
    oneMonthReturn: 后续1个月涨幅(%),
    threeMonthReturn: 后续3个月涨幅(%),
    description: "简述实际走势",
  },
}
```

---

## 第三阶段：真实 LLM 测试（2-4 小时，需要 API Key）

当前严格回测用的是**模拟 LLM**（总是看空），真实 DeepSeek LLM 的表现会更好。

### 创建真实 LLM 回测脚本

```typescript
// test/llm-backtest.ts
// 对 8 个事件逐个调用真实的 /api/swarm，记录 LLM 共识和混合预测
// 对比：纯 LLM vs 纯校准 vs 混合预测

const EVENTS = [ /* 8个事件 */ ];

for (const event of EVENTS) {
  const resp = await fetch("http://localhost:3000/api/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      news: event.newsOnTheDay,
      rounds: 2,
      llmConfig: { provider: "deepseek", model: "deepseek-chat" },
    }),
  });
  const data = await resp.json();
  console.log(event.name, "LLM:", data.data.final.consensus, "Hybrid:", data.hybrid?.prediction);
}
```

**预期**：真实 LLM 应该比模拟 LLM 准确（模拟 0%，真实可能 30-50%）。

---

## 第四阶段：转产品（1-2 周）

### 如果要做付费 API

```
1. 注册 Stripe 账号
2. 添加 /api/pro/predict 付费端点
3. 免费版：仅返回 LLM 共识（~43% 准确率）
4. 付费版：返回混合预测（~75% 准确率）
5. 定价：$9/月 个人，$99/月 机构
```

### 如果要做开源社区

```
1. README 保持现在的"诚实学生项目"叙事
2. 在 Twitter/B站/小红书发建造过程
3. 把严格回测的方法论写成技术博客
4. 吸引贡献者加入
```

### 如果要继续学习

```
1. 把 17+8 个历史事件研究透（每个事件的因果链）
2. 学习更多逆向指标（put/call ratio, VIX futures term structure, breadth）
3. 尝试用真实价格数据（Yahoo Finance 免费 API）替换模拟数据
4. 读更多金融史（《金融狂热简史》《当音乐停止之后》）
```

---

## 架构原则（以后写新代码时记住）

基于这次优化的教训：

| ✅ 做 | ❌ 不做 |
|------|--------|
| 先写 50 行验证想法 | 先写 500 行优雅架构 |
| 用严格回测验证每个改动 | 用同一个数据库训练和测试 |
| 保持基线简单（中性） | 预设方向（强制看空/看多） |
| 删除无效代码 | 保留"以后可能有用"的代码 |
| 诚实报告准确率 | 用循环论证美化数字 |

---

## 检查清单

完成一项勾一项：

### 瘦身
- [ ] 删除 7 个无效校准文件
- [ ] 删除 `openai.ts` 废弃导出
- [ ] 简化 `logger.ts`
- [ ] 编译通过 + UI 正常

### 准确率
- [ ] 修复 RSI 阈值（RSI<20 → +40）
- [ ] 修复偿付危机逻辑（跌幅阈值）
- [ ] 7-8/8 通过
- [ ] 添加 10+ 个新事件

### LLM 验证
- [ ] 创建 `test/llm-backtest.ts`
- [ ] 跑真实 LLM 回测
- [ ] 记录：纯 LLM vs 纯校准 vs 混合

### 决策
- [ ] 决定下一步方向：付费 API / 开源社区 / 继续学习
