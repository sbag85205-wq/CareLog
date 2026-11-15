import type { Metadata } from "next";
import { MyRecordsApp } from "@/components/patient-db/MyRecordsApp";

export const metadata: Metadata = { title: "내 건강기록 · CareLog" };

export default function MyPage() {
  return <MyRecordsApp />;
}
