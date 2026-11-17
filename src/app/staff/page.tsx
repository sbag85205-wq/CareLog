import type { Metadata } from "next";
import { StaffApp } from "@/components/care-team/StaffApp";

export const metadata: Metadata = { title: "간호사·의료진 · CareLog" };

export default function Page() {
  return <StaffApp />;
}
