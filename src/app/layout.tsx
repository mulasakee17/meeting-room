import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SwarmAlpha — Embeddable Governance Runtime for Multi-Agent Systems",
  description: "Improving collective decision quality via quantifiable adaptive governance. Framework-agnostic runtime for AutoGen, CrewAI, LangGraph, and custom multi-agent systems.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#050505] text-[#fafafa] font-mono">
        {children}
      </body>
    </html>
  );
}
