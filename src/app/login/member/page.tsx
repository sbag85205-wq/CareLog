import type { Metadata } from "next";
import { MemberLoginApp } from "@/components/care-team/MemberLoginApp";

export const metadata: Metadata = { title: "보호자·의료진 로그인 · CareLog" };

export default function Page() {
  return <MemberLoginApp />;
}
