import type { Metadata } from "next";
import { CareLogApp } from "@/components/layout/CareLogApp";

export const metadata: Metadata = { title: "가상 데이터 데모 · CareLog" };

/** 기존 가상 데이터 데모 (localStorage, 로그인 없음) — 예전 `/` 에서 이동 */
export default function DemoPage() {
  return <CareLogApp />;
}
