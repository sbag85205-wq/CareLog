import type { Metadata } from "next";
import { PatientLoginApp } from "@/components/patient-db/PatientLoginApp";

export const metadata: Metadata = { title: "환자 로그인 · CareLog" };

export default function LoginPage() {
  return <PatientLoginApp />;
}
