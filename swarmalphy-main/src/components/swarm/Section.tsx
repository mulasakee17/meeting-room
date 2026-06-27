import { type ReactNode, useEffect, useState } from "react";

interface SectionProps {
  index: number;
  label: string;
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}

export function Section({
  index,
  label,
  title,
  description,
  right,
  children,
}: SectionProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <section
      className="mx-auto w-full max-w-[1600px] px-8 py-12 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
      }}
    >
      <div className="mb-6 flex items-end justify-between gap-6 border-b border-border pb-4">
        <div className="flex items-end gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {String(index).padStart(2, "0")} · {label}
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
