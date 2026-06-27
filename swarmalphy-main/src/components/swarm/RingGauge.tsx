import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

interface RingGaugeProps {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  color: string;
  size?: number;
  formatValue?: (v: number) => string;
}

export function RingGauge({
  value,
  max = 100,
  label,
  sublabel,
  color,
  size = 200,
  formatValue,
}: RingGaugeProps) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));

  const motionVal = useMotionValue(0);
  const [displayText, setDisplayText] = useState("0");
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    const controls = animate(motionVal, value, {
      duration: 1.2,
      ease: [0.25, 0.1, 0.25, 1], // 自定义缓动：先快后慢的弹簧感
      onUpdate(latest) {
        setDisplayText(
          formatValue ? formatValue(latest) : String(Math.round(latest))
        );
      },
      onComplete() {
        doneRef.current = true;
      },
    });
    return () => controls.stop();
  }, [value, motionVal, formatValue]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* 外层光晕 */}
        <div
          className="absolute -inset-4 rounded-full blur-2xl transition-opacity duration-1000"
          style={{
            opacity: Number(pct) * 0.25,
            background: `radial-gradient(circle, ${color}44, transparent 70%)`,
          }}
        />

        <svg width={size} height={size} className="-rotate-90">
          {/* 背景轨道 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={stroke}
          />
          {/* 发光进度弧 */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              filter: `drop-shadow(0 0 12px ${color}44)`,
            }}
          />
          {/* 内圈细光环 */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r * 0.92}
            fill="none"
            stroke={color}
            strokeWidth={0.5}
            initial={{ opacity: 0 }}
            animate={{ opacity: pct > 0.3 ? 0.3 : 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          />
        </svg>

        {/* 中心数值 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={displayText}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="font-mono text-5xl font-bold tracking-tight tabular-nums"
            style={{ color }}
          >
            {displayText}
          </motion.span>
          {sublabel && (
            <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {sublabel}
            </span>
          )}
        </div>
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
