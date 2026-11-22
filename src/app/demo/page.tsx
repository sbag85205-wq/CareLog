import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";

export const metadata: Metadata = {
  title: "가상 데이터 데모 · CareLog",
  description: "로그인 없이 CareLog를 체험하는 가상 데이터 데모 — 환자·의료진·보호자 역할 전환, 통원·입원 전환, 예제 처방전 불러오기",
};

/** 공개 데모 (포스터 QR) — 로그인 버전과 같은 화면, 가상 데이터는 이 브라우저에만 저장 */
export default function DemoPage() {
  return <DemoApp />;
}
