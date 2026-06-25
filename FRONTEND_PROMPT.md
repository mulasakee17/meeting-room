你是顶级前端工程师。为我重写整个 SwarmAlpha 前端。

---

## 项目背景

SwarmAlpha 是一个"金融群体智能实验平台"。用户输入一条金融新闻，9个AI Agent各自从不同信息视角解读，然后通过社交互动形成（或不形成）市场共识。

**后端已完全就绪。你的任务只做前端——页面、组件、动画、交互。零后端改动。**

---

## 技术栈

- Next.js 14 App Router
- TypeScript 5.5 严格模式
- Tailwind CSS 3.4（已配置暗色主题，背景色 `#0a0a0a`）
- Chart.js 4 + react-chartjs-2（已安装，可直接 import）
- 可额外安装 framer-motion（`npm install framer-motion`）做动画

---

## API 契约

一个 POST 端点。请求和响应的完整类型定义见项目根目录的 `API_CONTRACT.md`。关键信息：

### 请求

```typescript
POST /api/swarm
Content-Type: application/json

{
  version: "v9",
  news: string,                                      // 新闻文本, 1-5000字符
  rounds: 2,                                         // 建议固定2轮, 响应更快
  llmConfig: { provider: "deepseek", model: "deepseek-chat" }
}
```

### 响应（核心字段，完整见 API_CONTRACT.md）

```typescript
{
  success: true,
  version: "v9.5",
  data: {
    news: string,

    // ── 5个正交因子 ──
    factorVector: {
      factors: Array<{
        category: "liquidity" | "policy" | "fundamental" | "narrative" | "uncertainty";
        value: number;                   // -100~+100 (uncertainty: 0~100)
        confidence: number;              // 0-100
        evidence: string;
      }>;
    },

    // ── 共识轮次 ──
    rounds: Array<{
      round: number;
      consensus: number;                 // -100~+100
      direction: "UP" | "DOWN" | "NEUTRAL";
      confidence: number;                // 0-95
      beliefStd: number;
      agents: Record<string, {           // key = "institution" | "value" | ...
        belief: number;
        confidence: number;
        visibleFactors: string[];
        interpretation: string;
      }>;
    }>;

    // ── 最终决策 ──
    final: {
      consensus: number;
      direction: "UP" | "DOWN" | "NEUTRAL";
      confidence: number;
      beliefStd: number;
    };

    // ── 群体行为诊断 ──
    diagnostics: {
      attribution: Array<{              // 每个Agent的边际贡献
        agentId: string;
        agentName: string;
        emoji: string;
        belief: number;
        confidence: number;
        influenceWeight: number;
        contribution: number;
        contributionPct: number;        // 0-100
        direction: "BULLISH" | "BEARISH" | "NEUTRAL";
      }>;
      coalition: {
        bullishCoalition: { agentIds: string[]; totalInfluence: number; weightedBelief: number };
        bearishCoalition: { /* 同上 */ };
        neutralAgents: string[];
        powerRatio: number;             // 多头/空头影响力比
        dominantCoalition: "BULLISH" | "BEARISH" | "BALANCED";
        tension: number;                // 0-100 对抗强度
        swingAgents: string[];
      };
      counterfactuals: {
        baselineConsensus: number;
        mostInfluentialAgent: string;
        agentsToFlip: number;           // 需要移除几个Agent才能翻转方向
        variants: Array<{
          label: string;                // 如 "移除Panic"
          description: string;
          modifiedAgentId?: string;
          disableBlindness?: boolean;
          consensus: number;
          direction: string;
          deltaConsensus: number;       // 共识变化量
          directionFlipped: boolean;    // 方向是否翻转
          impact: "CRITICAL" | "SIGNIFICANT" | "MODERATE" | "MINIMAL";
        }>;
      };
      summary: {
        coreFinding: string;
        consensusMechanism: string;
        riskFactors: string[];
        blindnessEffect: string;
      };
    };

    // ── v9.5 扩展 (核心展示数据) ──
    v9_5: {
      interaction: {                     // Agent社交互动过程, 可能为null
        totalRounds: number;
        convergenceType: "converged" | "diverged" | "max_rounds";
        rounds: Array<{
          round: number;
          beliefs: Record<string, number>;
          beliefChanges: Record<string, number>;
          meanBelief: number;
          beliefStd: number;
          converged: boolean;
        }>;
        beliefShift: Record<string, number>;
        consensusFormed: boolean;
        polarizationIncreased: boolean;
        socialProfiles: Array<{
          agentId: string;
          alpha: number;                 // 社交开放度 -1~1
          visibleAgentIds: string[];
        }>;
      } | null;

      metrics: {                         // ★★★ 三个核心指标
        consensusScore: number;          // 共识强度 0-100
        polarizationScore: number;       // 极化程度 0-100
        fragilityScore: number;          // 共识脆弱性 0-100
        stateLabel: string;              // 状态标签 (含emoji)
        stateInterpretation: string;     // 状态解读文本
      };

      comparison?: {                     // 互动前后对比
        consensusShift: number;
        stdChange: number;               // <-5=收敛, >+5=极化
        effect: "convergence" | "polarization" | "minimal";
        description: string;
      } | null;

      timeline?: Array<{                 // 连续推演3天数据
        sequenceIndex: number;           // 0|1|2
        news: string;
        consensusScore: number;
        polarizationScore: number;
        fragilityScore: number;
        consensus: number;
        direction: string;
        beliefStd: number;
      }> | null;
    };

    // ── Agent 元信息 ──
    v9_5Agents: Array<{
      id: string;                        // "institution" | "value" | "trend" | "panic" | "quant" | "media" | "contrarian" | "retail" | "policy"
      name: string;                      // "Institution" | "Value" | ...
      emoji: string;                     // "🏦" | "💎" | "🏄" | "😱" | "🤖" | "📡" | "🦉" | "🐜" | "🏛️"
      role: string;                      // 中文角色名
    }>;
  }
}
```

### 颜色编码规则

Agent 信念值 → 颜色:

| belief 范围 | 颜色 | Tailwind |
|------------|------|----------|
| > +15 | 绿色 | `text-emerald-400` / `bg-emerald-500` |
| < -15 | 红色 | `text-red-400` / `bg-red-500` |
| -15 ~ +15 | 灰色 | `text-zinc-400` |

三指标颜色分段:

| 指标 | 低段 (0-30) | 中段 (30-60) | 高段 (60-100) |
|------|-----------|------------|-------------|
| Consensus | `#ef4444` 红 | `#f59e0b` 黄 | `#34d399` 绿 |
| Polarization | `#34d399` 绿 | `#f59e0b` 黄 | `#f87171` 红 |
| Fragility | `#34d399` 绿 | `#f59e0b` 黄 | `#ef4444` 红 |

---

## 页面要求

### 整体风格

- 暗色科幻/数据实验室风格。参考：彭博终端 + SpaceX 控制面板。
- 背景 `#0a0a0a`，卡片用半透明玻璃质感（`bg-white/5 backdrop-blur border-white/10`）。
- 配色：emerald（多头）、red（空头）、amber（警告）、cyan（数据高亮）。
- 大量使用 framer-motion 做入场动画和数值跳动。
- **移动端也要好看**（评委可能用 iPad 看）。

### 完整布局

```
┌──────────────────────────────────────────────────────────────────┐
│  🐜 SwarmAlpha                                                  │
│  Financial Collective Intelligence Laboratory                    │
│  [DeepSeek ▼]                                    [📋 历史记录]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [📉 2008雷曼] [🦠 2020新冠] [📈 2022加息] [💥 2024日股]        │  ← 预置事件 chips
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 输入金融新闻或选择上方预置事件...                    [→]   │  │  ← 输入框+发送
│  └───────────────────────────────────────────────────────────┘  │
│  [🚀 开始推演]                          [📈 连续推演3天]        │  │
│                                                                   │
│  ═════════════════════ 加载状态 ═════════════════════            │
│                                                                   │
│  🧬 提取正交因子...        ✓ 完成 (0.8s)                         │
│  🎭 Agent 解读因子...      → 进行中                               │
│  🔗 Agent 社交互动...      ○ 等待                                 │
│  📊 计算共识度量...        ○ 等待                                 │
│                                                                   │
│  ═════════════════════ 结果展示 ═════════════════════            │
│                                                                   │
│  ╔══════════════════════════════════════════════════════════╗    │
│  ║  🔴 两极对抗                                            ║    │  ← 状态横幅
│  ║  Agent群体分裂为两个势均力敌的对立阵营...                ║    │
│  ╚══════════════════════════════════════════════════════════╝    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   🤝  48     │  │   ⚡  78     │  │  🏗️  65     │          │  ← 三个环形仪表
│  │  Consensus   │  │ Polarization │  │  Fragility   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  📈 连续推演趋势 (timeline 数据存在时显示)               │    │  ← Chart.js 折线
│  │  三条线: 蓝=Consensus  橙=Polarization  红=Fragility     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🎭 Agent 信念分布                                     │    │
│  │                                                         │    │
│  │  😱 Panic  ████████████████████░░░░  -104  →  -80  +24 │    │  ← 互动前后对比
│  │  💎 Value  ██████████████████░░░░░░  -102  →  -97   +5 │    │
│  │  🐜 Retail ░░░░░░░░░░░░████████████  +104  →  +90  -14 │    │
│  │  ...                                                    │    │
│  │                                        [▶ 查看演化过程] │    │  ← 可展开动画
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🧪 反事实实验室                                        │    │
│  │                                                         │    │
│  │  ☐ 移除 😱 Panic         →  共识翻转!  Δ+20.5  🔴 CRIT  │    │  ← 可交互 toggle
│  │  ☐ 移除 🦉 Contrarian    →  显著改变   Δ+10.3  🟡 SIGN  │    │
│  │  ☐ 移除 💎 Value         →  适度改变   Δ+5.9   🟢 MOD   │    │
│  │  ☐ 关闭信息盲区          →  共识偏移   Δ+13.0  🟡 SIGN  │    │
│  │                                                         │    │
│  │  💡 系统韧性: 仅需移除 2 个Agent即可翻转共识方向         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  🔗 Agent 社交网络    │  │  📋 诊断摘要                 │    │  ← 并排
│  │                      │  │                              │    │
│  │  🏦 α=0.15 可见5人   │  │  共识1.6，方向模糊。        │    │
│  │  💎 α=0.05 可见2人   │  │  Agent信念高度分散(std=85)   │    │
│  │  🏄 α=0.50 可见3人   │  │                              │    │
│  │  😱 α=0.70 可见3人   │  │  ⚠️ 多空对抗强度=100         │    │
│  │  ...                 │  │  🔴 系统韧性低: 1人可翻转    │    │
│  │                      │  │  🟡 信息盲区效应显著         │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  📊 因子详情 (可折叠)                          [展开 ▼] │    │
│  │  Liquidity: -90  Policy: +80  Fundamental: -85  ...     │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 必须实现的组件

### 1. PresetEvents — 预置事件按钮

4个 chips/tags，点击后自动填入输入框并触发推演。

```typescript
const PRESETS = [
  {
    label: "📉 2008 雷曼",
    news: "2008年9月15日，雷曼兄弟申请破产保护——美国史上最大破产案。美国政府拒绝救助雷曼。美林被迫以500亿出售给美银。AIG次日被接管。全球信贷市场冻结。道琼斯单日暴跌504点。"
  },
  {
    label: "🦠 2020 新冠",
    news: "2020年3月，新冠疫情全球爆发，美股10天4次熔断，VIX飙升至82，全球供应链断裂，多国封锁。美联储紧急降息至零并推出无限量QE。国会通过2万亿CARES法案。"
  },
  {
    label: "📈 2022 加息",
    news: "2022年，美联储为应对40年来最高通胀，连续四次加息75个基点。科技股暴跌，纳斯达克进入熊市，全球资本回流美元资产。市场担忧美联储过度紧缩将引发经济衰退。"
  },
  {
    label: "💥 2024 日股",
    news: "2024年8月，日本央行意外加息，日元套息交易大规模平仓，日经225单日暴跌12.4%，全球股市恐慌性抛售，VIX飙升至65。市场担忧系统性风险蔓延。"
  },
];
```

### 2. LoadingSteps — 加载步骤动画

4步进度，用 `setTimeout` 模拟推进（间隔 `[800, 100, 50, 50]` ms），每步有3种状态：`pending | active | done`。

```
🧬 提取正交因子...        ✓ 完成    ← 绿勾
🎭 Agent 解读因子...      → 进行中  ← 脉冲动画
🔗 Agent 社交互动...      ○ 等待    ← 半透明
📊 计算共识度量...        ○ 等待
```

### 3. GaugeRing — 环形仪表盘

SVG 圆环组件。props: `{ score: number; label: string; icon: string; segments: Array<{ max: number; color: string }> }`。

- 整圆背景轨道分段着色
- 活动弧从0动画到 `score` 值（framer-motion `animate`）
- 中心显示大号数字+图标
- 下方显示标签文字

3个实例：Consensus（🤝）、Polarization（⚡）、Fragility（🏗️）。

### 4. StateBanner — 状态横幅

props: `{ label: string; interpretation: string }`。

根据 `label` 前缀选择背景渐变：
- 🟢 → emerald 渐变
- 🔴 → red 渐变
- 🟡 → amber 渐变
- 其他 → zinc

大号 emoji 标签 + 一段解释文字。入场时有从上方滑入的动画。

### 5. AgentBeliefBar — Agent 信念水平条

props: `{ agents: V9_5AgentInfo[]; before: Record<string,number>; after: Record<string,number> }`。

每条：
- 水平轨道（中间=0，左边=-100，右边=+100）
- 互动前的信念 → 半透明条
- 互动后的信念 → 实色条（绿色/红色根据方向）
- 两者之间有小箭头指示变化方向
- 按 `after` 信念值降序排列
- 右侧显示数字：`+104 → +90  (-14)`

### 6. CounterfactualLab — 反事实实验室

props: `{ variants: diagnostics.counterfactuals.variants; agentsToFlip: number }`。

- Checkbox 列表
- 每行：☐ + label + 结果预览（Δ值 + 影响等级）
- 默认全不勾选（显示基线）
- 勾选一个显示该变体的共识变化
- 底部显示 `agentsToFlip` 的系统韧性总结
- impact 颜色：CRITICAL=red, SIGNIFICANT=amber, MODERATE=zinc, MINIMAL=gray

### 7. SocialNetworkPanel — Agent 社交网络

props: `{ profiles: v9_5.interaction.socialProfiles; agents: V9_5AgentInfo[] }`。

- 卡片网格（不要力导向图，太复杂）
- 每张卡片显示：
  - Emoji + 名称
  - α 值（颜色编码：>0.3=amber, <0=purple, 其他=zinc）
  - α 标签（"从众"/"逆向"/"独立"/"轻度"）
  - "可见 X 人" 文字
- 悬停某张卡片时，高亮该 Agent 能看到的其他 Agent（边框发光）

### 8. TimelineChart — 时间线折线图

props: `{ timeline: v9_5.timeline }`。

Chart.js Line chart:
- X轴: Day 1, Day 2, Day 3
- Y轴: 0-100
- 三条线: Consensus（蓝 #34d399）, Polarization（橙 #f87171）, Fragility（红 #fbbf24 虚线）
- 填充区域半透明
- 深色主题（网格线 dim，文字 zinc）

### 9. NewsInput — 新闻输入（重写）

- 多行文本框，暗色玻璃质感
- 右侧发送按钮（→ 图标）
- 下方两个操作按钮：「🚀 开始推演」和「📈 连续推演3天」
- `loading` 时按钮禁用

### 10. 主页面 page.tsx — 组装一切

状态管理：
```typescript
const [loading, setLoading] = useState(false);
const [sequentialLoading, setSequentialLoading] = useState(false);
const [response, setResponse] = useState<SwarmResponse['data'] | null>(null);
const [error, setError] = useState<string | null>(null);
const [news, setNews] = useState("");
```

流程：
1. 用户输入新闻或点击预置事件 → `setNews`
2. 点击"开始推演" → POST /api/swarm → 展示 LoadingSteps → 收到响应 → 渲染结果
3. 点击"连续推演3天" → 3次 POST（sessionId + sequenceIndex 0/1/2）→ 展示时间线

---

## 技术要求

1. **所有组件用 TypeScript。** 为响应数据定义完整的 interface。禁止 `any`。
2. **用 framer-motion 做动画：** 环形仪表盘数字从0动画到目标值、组件入场 stagger、状态横幅颜色过渡、加载步骤的状态切换。
3. **响应式：** 三列仪表盘在 `md` 以下变为一列。社交网络面板和诊断摘要从并排变为上下堆叠。
4. **可访问性：** 按钮有 `aria-label`，仪表盘有 `role="img"` + `aria-label` 描述。
5. **性能：** 仪表盘动画用 `will-change: transform`。图表只在数据变化时重建。
6. **颜色使用 Tailwind 自定义色：** `bull`（emerald）、`bear`（red）、`neutral`（amber）、`tech`（cyan）、`macro`（purple）。在 tailwind.config.ts 中已定义。

---

## 不要做的事

- ❌ 不要修改任何 `src/lib/` 或 `src/app/api/` 下的文件
- ❌ 不要重新发明 API 调用逻辑，直接用 `fetch POST /api/swarm`
- ❌ 不要做路由（只有单页 `/`）
- ❌ 不要引入状态管理库（React useState + useEffect 足够）
- ❌ 不要修改 `tailwind.config.ts` 或 `next.config.js`
- ❌ 不需要 i18n（中文即可）
- ❌ 不要过度抽象——每个组件一个文件，直接导出

---

## 交付物

1. `src/app/page.tsx` — 主页面（完全重写）
2. `src/app/globals.css` — 全局样式（如需额外关键帧动画）
3. 以下新文件放在 `src/components/` 下：
   - `GaugeRing.tsx` — 环形仪表盘
   - `AgentBeliefBar.tsx` — Agent 信念水平条
   - `CounterfactualLab.tsx` — 反事实交互面板
   - `SocialNetworkPanel.tsx` — Agent 社交网络面板
   - `StateBanner.tsx` — 状态横幅
   - `LoadingSteps.tsx` — 加载步骤动画
   - `PresetEvents.tsx` — 预置事件按钮组
   - `NewsInput.tsx` — 新闻输入（重写，可覆盖旧文件）
   - `TimelineChart.tsx` — 时间线折线图（Chart.js）

---

## 对接说明（给我看的，不是给你的）

写完前端后，把整个 `src/` 目录发给我。我会：
1. 检查你的组件 props 是否与 API 响应类型匹配
2. 修正 API 调用（确保请求体格式正确）
3. 处理边缘情况（loading / error / empty / disabled 状态）
4. 确保与 Next.js App Router 正确集成
5. 删除不再需要的旧组件文件

你只需要确保组件内部逻辑正确、视觉效果好。
