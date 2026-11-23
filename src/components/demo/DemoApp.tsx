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
import { DEMO_GUARDIAN_ID, DEMO_PATIENT_ID } from "@/data/mock-data";
import { todayISO } from "@/lib/date";
import { demoDrugCaution, demoDrugEasyInfo, demoDrugSearch } from "@/lib/demo/drug-catalog";
import { DrugCautionProvider, DrugEasyInfoProvider, DrugSearchProvider } from "@/lib/drug-search-client";
import { FEATURES } from "@/lib/features";
import { repository as localRepository } from "@/lib/repository";
import { createDemoRepository, type DemoRole } from "@/lib/repository/demo";
import { createLocalRxStore } from "@/lib/rx/local-store";
import { RxStoreProvider } from "@/lib/rx/store";

// FeelPill 데모: 나 · 함께 보는 사람(가족·친구 — 내부 역할은 기존 보호자) (의료진 병동 흐름은 FEATURES.WARD 를 켜면 다시 보임)
const ROLES: { id: DemoRole; label: string; icon: typeof User }[] = [
  { id: "patient", label: "나", icon: User },
  ...(FEATURES.WARD ? [{ id: "staff" as const, label: "의료진", icon: Stethoscope }] : []),
  { id: "guardian", label: "함께 보는 사람", icon: Users },
];

const ROLE_LABEL: Record<DemoRole, string> = {
  patient: "가상 사용자",
  staff: "가상 간호사",
  guardian: "함께 보는 사람 (가상)",
};

const demoGrant = () =>
  localRepository.getSnapshot()?.accessGrants.find((g) => g.patientId === DEMO_PATIENT_ID && g.granteeUserId === DEMO_GUARDIAN_ID && !g.revokedAt);

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
  // 약 기록 (가상 · 이 브라우저 localStorage). 함께 보는 사람은 공유받은 기록·항목만 (연결이 끊기면 아무것도)
  const rxStore = useMemo(
    () =>
      createLocalRxStore({
        patientId: DEMO_PATIENT_ID,
        today: todayISO,
        viewer: () => (role === "guardian" ? { role: "guardian", userId: DEMO_GUARDIAN_ID, grantActive: Boolean(demoGrant()) } : { role: "patient" }),
        hasActiveGrant: (id) => id === DEMO_GUARDIAN_ID && Boolean(demoGrant()),
      }),
    [role],
  );

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
    sideNote: "가상 데이터 데모 · 로그인 없이 체험해요. 기록은 이 브라우저에만 저장되고 실제 의료정보가 아니에요. 사진 인식·검색 결과는 데모용 예시예요.",
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
      <DrugCautionProvider value={demoDrugCaution}>
        <DrugEasyInfoProvider value={demoDrugEasyInfo}>
          <RxStoreProvider value={rxStore}>
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
                  <p className="text-ink">이 브라우저에 저장된 가상 약 기록·복용 경험·공유·기록을 모두 지우고 처음 상태로 되돌려요.</p>
                  <PButton
                    className="w-full"
                    icon={RotateCcw}
                    onClick={async () => {
                      await repo.resetDemoData();
                      rxStore.reset();
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
          </RxStoreProvider>
        </DrugEasyInfoProvider>
      </DrugCautionProvider>
    </DrugSearchProvider>
  );
}

function DemoBar({ role, onRole, onReset }: { role: DemoRole; onRole: (r: DemoRole) => void; onReset: () => void }) {
  return (
    <div className="border-b border-brand-200 bg-brand-100" role="region" aria-label="가상 데이터 데모 안내">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-700 px-3 py-1 text-sm font-bold text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden /> 가상 데이터 데모
            </span>
            <span className="hidden text-sm text-brand-900 sm:inline">로그인 없이 체험 · 이 브라우저에만 저장돼요</span>
          </div>
          <span className="lg:hidden">
            <PButton variant="ghost" size="sm" icon={RotateCcw} onClick={onReset}>
              초기화
            </PButton>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="데모 역할"
            className="grid flex-1 auto-cols-fr grid-flow-col gap-1 rounded-[1.1rem] bg-white/70 p-1 lg:w-96 lg:flex-none"
          >
            {ROLES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={role === id}
                onClick={() => onRole(id)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-[0.9rem] text-[0.95rem] transition",
                  role === id ? "bg-brand-700 font-bold text-white shadow-sm" : "font-semibold text-brand-900 hover:bg-white",
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
        <p className="text-xs text-brand-900 sm:hidden">로그인 없이 체험 · 이 브라우저에만 저장돼요 · 실제 의료정보 아님</p>
      </div>
      <p className="sr-only">
        실제 계정으로 쓰려면 <Link href="/login">로그인</Link>
      </p>
    </div>
  );
}
