"use client";

import { RotateCcw, ShieldCheck, Stethoscope, User, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { GUARDIAN_TABS, GuardianHome } from "@/components/care-team/GuardianApp";
import { STAFF_TABS, StaffContent, type StaffTab } from "@/components/care-team/StaffApp";
import { PATIENT_TABS, PatientTabs, type PatientTab } from "@/components/patient-db/MyRecordsApp";
import { AppShell } from "@/components/patient-ui/AppShell";
import { cn, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import { RepositoryProvider } from "@/hooks/repository-context";
import { demoDrugSearch } from "@/lib/demo/drug-catalog";
import { DrugSearchProvider } from "@/lib/drug-search-client";
import { repository as localRepository } from "@/lib/repository";
import { createDemoRepository, type DemoRole } from "@/lib/repository/demo";

const ROLES: { id: DemoRole; label: string; icon: typeof User }[] = [
  { id: "patient", label: "환자", icon: User },
  { id: "staff", label: "의료진", icon: Stethoscope },
  { id: "guardian", label: "보호자", icon: Users },
];

const ROLE_LABEL: Record<DemoRole, string> = { patient: "가상 환자", staff: "가상 간호사", guardian: "가상 보호자" };

/**
 * 공개 데모 (/demo, 포스터 QR) — 로그인 없이 역할을 바꿔 가며 체험
 * 화면은 로그인 버전과 같은 컴포넌트, 데이터는 이 브라우저(localStorage)의 가상 데이터만 사용
 */
export function DemoApp() {
  const [role, setRole] = useState<DemoRole>("patient");
  const [patientTab, setPatientTab] = useState<PatientTab>("home");
  const [staffTab, setStaffTab] = useState<StaffTab>("patients");
  const [selected, setSelected] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const repo = useMemo(() => createDemoRepository(localRepository, role), [role]);
  const snapshot = useSyncExternalStore(repo.subscribe, repo.getSnapshot, () => null);

  const changeRole = (r: DemoRole) => {
    setRole(r);
    setSelected(null);
    window.scrollTo({ top: 0 });
  };

  const topBar = <DemoBar role={role} onRole={changeRole} onReset={() => setResetOpen(true)} />;
  const shell = {
    roleLabel: ROLE_LABEL[role],
    userLabel: snapshot?.viewer.displayName || undefined,
    topBar,
    sideNote: "가상 데이터 데모 · 로그인 없이 체험해요. 기록은 이 브라우저에만 저장되고 실제 의료정보가 아니에요.",
    loadState: snapshot ? ({ state: "ready" } as const) : ({ state: "loading" } as const),
    onRetry: () => {},
    ready: snapshot !== null,
  };

  let body: React.ReactNode = null;
  if (snapshot) {
    if (role === "patient" && snapshot.patients[0]) {
      body = <PatientTabs tab={patientTab} setTab={setPatientTab} snapshot={snapshot} patient={snapshot.patients[0]} repo={repo} demo />;
    } else if (role === "staff") {
      body = <StaffContent tab={staffTab} snapshot={snapshot} repo={repo} selected={selected} setSelected={setSelected} />;
    } else if (role === "guardian") {
      body = <GuardianHome snapshot={snapshot} selected={selected} onSelect={setSelected} />;
    }
  }

  return (
    <DrugSearchProvider value={demoDrugSearch}>
      <RepositoryProvider value={repo}>
        {role === "patient" ? (
          <AppShell tabs={PATIENT_TABS} active={patientTab} onTab={setPatientTab} {...shell}>
            {body}
          </AppShell>
        ) : role === "staff" ? (
          <AppShell
            tabs={STAFF_TABS}
            active={staffTab}
            onTab={(t) => {
              setStaffTab(t);
              setSelected(null);
            }}
            {...shell}
          >
            {body}
          </AppShell>
        ) : (
          <AppShell tabs={GUARDIAN_TABS} active="home" onTab={() => {}} {...shell}>
            {body}
          </AppShell>
        )}
        <SoftSheet open={resetOpen} title="데모 데이터 초기화" onClose={() => setResetOpen(false)}>
          <PCard className="space-y-4">
            <p className="text-ink">이 브라우저에 저장된 가상 기록·약·요청을 모두 지우고 처음 상태로 되돌려요.</p>
            <PButton
              className="w-full"
              icon={RotateCcw}
              onClick={async () => {
                await repo.resetDemoData();
                setPatientTab("home");
                setStaffTab("patients");
                setSelected(null);
                setResetOpen(false);
                window.scrollTo({ top: 0 });
              }}
            >
              처음 상태로 되돌리기
            </PButton>
          </PCard>
        </SoftSheet>
      </RepositoryProvider>
    </DrugSearchProvider>
  );
}

function DemoBar({ role, onRole, onReset }: { role: DemoRole; onRole: (r: DemoRole) => void; onReset: () => void }) {
  return (
    <div className="border-b border-sage-200 bg-sage-100" role="region" aria-label="가상 데이터 데모 안내">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-700 px-3 py-1 text-sm font-bold text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden /> 가상 데이터 데모
            </span>
            <span className="hidden text-sm text-sage-900 sm:inline">로그인 없이 체험 · 이 브라우저에만 저장돼요</span>
          </div>
          <span className="lg:hidden">
            <PButton variant="ghost" size="sm" icon={RotateCcw} onClick={onReset}>
              초기화
            </PButton>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="데모 역할" className="grid flex-1 grid-cols-3 gap-1 rounded-[1.1rem] bg-white/70 p-1 lg:w-96 lg:flex-none">
            {ROLES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={role === id}
                onClick={() => onRole(id)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-[0.9rem] text-[0.95rem] transition",
                  role === id ? "bg-sage-700 font-bold text-white shadow-sm" : "font-semibold text-sage-900 hover:bg-white",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <span className="hidden lg:block">
            <PButton variant="secondary" size="sm" icon={RotateCcw} onClick={onReset}>
              데모 데이터 초기화
            </PButton>
          </span>
        </div>
        <p className="text-xs text-sage-900 sm:hidden">로그인 없이 체험 · 이 브라우저에만 저장돼요 · 실제 의료정보 아님</p>
      </div>
      <p className="sr-only">
        실제 계정으로 쓰려면 <Link href="/login">로그인</Link>
      </p>
    </div>
  );
}
