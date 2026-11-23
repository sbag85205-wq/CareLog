import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrialStartApp } from "@/components/trial/TrialStartApp";
import { isTrialSite } from "@/lib/trial";

export const metadata: Metadata = { title: "체험 시작 · CareLog" };

/** 공개 체험 사이트에서만 — 다른 배포에서는 로그인 화면으로 */
export default function StartPage() {
  if (!isTrialSite()) redirect("/login");
  return <TrialStartApp />;
}
