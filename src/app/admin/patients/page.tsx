import type { Metadata } from "next";
import { AdminPatientsApp } from "@/components/admin/AdminPatientsApp";

export const metadata: Metadata = { title: "환자 계정 관리 · CareLog", robots: { index: false } };

export default function Page() {
  return <AdminPatientsApp />;
}
