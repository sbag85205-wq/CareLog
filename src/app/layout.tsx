import type { Metadata, Viewport } from "next";
// Pretendard Variable (OFL-1.1) — 외부 CDN 없이 앱이 직접 제공, 쓰는 글자 묶음만 내려받음 (dynamic subset)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { TrialBanner } from "@/components/patient-ui/TrialBanner";

export const metadata: Metadata = {
  title: "CareLog · 내 약 복용 경험 기록 (프로토타입)",
  description: "통원·입원 환자를 위한 통합 건강기록 및 의료 소통 웹앱 프로토타입 — 가상 데이터 시연용",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fafc",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <TrialBanner />
        {children}
      </body>
    </html>
  );
}
