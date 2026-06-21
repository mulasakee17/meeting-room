import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwarmAlpha - 金融多智能体共识推演沙盒",
  description: "多Agent博弈推演市场情绪演化",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen bg-[#0a0a0a]">{children}</body>
    </html>
  );
}
