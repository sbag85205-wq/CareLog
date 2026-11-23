import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";

export const metadata: Metadata = {
  title: "가상 데이터 데모 · CareLog",
  description:
    "로그인 없이 CareLog를 체험하는 가상 데이터 데모 — 그때 먹었던 약, 나한테 어땠더라? 일반약·처방 등록, 복용 경험 기록, 약 종류·경험으로 다시 찾기, 진료 때 보여주기, 선택 공유",
};

/** 공개 데모 (포스터 QR) — 로그인 버전과 같은 화면, 가상 데이터는 이 브라우저에만 저장 */
export default function DemoPage() {
  return <DemoApp />;
}
