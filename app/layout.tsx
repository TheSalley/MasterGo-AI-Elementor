import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M-AI-E 管理后台 · MasterGo → Elementor",
  description: "MasterGo 设计稿 → AI → Elementor 页面",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="h-screen overflow-hidden bg-slate-100 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
