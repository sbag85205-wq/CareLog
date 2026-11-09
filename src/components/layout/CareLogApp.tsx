"use client";

import { HeartPulse } from "lucide-react";
import { useState } from "react";
import { PatientDashboard } from "@/components/dashboard/PatientDashboard";
import { GuardianDashboard } from "@/components/guardian/GuardianDashboard";
import { AppFooter, AppHeader } from "@/components/layout/AppHeader";
import { StaffDashboard } from "@/components/medical-staff/StaffDashboard";
import { DEMO_GUARDIAN_ID, DEMO_PATIENT_ID, DEMO_STAFF_ID } from "@/data/mock-data";
import { repository, useCareLogData } from "@/hooks/useCareLog";
import { patientById } from "@/lib/selectors";
import type { Role } from "@/types";

/** 최상위 클라이언트 셸: 데모 역할 전환 + 역할별 화면 */
export function CareLogApp() {
  const data = useCareLogData();
  const [role, setRole] = useState<Role>("patient");

  const reset = () => {
    if (window.confirm("이 브라우저에 저장된 가상 기록을 모두 지우고 데모 데이터를 처음 상태로 되돌릴까요?")) {
      void repository.resetDemoData();
    }
  };

  const changeRole = (r: Role) => {
    setRole(r);
    window.scrollTo({ top: 0 });
  };

  const patient = data ? patientById(data, DEMO_PATIENT_ID) : undefined;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50/60 via-white to-white">
      <AppHeader role={role} onRoleChange={changeRole} onReset={reset} />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-6">
        {!data ? (
          <LoadingState />
        ) : role === "patient" && patient ? (
          <PatientDashboard data={data} patient={patient} />
        ) : role === "staff" ? (
          <StaffDashboard data={data} staffId={DEMO_STAFF_ID} />
        ) : (
          <GuardianDashboard data={data} guardianId={DEMO_GUARDIAN_ID} />
        )}
      </main>
      <AppFooter />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400">
      <HeartPulse className="h-10 w-10 animate-pulse text-teal-400" aria-hidden />
      <p className="text-sm">데모 데이터를 불러오는 중…</p>
    </div>
  );
}
