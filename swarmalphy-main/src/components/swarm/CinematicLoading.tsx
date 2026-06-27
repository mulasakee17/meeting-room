import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const AGENTS = [
  { emoji: "🏦", delay: 0 },
  { emoji: "💎", delay: 0.12 },
  { emoji: "🏄", delay: 0.24 },
  { emoji: "😱", delay: 0.36 },
  { emoji: "🤖", delay: 0.48 },
  { emoji: "📡", delay: 0.60 },
  { emoji: "🦉", delay: 0.72 },
  { emoji: "🐜", delay: 0.84 },
  { emoji: "🏛️", delay: 0.96 },
];

const STATUS_LINES = [
  "提取正交五因子…",
  "Agent 信念初始化…",
  "构建社会信任网络…",
  "Kuramoto 同步化计算…",
  "非线性共识聚合…",
  "Neutral 仲裁检测…",
  "反事实推演…",
  "生成诊断报告…",
];

export function CinematicLoading({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState(0);
  const [statusLine, setStatusLine] = useState(0);

  useEffect(() => {
    // 循环推进状态
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 900);
    // 滚动状态文本
    const interval = setInterval(() => {
      setStatusLine((s) => (s + 1) % STATUS_LINES.length);
    }, 400);
    // 完成后回调
    const done = setTimeout(() => onDone?.(), 1800);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearInterval(interval);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden">
      {/* 中央主体 */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Phase 0: 标题 */}
        <AnimatePresence>
          {phase >= 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground"
              >
                群体智能推演
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 1: Agent 环绕出现 */}
        <AnimatePresence>
          {phase >= 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-wrap justify-center gap-3"
            >
              {AGENTS.map((a) => (
                <motion.span
                  key={a.emoji}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: a.delay,
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                  }}
                  className="text-4xl"
                >
                  {a.emoji}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 2: 状态指示器 */}
        <AnimatePresence>
          {phase >= 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center gap-3"
            >
              {/* 脉冲点 + 状态文本 */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <motion.span
                  key={statusLine}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="font-mono text-xs text-emerald-400"
                >
                  {STATUS_LINES[statusLine]}
                </motion.span>
              </div>

              {/* 进度条 */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="h-px w-48 origin-left bg-gradient-to-r from-emerald-400/60 to-emerald-400/10"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 背景光晕 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0.3, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl"
      />
    </div>
  );
}
