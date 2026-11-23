"use client";

import { CalendarCheck, HeartPulse, House, Pill, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MealsSection, RequestsSection } from "@/components/patient-db/CareSections";
import { PatientConditionForm } from "@/components/patient-db/PatientConditionForm";
import { PatientRecordsView } from "@/components/patient-db/PatientRecordsView";
import { VisitPrepView } from "@/components/patient-db/VisitPrepView";
import { AppShell, type ShellTab } from "@/components/patient-ui/AppShell";
import { BodyView } from "@/components/rx/BodyView";
import { MedRecordsView, type RecordsNav } from "@/components/rx/MedRecordsView";
import { RegisterSheet } from "@/components/rx/RegisterSheet";
import { RxHome } from "@/components/rx/RxHome";
import { TogetherView } from "@/components/rx/TogetherView";
import { Alert, cn, PButton, PCard, Segmented, SoftSheet, StatusPill, TextField } from "@/components/patient-ui/kit";
import { CONDITION_WORD, SLEEP_WORD } from "@/components/patient-ui/labels";
import { RepositoryProvider } from "@/hooks/repository-context";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDbApp } from "@/hooks/useDbApp";
import { formatKoreanDate, formatKoreanTime, formatLongKoreanDate, lastNDates, todayISO } from "@/lib/date";
import { MODE_LABEL, roomLabel } from "@/lib/labels";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { RxStoreProvider, useRxSnapshot, useRxStore } from "@/lib/rx/store";
import { createSupabaseRxStore } from "@/lib/rx/supabase-store";
import { getBrowserClient } from "@/lib/supabase/browser";
import { admissionsOf, questionsOf, recordsOf } from "@/lib/selectors";
import type { Admission, CareMode, HealthRecord, Patient } from "@/types";

/** records(건강 기록·컨디션)는 메뉴에서 빼고 진료 준비에서 열 수 있게 보존 */
export type PatientTab = "home" | "meds" | "body" | "share" | "visit" | "records";
type Tab = PatientTab;
export const PATIENT_TABS: ShellTab<Tab>[] = [
  { id: "home", label: "홈", icon: House },
  { id: "meds", label: "나의 약 기록", icon: Pill },
  { id: "body", label: "내 몸의 반응", icon: HeartPulse },
  { id: "share", label: "함께 보기", icon: UsersRound },
  { id: "visit", label: "진료 준비", icon: CalendarCheck },
];

/** 로그인 버전 — 환자 (본인 기록만, RLS 적용) */
export function MyRecordsApp() {
  const { repo, snapshot, loadState, ready, logout } = useDbApp("patient");
  const [tab, setTab] = useState<Tab>("home");
  const patient = snapshot?.patients[0];
  // 처방 이력 (본인 세션 → RLS). migration 10 이 없는 DB에서는 '준비 중'으로 알리고 기존 기능 유지
  const rxStore = useMemo(() => (ready ? createSupabaseRxStore(getBrowserClient()!) : null), [ready]);
  useEffect(() => {
    void rxStore?.load();
  }, [rxStore]);

  return (
    <AppShell
      tabs={PATIENT_TABS}
      active={tab}
      onTab={setTab}
      roleLabel="가상 환자"
      userLabel={patient?.name}
      onLogout={() => void logout()}
      loadState={loadState}
      onRetry={() => void repo?.load()}
      ready={ready && Boolean(patient)}
    >
      {ready && patient && repo && snapshot && (
        <RepositoryProvider value={repo}>
          <RxStoreProvider value={rxStore}>
            <PatientTabs tab={tab} setTab={setTab} snapshot={snapshot} patient={patient} repo={repo} />
          </RxStoreProvider>
        </RepositoryProvider>
      )}
    </AppShell>
  );
}

/** 환자 화면 탭 내용 (로그인 버전·공개 데모 공용) */
export function PatientTabs({
  tab,
  setTab,
  snapshot,
  patient,
  repo,
  demo = false,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  snapshot: DbSnapshot;
  patient: Patient;
  repo: SupabaseRepository;
  demo?: boolean;
}) {
  // 현재 날짜는 데이터가 준비된 뒤(브라우저)에서만 계산 — 사전 렌더링 중 new Date() 사용 금지 (cacheComponents)
  const today = todayISO();
  const records = recordsOf(snapshot, patient.id);
  const admissions = admissionsOf(snapshot, patient.id);
  const rxStore = useRxStore();
  const rx = useRxSnapshot(rxStore);
  // 화면 사이 이동 (홈 → 나의 약 기록 조건·상세, 상세 → 함께 보기 등). n 은 새로 열 때 화면을 초기화하는 키
  const [medsNav, setMedsNav] = useState<RecordsNav & { n: number }>({ n: 0 });
  const [bodyNav, setBodyNav] = useState<{ tags: string[]; n: number }>({ tags: [], n: 0 });
  const [shareNav, setShareNav] = useState<{ record: string | null; n: number }>({ record: null, n: 0 });
  const [register, setRegister] = useState<{ open: boolean; n: number }>({ open: false, n: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  const openMeds = (nav: RecordsNav) => {
    setNotice(null);
    setMedsNav((c) => ({ ...nav, n: c.n + 1 }));
    go("meds");
  };
  const openRegister = () => setRegister((c) => ({ open: true, n: c.n + 1 }));
  const openShare = (record: string | null) => {
    setShareNav((c) => ({ record, n: c.n + 1 }));
    go("share");
  };

  let body: React.ReactNode;
  switch (tab) {
    case "records":
      body = (
        <PatientRecordsView
          patient={patient}
          records={records}
          today={today}
          admissions={admissions}
          title="건강 기록"
          sub="필요할 때 컨디션 기록을 열어 봐요."
        />
      );
      break;
    case "meds":
      body = (
        <MedRecordsView
          key={medsNav.n}
          snapshot={snapshot}
          rx={rx}
          rxStore={rxStore}
          patient={patient}
          repo={repo}
          initial={medsNav}
          notice={notice}
          onRegister={openRegister}
          onShare={(id) => openShare(id)}
        />
      );
      break;
    case "body":
      body = (
        <BodyView
          key={bodyNav.n}
          rx={rx}
          initialTags={bodyNav.tags}
          onOpenRecord={(id) => openMeds({ view: "records", record: id })}
          onOpenItem={(id) => openMeds({ item: id })}
          onRegister={openRegister}
        />
      );
      break;
    case "visit":
      body = (
        <VisitPrepView
          patient={patient}
          records={records}
          questions={questionsOf(snapshot, patient.id)}
          today={today}
          repo={repo}
          rx={rx}
          onRecords={() => go("records")}
        />
      );
      break;
    case "share":
      body = <TogetherView key={shareNav.n} snapshot={snapshot} rx={rx} rxStore={rxStore} patientId={patient.id} repo={repo} presetRecord={shareNav.record} />;
      break;
    default:
      body = (
        <RxHome
          snapshot={snapshot}
          rx={rx}
          rxStore={rxStore}
          patient={patient}
          repo={repo}
          today={today}
          onRegister={openRegister}
          onFind={(filter) => openMeds({ view: "items", filter })}
          onOpenRecord={(id) => openMeds({ view: "records", record: id })}
          onOpenItem={(id) => openMeds({ item: id })}
          onBody={(tags) => {
            setBodyNav((c) => ({ tags: tags ?? [], n: c.n + 1 }));
            go("body");
          }}
          onVisit={() => go("visit")}
        />
      );
  }
  return (
    <>
      {body}
      {register.open && (
        <RegisterSheet
          key={register.n}
          open
          onClose={() => setRegister((c) => ({ ...c, open: false }))}
          snapshot={snapshot}
          rx={rx}
          rxStore={rxStore}
          repo={repo}
          patient={patient}
          demo={demo}
          onSaved={(id, message) => {
            setRegister((c) => ({ ...c, open: false }));
            setMedsNav((c) => ({ view: id ? "records" : "items", record: id, n: c.n + 1 }));
            setNotice(message);
            go("meds");
          }}
        />
      )}
    </>
  );
}

/**
 * 이전 버전 홈 (통원·입원 전환·식사·생활 요청) — 새 버전 홈에서는 쓰지 않지만 코드는 보존
 * (병동 흐름을 다시 켤 때 PatientTabs 의 홈에서 이 컴포넌트를 사용)
 */
export function LegacyHomeView(props: Parameters<typeof HomeView>[0]) {
  return <HomeView {...props} />;
}

function HomeView({
  snapshot,
  patient,
  today,
  records,
  admission,
  repo,
  onShowRecords,
}: {
  snapshot: DbSnapshot;
  patient: Patient;
  today: string;
  records: HealthRecord[];
  admission?: Admission;
  repo: SupabaseRepository;
  onShowRecords: () => void;
}) {
  const [modeTarget, setModeTarget] = useState<CareMode | null>(null);
  const [editingToday, setEditingToday] = useState(false);
  const latest = [...records].filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const week = lastNDates(7, today);
  const weekRecs = records.filter((r) => week.includes(r.date));
  const weekAvg = weekRecs.length ? weekRecs.reduce((s, r) => s + r.condition, 0) / weekRecs.length : null;
  const todayRecord = records.find((r) => r.date === today);
  const inpatient = patient.careMode === "inpatient";

  const recentCard = latest && (
    <PCard tone="tint" className="!py-4">
      <p className="text-sm font-bold text-brand-800">최근 기록 · {formatKoreanDate(latest.date, false)}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink">
          {CONDITION_WORD[latest.condition]} · 통증 {latest.pain}점
        </p>
        <button type="button" onClick={onShowRecords} className="text-sm font-semibold text-brand-800 underline-offset-4 hover:underline">
          전체 기록 보기 →
        </button>
      </div>
    </PCard>
  );

  const form = (
    <PatientConditionForm
      key={`${today}-${patient.careMode}`}
      patientId={patient.id}
      date={today}
      mode={patient.careMode}
      existing={todayRecord}
      aside={<div className="lg:hidden">{recentCard}</div>}
    />
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-soft">{formatLongKoreanDate(today)}</p>
          <StatusPill tone="outline">{MODE_LABEL[patient.careMode]} 중</StatusPill>
        </div>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-3xl">{patient.name} 님, 안녕하세요.</h1>
        <p className="mt-1.5 text-ink-soft">{todayRecord ? "오늘 기록이 있어요. 다시 저장하면 수정됩니다." : "오늘의 작은 변화도 소중한 기록이에요."}</p>
        <div className="mt-4 max-w-sm">
          <Segmented
            ariaLabel="이용 모드"
            items={[
              { value: "outpatient" as CareMode, label: "통원" },
              { value: "inpatient" as CareMode, label: "입원" },
            ]}
            value={patient.careMode}
            onChange={(m) => m !== patient.careMode && setModeTarget(m)}
          />
          {inpatient && admission && (
            <p className="mt-2 text-sm text-ink-soft">
              {formatKoreanDate(admission.admittedOn, false)} 입원 · {admission.ward === "미입력" ? "병동 미입력" : admission.ward}
              {admission.room !== "미입력" && ` ${roomLabel(admission.room)}`} · 자기기록
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          {inpatient && todayRecord ? (
            <>
              <PCard tone="tint" aria-label="오늘의 컨디션">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-ink">오늘의 컨디션</p>
                    <p className="mt-2 text-[1.6rem] font-extrabold text-brand-700">
                      {CONDITION_WORD[todayRecord.condition]} · 통증 {todayRecord.pain}점
                    </p>
                    <p className="mt-1 text-sm text-brand-800">
                      ✓ 기록 완료 · {formatKoreanTime(todayRecord.updatedAt)} · 수면 {SLEEP_WORD[todayRecord.sleep]}
                    </p>
                  </div>
                  <PButton variant="secondary" size="sm" onClick={() => setEditingToday(true)}>
                    기록 수정
                  </PButton>
                </div>
              </PCard>
              <button type="button" onClick={onShowRecords} className="w-full rounded-[1.75rem] border border-line bg-white p-5 text-left hover:bg-brand-50">
                <p className="font-bold text-ink">통원 때의 기록도 그대로 이어져요.</p>
                <p className="mt-1 text-sm text-ink-soft">기록 보기에서 모든 모드를 함께 확인해요. →</p>
              </button>
              <SoftSheet open={editingToday} title="오늘 기록 수정" onClose={() => setEditingToday(false)}>
                {editingToday && (
                  <PatientConditionForm
                    key={todayRecord.updatedAt}
                    patientId={patient.id}
                    date={today}
                    mode={patient.careMode}
                    existing={todayRecord}
                    onSaved={() => setEditingToday(false)}
                  />
                )}
              </SoftSheet>
            </>
          ) : (
            form
          )}
          {inpatient && (
            <>
              <MealsSection snapshot={snapshot} patientId={patient.id} repo={repo} />
              <RequestsSection snapshot={snapshot} patientId={patient.id} repo={repo} />
            </>
          )}
        </div>

        {/* PC: 오른쪽 요약 */}
        <aside className="hidden space-y-4 lg:sticky lg:top-10 lg:block" aria-label="최근 요약">
          <PCard>
            <h2 className="text-lg font-bold text-ink">이번 주 컨디션</h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-brand-700">{weekAvg === null ? "—" : weekAvg.toFixed(1)}</span>
              <span className="text-ink-soft">/ 5점 평균</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">최근 7일 중 {weekRecs.length}일 기록</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
              {week.map((d) => {
                const r = records.find((x) => x.date === d);
                return (
                  <div key={d} className="text-center">
                    <div
                      className={cn("mx-auto h-8 w-full rounded-lg", r ? "bg-brand-700" : "bg-ivory-deep")}
                      style={r ? { opacity: 0.35 + r.condition * 0.13 } : undefined}
                    />
                    <span className="mt-1 block text-[0.7rem] text-ink-soft">{Number(d.slice(8))}</span>
                  </div>
                );
              })}
            </div>
          </PCard>
          {recentCard}
          <PButton variant="secondary" size="md" className="w-full" arrow onClick={onShowRecords}>
            기록 보기
          </PButton>
        </aside>
      </div>

      <CareModeSheet target={modeTarget} patient={patient} repo={repo} onClose={() => setModeTarget(null)} />
    </div>
  );
}

/** 통원↔입원 전환 (환자 자기기록 — 병원의 공식 입원 확인이 아님) */
function CareModeSheet({ target, patient, repo, onClose }: { target: CareMode | null; patient: Patient; repo: SupabaseRepository; onClose: () => void }) {
  const [ward, setWard] = useState("");
  const [room, setRoom] = useState("");
  const action = useAsyncAction();
  const toInpatient = target === "inpatient";
  return (
    <SoftSheet open={target !== null} title={toInpatient ? "입원 모드로 바꾸기" : "통원 모드로 바꾸기"} onClose={onClose}>
      <PCard className="space-y-4">
        <p className="text-ink">
          {toInpatient
            ? "오늘 날짜로 새 입원 이력이 생기고, 오늘의 식사와 생활 요청을 쓸 수 있어요."
            : "진행 중인 입원에 오늘 날짜로 퇴원을 기록해요. 지금까지의 기록과 입원 이력은 그대로 남아요."}
        </p>
        <p className="text-sm text-ink-soft">환자가 직접 남기는 자기기록이며 병원의 공식 입원 확인이 아니에요.</p>
        {toInpatient && (
          <div className="grid grid-cols-2 gap-3">
            <TextField label="병동 (선택)" value={ward} maxLength={50} onChange={(e) => setWard(e.target.value)} placeholder="예: 가상 병동" />
            <TextField label="병실 (선택)" value={room} maxLength={20} onChange={(e) => setRoom(e.target.value)} placeholder="예: 302" />
          </div>
        )}
        <Alert>{action.error}</Alert>
        <PButton
          className="w-full"
          disabled={action.pending}
          onClick={async () => {
            if (!target) return;
            const r = await action.run(() => repo.setCareMode(patient.id, target, { ward, room }));
            if (r.ok) {
              setWard("");
              setRoom("");
              onClose();
            }
          }}
        >
          {action.pending ? "바꾸는 중…" : toInpatient ? "입원으로 바꾸기" : "통원으로 바꾸기"}
        </PButton>
      </PCard>
    </SoftSheet>
  );
}
