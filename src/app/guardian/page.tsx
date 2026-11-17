import type { Metadata } from "next";
import { GuardianApp } from "@/components/care-team/GuardianApp";

export const metadata: Metadata = { title: "보호자 · CareLog" };

export default function Page() {
  return <GuardianApp />;
}
