import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "漫镜视频 - AI 短剧生产平台",
  description: "面向短剧团队的 AI 视频生产协同平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
