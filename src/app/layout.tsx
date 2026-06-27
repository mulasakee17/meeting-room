import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SwarmAlpha API — Collective Intelligence Laboratory",
  description: "AI multi-agent consensus formation research platform API server.",
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
