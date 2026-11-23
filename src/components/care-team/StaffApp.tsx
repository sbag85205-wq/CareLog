"use client";

import { BellRing, CheckCheck, ChevronLeft, MessageSquareWarning, UsersRound } from "lucide-react";
import { useState } from "react";
import { MealsSection, RequestCard } from "@/components/patient-db/CareSections";
import { MedicationsView } from "@/components/patient-db/MedicationsView";
import { PatientRecordsView } from "@/components/patient-db/PatientRecordsView";
import { AppShell, PageTitle, type ShellTab } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, cn, Notice, PButton, PCard, Segmented, StatusPill, TextArea } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDbApp } from "@/hooks/useDbApp";
import { formatDateTime, formatKoreanDate, todayISO } from "@/lib/date";
import { nextRequestStatus } from "@/lib/domain/request-status";
import { FEATURES } from "@/lib/features";
import { MODE_LABEL, REQUEST_STATUS_LABEL, roomLabel, TRIAGE_LABEL } from "@/lib/labels";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { admissionsOf, medicationsOf, questionsOf, recordsOf, requestsForStaff, reviewsOf } from "@/lib/selectors";
import { summarizeAll, TRIAGE_RULES } from "@/lib/triage";
import type { LifeRequest, PatientSummary, ReviewAction, TriageFlag } from "@/types";

export type StaffTab = "patients" | "requests";
type Tab = StaffTab;
export const STAFF_TABS: ShellTab<Tab>[] = [
  { id: "patients", label: "담당 환자", icon: UsersRound },
  ...(FEATURES.WARD ? [{ id: "requests" as const, label: "생활 요청", icon: BellRing }] : []),
];

const FLAG_TONE: Record<TriageFlag, "warn" | "outline" | "ivory" | "sage"> = {
  review: "warn",
  change: "outline",
  insufficient: "ivory",
  stable: "sage",
};
const REVIEW_LABEL: Record<ReviewAction, string> = {
  checked: "확인 완료",
  consult_needed: "진료 상담 필요",
};

/** 로그인 버전 — 간호사·의료진 (담당 환자만, RLS 적용) */
export function StaffApp() {
  const { repo, snapshot, loadState, ready, logout } = useDbApp("staff");
  const [tab, setTab] = useState<Tab>("patients");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <AppShell
      tabs={STAFF_TABS}
      active={tab}
      onTab={(t) => {
        setTab(t);
        setSelected(null);
      }}
      roleLabel="간호사·의료진"
      userLabel={snapshot?.viewer.displayName || undefined}
      onLogout={() => void logout()}
      loadState={loadState}
      onRetry={() => void repo?.load()}
      ready={ready}
    >
      {ready && snapshot && repo && <StaffContent tab={tab} snapshot={snapshot} repo={repo} selected={selected} setSelected={setSelected} />}
    </AppShell>
  );
}

/** 의료진 화면 내용 (로그인 버전·공개 데모 공용) */
export function StaffContent({
  tab,
  snapshot,
  repo,
  selected,
  setSelected,
}: {
  tab: Tab;
  snapshot: DbSnapshot;
  repo: SupabaseRepository;
  selected: string | null;
  setSelected: (id: string | null) => void;
}) {
  if (tab === "requests" && FEATURES.WARD) return <StaffRequests snapshot={snapshot} repo={repo} />;
  if (selected && snapshot.patients.some((p) => p.id === selected)) {
    return <StaffPatientDetail snapshot={snapshot} patientId={selected} repo={repo} onBack={() => setSelected(null)} />;
  }
  return (
    <PatientList
      snapshot={snapshot}
      onOpen={(id) => {
        setSelected(id);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

function PatientList({ snapshot, onOpen }: { snapshot: DbSnapshot; onOpen: (id: string) => void }) {
  const summaries = summarizeAll(snapshot, snapshot.viewer.userId);
  const openRequests = requestsForStaff(snapshot, snapshot.viewer.userId).filter((r) => r.status !== "completed").length;
  return (
    <div className="space-y-5">
      <PageTitle title="담당 환자" sub={FEATURES.WARD ? `${summaries.length}명 · 진행 중인 생활 요청 ${openRequests}건` : `${summaries.length}명`} />
      <PCard tone="ivory">
        <p className="text-xs leading-relaxed text-ink-soft">
          시연용 분류예요 (의료적 판정 아님). 검토 대상: 30일 평균 ≤ {TRIAGE_RULES.reviewAvgMax} 이고 {TRIAGE_RULES.reviewMinDays}일 이상 기록 · 기록 부족: 30일{" "}
          {TRIAGE_RULES.insufficientDays30}일 미만 또는 7일 {TRIAGE_RULES.insufficientDays7}일 미만 · 변화 확인: 7일 평균과 이전 평균 차이 ≥{" "}
          {TRIAGE_RULES.changeDelta}
        </p>
      </PCard>
      {summaries.length === 0 ? (
        <PCard>
          <p className="text-ink-soft">배정된 환자가 없어요. 관리자에게 담당 배정을 요청해 주세요.</p>
        </PCard>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="담당 환자 목록">
          {summaries.map((s) => (
            <li key={s.patient.id}>
              <PatientRow s={s} onOpen={() => onOpen(s.patient.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PatientRow({ s, onOpen }: { s: PatientSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${s.patient.name} 상세 보기`}
      className="w-full rounded-[1.75rem] border border-line bg-white p-5 text-left transition hover:border-brand-300 hover:bg-brand-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-bold text-ink">{s.patient.name}</p>
        {FEATURES.WARD && (
          <StatusPill tone="outline">
            {MODE_LABEL[s.patient.careMode]}
            {s.admission && s.admission.room !== "미입력" ? ` · ${roomLabel(s.admission.room)}` : ""}
          </StatusPill>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.flags.map((f) => (
          <StatusPill key={f} tone={FLAG_TONE[f]}>
            {TRIAGE_LABEL[f]}
          </StatusPill>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-ink-soft">30일 평균</dt>
          <dd className="font-bold text-ink">{s.avgCondition30 === null ? "—" : `${s.avgCondition30.toFixed(1)} / 5`}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">기록 일수</dt>
          <dd className="font-bold text-ink">{s.recordDays30} / 30일</dd>
        </div>
        <div>
          <dt className="text-ink-soft">진행 중 요청</dt>
          <dd className="font-bold text-ink">{s.openRequests}건</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-soft">
        마지막 기록 {s.lastRecordDate ? formatKoreanDate(s.lastRecordDate, false) : "없음"}
        {s.lastReview && ` · 검토: ${REVIEW_LABEL[s.lastReview.action]} (${formatDateTime(s.lastReview.createdAt)})`}
      </p>
    </button>
  );
}

function StaffPatientDetail({ snapshot, patientId, repo, onBack }: { snapshot: DbSnapshot; patientId: string; repo: SupabaseRepository; onBack: () => void }) {
  const patient = snapshot.patients.find((p) => p.id === patientId)!;
  const today = todayISO();
  const shared = questionsOf(snapshot, patientId); // RLS: 환자가 공유한 질문만 내려옴
  const reviews = reviewsOf(snapshot, patientId);
  const requests = requestsForStaff(snapshot, snapshot.viewer.userId)
    .filter((r) => r.patientId === patientId)
    .slice(0, 6);
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-10 items-center gap-0.5 rounded-xl px-2 text-ink-soft hover:bg-ivory-deep hover:text-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden /> 담당 환자 목록
      </button>
      <PatientRecordsView
        patient={patient}
        records={recordsOf(snapshot, patientId)}
        admissions={admissionsOf(snapshot, patientId)}
        today={today}
        readOnly
        title={`${patient.name} 님`}
        sub={`${FEATURES.WARD ? `${MODE_LABEL[patient.careMode]} 중 · ` : ""}다음 진료 ${patient.nextVisitDate ? formatKoreanDate(patient.nextVisitDate, false) : "미정"} · 기록은 환자 본인만 수정할 수 있어요`}
      />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <ReviewPanel patientId={patientId} reviews={reviews} repo={repo} />
        <div className="space-y-5">
          <PCard aria-labelledby="sq-title">
            <CardHeading id="sq-title" title="환자가 공유한 진료 질문" />
            {shared.length === 0 ? (
              <p className="text-sm text-ink-soft">공유된 질문이 없어요.</p>
            ) : (
              <ul className="space-y-2">
                {shared.map((q) => (
                  <li key={q.id} className={cn("rounded-2xl bg-ivory px-4 py-3 break-words", q.done && "text-ink-soft line-through")}>
                    {q.text}
                  </li>
                ))}
              </ul>
            )}
          </PCard>
          {FEATURES.WARD && requests.length > 0 && (
            <section aria-label="이 환자의 생활 요청" className="space-y-3">
              <h2 className="px-1 text-xl font-bold text-ink">생활 요청</h2>
              {requests.map((r) => (
                <StaffRequestItem key={r.id} request={r} repo={repo} />
              ))}
            </section>
          )}
        </div>
      </div>

      {FEATURES.WARD && patient.careMode === "inpatient" && <MealsSection snapshot={snapshot} patientId={patientId} readOnly />}
      <MedicationsView
        medications={medicationsOf(snapshot, patientId)}
        patientId={patientId}
        editable={false}
        title="복용 약"
        sub="환자가 기록한 약이에요. (식약처 정보 연동 전)"
      />
    </div>
  );
}

function ReviewPanel({ patientId, reviews, repo }: { patientId: string; reviews: DbSnapshot["reviews"]; repo: SupabaseRepository }) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const action = useAsyncAction();
  async function act(a: ReviewAction) {
    setSaved(null);
    const r = await action.run(() => repo.addStaffReview({ patientId, staffId: "", action: a, note }));
    if (r.ok) {
      setNote("");
      setSaved(`'${REVIEW_LABEL[a]}'(으)로 저장했어요.`);
    }
  }
  return (
    <PCard aria-labelledby="rv-title">
      <CardHeading id="rv-title" title="검토 상태" sub="시연용 검토 기록이에요. 응급 대응이나 진료 변경을 자동으로 결정하지 않아요." />
      <TextArea
        label="내부 메모 (선택)"
        value={note}
        maxLength={300}
        counter
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        placeholder="담당 의료진만 볼 수 있어요. 환자·보호자에게 보이지 않아요."
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <PButton size="md" icon={CheckCheck} disabled={action.pending} onClick={() => void act("checked")}>
          확인 완료
        </PButton>
        <PButton size="md" variant="secondary" icon={MessageSquareWarning} disabled={action.pending} onClick={() => void act("consult_needed")}>
          진료 상담 필요
        </PButton>
      </div>
      <Alert className="mt-3">{action.error}</Alert>
      <Notice className="mt-3">{saved}</Notice>
      <h3 className="mt-5 text-sm font-bold text-ink">검토 이력</h3>
      {reviews.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">아직 검토 기록이 없어요.</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label="검토 이력">
          {reviews.slice(0, 8).map((r) => (
            <li key={r.id} className="rounded-2xl bg-ivory px-4 py-3 text-sm">
              <span className="font-bold text-ink">{REVIEW_LABEL[r.action]}</span>
              <span className="text-ink-soft"> · {formatDateTime(r.createdAt)}</span>
              {r.note && <p className="mt-1 break-words text-ink-soft">내부 메모: {r.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </PCard>
  );
}

function StaffRequests({ snapshot, repo }: { snapshot: DbSnapshot; repo: SupabaseRepository }) {
  const [filter, setFilter] = useState<"open" | "done">("open");
  const all = requestsForStaff(snapshot, snapshot.viewer.userId);
  const list = all.filter((r) => (filter === "open" ? r.status !== "completed" : r.status === "completed")).slice(0, 40);
  return (
    <div className="space-y-5">
      <PageTitle title="생활 요청" sub="담당 환자의 요청만 보여요. 접수 → 직원 확인 → 처리 완료 순서로 처리해요." />
      <div className="max-w-sm">
        <Segmented
          ariaLabel="요청 상태"
          items={[
            {
              value: "open" as const,
              label: `진행 중 ${all.filter((r) => r.status !== "completed").length}`,
            },
            { value: "done" as const, label: "처리 완료" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {list.length === 0 ? (
        <PCard tone="ivory">
          <p className="text-ink-soft">{filter === "open" ? "진행 중인 요청이 없어요." : "처리 완료된 요청이 없어요."}</p>
        </PCard>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="생활 요청 목록">
          {list.map((r) => (
            <li key={r.id}>
              <StaffRequestItem request={r} repo={repo} patientName={snapshot.patients.find((p) => p.id === r.patientId)?.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffRequestItem({ request: r, repo, patientName }: { request: LifeRequest; repo: SupabaseRepository; patientName?: string }) {
  const action = useAsyncAction();
  const next = nextRequestStatus(r.status);
  return (
    <RequestCard
      request={r}
      patientName={patientName}
      action={
        next && (
          <>
            <PButton
              size="sm"
              className="w-full"
              disabled={action.pending}
              onClick={() => void action.run(() => repo.updateRequestStatus(r.id, r.status, next, ""))}
            >
              {action.pending ? "처리 중…" : next === "acknowledged" ? "직원 확인" : "처리 완료"}
            </PButton>
            {r.category === "meal_change" && next === "completed" && (
              <p className="mt-2 text-xs text-ink-soft">처리 완료하면 해당 끼니의 식사 형태가 바로 바뀌어요.</p>
            )}
            <Alert className="mt-2">{action.error}</Alert>
            <span className="sr-only">현재 상태 {REQUEST_STATUS_LABEL[r.status]}</span>
          </>
        )
      }
    />
  );
}
