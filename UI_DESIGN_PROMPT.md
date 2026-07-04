# SwarmAlpha UI Redesign — AI Prompt

## Project Context

SwarmAlpha is an **Embeddable Governance Runtime for Multi-Agent Systems**. It plugs into frameworks like AutoGen/CrewAI and detects decision failures (premature consensus, authority bias, echo chambers, group polarization) in real time, then intervenes to improve decision quality.

**This page is a demo/comparison tool. It shows the SAME multi-agent discussion twice — once without governance, once with SwarmAlpha's governance runtime enabled — so users can see the quality difference.**

Tech stack: **React 18 + TypeScript + Tailwind CSS + Next.js 14**. You should output a single `page.tsx` file that I can drop in to replace my existing one.

---

## Functional Requirements

### 1. Three Modes
- **Demo mode**: pre-computed data, instant rendering, 3 built-in scenarios
- **Live mode**: calls `POST /api/v3/execute` with real LLM, shows loading state, falls back to demo on error
- **Compare view / Detail view toggle**: Compare = side-by-side cards. Detail = expanded traces + agent lists + governance panel

### 2. Page States
- **Empty state**: before first run — show feature cards, call-to-action button
- **Loading state**: live mode only — spinner/skeleton while API calls in flight
- **Results state**: compare view with both result cards
- **Error state**: live mode API failure — auto-fallback to demo

### 3. Three Demo Scenarios
- 🏗️ Architecture Review: Microservices vs Monolith
- 💼 Board Investment Decision: Acquire AI Startup?
- 🏥 Multi-Disciplinary Diagnosis: Complex Case

### 4. Key Interactions
- Scenario switching (auto-runs in demo mode)
- Demo/Live mode toggle
- Run button triggers comparison
- Compare/Detail view toggle

---

## Data Model (TypeScript interfaces — DO NOT CHANGE)

```typescript
interface DemoResult {
  decision: string;                              // Final decision text (can be long)
  confidence: number;                            // 0-100
  overallScore: number;                          // 0-100
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
  summary: string;                               // One-paragraph explanation
  dimensions: Record<string, { score: number; label: string }>;
  // ^ Always has exactly 5 keys: consensus, reliability, dispersion, stability, influenceAnalysis
  governance?: {                                 // Only present for the "with governance" card
    echoChamber:    { detected: boolean; severity: string; info: string };
    authorityBias:  { detected: boolean; severity: string; info: string };
    polarization:   { detected: boolean; severity: string; info: string };
    summary: string;
  };
  agents?: Array<{
    id: string; name: string; role: string;
    belief: number;       // -1 to 1
    confidence: number;   // 0-100
  }>;
  trace: string[];        // Step-by-step decision process timeline
}

interface DemoScenario {
  id: string;
  title: string;          // Emoji + Chinese title, e.g. "🏗️ 技术架构评审: 微服务 vs 单体"
  question: string;       // The prompt/question for agents
  singleAgent: DemoResult;    // "Without Governance" result
  swarmAgents: DemoResult;    // "With SwarmAlpha Governance" result
}
```

---

## Visual Design Direction

### Overall Vibe
**"Clean data-dashboard meets governance console"** — professional but not corporate. Think: Stripe Dashboard, Vercel Analytics, Linear app. Dark theme. Information-dense but scannable.

### Color Palette (Tailwind classes)
- Background: `slate-950` (not pure black — slightly softer)
- Cards: `slate-900` with `border-slate-800`
- Accent primary: `emerald-500` (governance/positive)
- Accent warning: `amber-500` (detected issues)
- Accent danger: `rose-500` (critical failures)
- Text: `slate-100` primary, `slate-400` secondary, `slate-600` tertiary
- Font: System sans-serif (NOT monospace). Use `font-sans`.

### Specific Design Requirements

1. **Header**: Clean thin border-bottom. Logo area on left (hexagonal ant icon if possible, or 🐜 emoji). Demo/Live toggle looks like iOS segmented control. Compare/Detail toggle is a subtle text button.

2. **Scenario Selector**: Horizontal pill buttons. Active one has a subtle glow/border accent. Hover lifts slightly.

3. **Empty State**: Centered. Large illustration or abstract geometric pattern. Three feature cards below with icons, not emoji-in-boxes. Professional micro-interactions on hover.

4. **Comparison View (core experience)**:
   - Left card (Without Governance): muted border `border-slate-700`, slightly desaturated
   - Right card (With Governance): `border-emerald-500/30` with subtle green glow/shadow
   - **Delta banner**: Prominent banner between the two cards or above them showing score improvement (+XX points). Large number, emerald text, subtle particle or pulse animation.

5. **Score Display**: Use a **ring/donut progress** (like Apple Watch rings) for the overall score. The ring color matches the grade. The grade label sits in the center of the ring.

6. **Dimension Bars**: Clean horizontal bars with labels. Animate the bar width on mount with a 600ms ease-out. The "With Governance" side bars should extend further than "Without Governance" — make this visual comparison intuitive.

7. **Governance Detection Cards**: Three small cards (Echo Chamber, Authority Bias, Polarization). When `detected: true`, the card gets a red/amber tinted background and a warning icon. When `detected: false`, green checkmark, muted. These should look like status indicators, not afterthoughts.

8. **Decision Text**: Truncate to ~3 lines with a "Show more" expand. Use proper line-height for readability (leading-relaxed).

9. **Trace Timeline (Detail View)**: Vertical timeline with connecting line and dots. Green dots for governance interventions, grey dots for normal discussion rounds. Each step shows the round number, a one-line summary, and a timestamp/badge if governance intervened.

10. **Agent List**: Card-style agent avatars with colored initials. Belief shown as a horizontal gauge bar (green for positive, red for negative). Confidence as a percentage badge.

11. **Governance Panel (Detail View)**: Full-width card at the bottom. Three columns for the three detection types. Each shows the detection status, severity level (colored badge: low=green, medium=amber, high=red), and the info text. Summary paragraph below.

12. **Responsive**: Two-column grid on desktop, single column on mobile. Cards stack vertically on small screens.

### Animation & Polish
- Page load: fade-in
- Score ring: animate from 0 to target value over 800ms
- Dimension bars: stagger animation (each bar starts 100ms after the previous)
- Governance detection cards: subtle pulse when `detected: true`
- Scenario buttons: smooth color transition on hover/active
- Loading state: skeleton cards with shimmer animation

### What to AVOID
- ❌ Monospace fonts for body text (only use for numbers/metrics)
- ❌ Pure black `#000` background
- ❌ Neon/bright colors on dark backgrounds (hurts readability)
- ❌ Cluttered layout — use proper spacing (gap-6, p-6, etc.)
- ❌ Text-heavy walls — use icons, badges, visual hierarchy
- ❌ Dropdown menus for the scenario selector — use visible pill buttons

---

## Implementation Constraint

Output a **SINGLE file**: `page.tsx`. All components are defined in the same file (like the current code). "use client" directive at top. Import `DEMO_SCENARIOS` from `@/lib/demo-data`. Import the types. Use Tailwind CSS classes only — no additional CSS files, no CSS modules. Keep the exact same `mapDimensions`, `scoreColor`, `barColor`, `gradeColor` helper functions and the `runLive` fetch logic — just restyle the JSX and add animation. All 124 existing tests must continue to pass (i.e., don't change component function names or data flow, only change the rendering/styling).
