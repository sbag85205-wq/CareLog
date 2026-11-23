import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FeelPill (가칭) · 내 약 복용 경험 기록 (프로토타입)",
  description: "통원·입원 환자를 위한 통합 건강기록 및 의료 소통 웹앱 프로토타입 — 가상 데이터 시연용",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14b8a6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
