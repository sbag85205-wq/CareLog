"use client";

import {
  BedDouble,
  CheckCheck,
  ClipboardList,
  HandHelping,
  Info,
  MessageSquareWarning,
  Stethoscope,
  Users,
} from "lucide-react";
import { useState } from "react";
import { HealthChart } from "@/components/health/HealthChart";
import { REQUEST_ICON } from "@/components/inpatient/LifeRequestPanel";
import { RequestStatusSteps } from "@/components/inpatient/RequestStatusSteps";
import { TriageBadge } from "@/components/medical-staff/TriageBadge";
import { Badge, Button, Card, cn, DemoBadge, EmptyState, ErrorText, SectionTitle, Sheet, StatTile } from "@/components/ui/primitives";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { repository } from "@/hooks/useCareLog";
import { nextRequestStatus } from "@/lib/domain/request-status";
import { formatDateTime, formatKoreanDate, formatShortDate } from "@/lib/date";
import { CONDITION_FACE, MODE_LABEL, REQUEST_CATEGORY_LABEL } from "@/lib/labels";
import { currentAdmission, patientById, recordsOf, requestsForStaff, reviewsOf } from "@/lib/selectors";
import { summarizeAll, TRIAGE_RULES } from "@/lib/triage";
import type { CareLogData, LifeRequest, PatientSummary, ReviewAction, TriageFlag } from "@/types";

const FILTERS: { key: TriageFlag | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "review", label: "검토 대상" },
  { key: "change", label: "변화 확인" },
  { key: "insufficient", label: "기록 부족" },
];

export function StaffDashboard({ data, staffId }: { data: CareLogData; staffId: string }) {
  const summaries = summarizeAll(data, staffId);
  const [filter, setFilter] = useState<TriageFlag | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const staff = data.users.find((u) => u.id === staffId);
  const count = (f: TriageFlag) => summaries.filter((s) => s.flags.includes(f)).length;
  // 담당 환자의 요청만 (화면 필터 — DB 전환 후 RLS로 서버에서도 차단 필요)
  const openRequests = requestsForStaff(data, staffId).filter((r) => r.status !== "completed").length;
  const shown = filter === "all" ? summaries : summaries.filter((s) => s.flags.includes(filter));
  const selected = summaries.find((s) => s.patient.id === selectedId);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-teal-500 p-5 text-white shadow-md sm:p-6">
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">데모 의료진 계정</span>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">의료진 대시보드</h1>
        <p className="mt-1 text-sm text-white/90">{staff?.name} · 담당 가상 환자 {summaries.length}명</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile icon={Users} label="담당 환자" value={summaries.length} unit="명" />
        <StatTile icon={MessageSquareWarning} label="검토 대상" value={count("review")} unit="명" />
        <StatTile icon={ClipboardList} label="변화 확인" value={count("change")} unit="명" />
        <StatTile icon={Info} label="기록 부족" value={count("insufficient")} unit="명" />
        <StatTile icon={HandHelping} label="미처리 생활 요청" value={openRequests} unit="건" />
      </div>

      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Info className="h-5 w-5 shrink-0" aria-hidden />
        <div>
          <strong>분류 기준은 개발 시연용이며 의료적으로 검증된 위험 판정이 아닙니다.</strong> 점수만으로 응급 대응이나 진료
          변경을 자동 결정하지 않으며, 의료진이 기록을 직접 확인해야 합니다.
          <ul className="mt-1 list-disc pl-5 text-amber-800">
            <li>검토 대상: 최근 30일 평균 컨디션 ≤ {TRIAGE_RULES.reviewAvgMax.toFixed(1)} 이고 기록 {TRIAGE_RULES.reviewMinDays}일 이상</li>
            <li>기록 부족: 최근 30일 기록 {TRIAGE_RULES.insufficientDays30}일 미만 또는 최근 7일 기록 {TRIAGE_RULES.insufficientDays7}일 미만</li>
            <li>변화 확인: 최근 7일 평균과 이전(8~30일) 평균의 차이 ≥ {TRIAGE_RULES.changeDelta}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionTitle icon={Stethoscope} title="담당 환자 목록" subtitle="환자를 누르면 기록과 그래프를 확인할 수 있어요" action={<DemoBadge />} />
          <div role="group" aria-label="분류 필터" className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1",
                  filter === f.key ? "bg-teal-500 text-white ring-teal-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {f.label}
                {f.key !== "all" && ` ${count(f.key)}`}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState>해당 분류의 환자가 없습니다.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {shown.map((s) => (
                <PatientRow key={s.patient.id} s={s} onOpen={() => setSelectedId(s.patient.id)} />
              ))}
            </ul>
          )}
        </Card>

        <div className="xl:col-span-2">
          <RequestQueue data={data} staffId={staffId} />
        </div>
      </div>

      <Sheet open={!!selected} title={selected ? `${selected.patient.name} 기록 검토` : ""} onClose={() => setSelectedId(null)}>
        {selected && <PatientDetail data={data} s={selected} staffId={staffId} />}
      </Sheet>
    </div>
  );
}

function PatientRow({ s, onOpen }: { s: PatientSummary; onOpen: () => void }) {
  const age = new Date().getFullYear() - s.patient.birthYear;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left transition hover:border-teal-300 hover:shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-900">{s.patient.name}</span>
            <span className="text-sm text-slate-500">
              {s.patient.gender === "F" ? "여" : "남"} · {age}세
            </span>
            <Badge tone={s.patient.careMode === "inpatient" ? "blue" : "teal"} icon={s.patient.careMode === "inpatient" ? BedDouble : undefined}>
              {MODE_LABEL[s.patient.careMode]}
              {s.patient.careMode === "inpatient" && s.admission && ` ${s.admission.room}`}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.flags.map((f) => (
              <TriageBadge key={f} flag={f} />
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500">30일 평균 컨디션</div>
            <div className="font-bold text-slate-900">{s.avgCondition30?.toFixed(1) ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">실제 기록 일수</div>
            <div className="font-bold text-slate-900">{s.recordDays30}일 / 30</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">최근 기록</div>
            <div className="font-bold text-slate-900">{s.lastRecordDate ? formatShortDate(s.lastRecordDate) : "-"}</div>
          </div>
        </div>
        {(s.lastReview || s.openRequests > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.lastReview && (
              <Badge tone={s.lastReview.action === "checked" ? "teal" : "violet"} icon={CheckCheck}>
                {s.lastReview.action === "checked" ? "확인 완료" : "진료 상담 필요"} · {formatDateTime(s.lastReview.createdAt)}
              </Badge>
            )}
            {s.openRequests > 0 && <Badge tone="blue">생활 요청 {s.openRequests}건</Badge>}
          </div>
        )}
      </button>
    </li>
  );
}

function PatientDetail({ data, s, staffId }: { data: CareLogData; s: PatientSummary; staffId: string }) {
  const [note, setNote] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const review = useAsyncAction();
  const records = recordsOf(data, s.patient.id);
  const recent = [...records].reverse().slice(0, 7);
  const reviews = reviewsOf(data, s.patient.id);

  async function act(action: ReviewAction) {
    setSavedMsg("");
    const res = await review.run(() =>
      repository.addStaffReview({ patientId: s.patient.id, staffId, action, note: note.trim() }),
    );
    if (!res.ok) return;
    setNote("");
    setSavedMsg(action === "checked" ? "‘확인 완료’로 기록했습니다 (데모)" : "‘진료 상담 필요’로 기록했습니다 (데모)");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {s.flags.map((f) => (
          <TriageBadge key={f} flag={f} />
        ))}
        <DemoBadge />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="30일 평균" value={s.avgCondition30?.toFixed(1) ?? "-"} unit="/5" />
        <StatTile label="최근 7일 평균" value={s.avgCondition7?.toFixed(1) ?? "-"} unit="/5" />
        <StatTile label="기록 일수" value={s.recordDays30} unit="/30일" />
        <StatTile label="이용 모드" value={MODE_LABEL[s.patient.careMode]} hint={s.patient.careMode === "inpatient" && s.admission ? `${s.admission.ward} ${s.admission.room} (자기기록)` : undefined} />
      </div>

      <div>
        <h3 className="mb-2 font-bold text-slate-800">최근 30일 컨디션 변화</h3>
        <HealthChart records={records} days={30} admissionDate={s.patient.careMode === "inpatient" ? s.admission?.admittedOn : undefined} />
      </div>

      <div>
        <h3 className="mb-2 font-bold text-slate-800">최근 기록</h3>
        {recent.length === 0 ? (
          <EmptyState>기록이 없습니다.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm">
                <span className="font-semibold text-slate-800">{formatKoreanDate(r.date)}</span>{" "}
                <Badge tone={r.recordedIn === "inpatient" ? "blue" : "teal"}>{MODE_LABEL[r.recordedIn]}</Badge>
                <div className="text-slate-600">
                  컨디션 {r.condition}({CONDITION_FACE[r.condition]}) · 통증 {r.pain} · 수면 {r.sleep}
                  {r.symptoms.length > 0 && ` · ${r.symptoms.join(", ")}`}
                  {r.memo && ` · ${r.memo}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-slate-50 p-4">
        <h3 className="mb-2 font-bold text-slate-800">후속 조치 (시연)</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="검토 메모 (선택)"
          className="w-full rounded-2xl border-2 border-slate-200 bg-white p-3 text-base outline-none focus:border-teal-400"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button icon={CheckCheck} disabled={review.pending} onClick={() => void act("checked")}>
            확인 완료
          </Button>
          <Button variant="secondary" icon={MessageSquareWarning} disabled={review.pending} onClick={() => void act("consult_needed")}>
            진료 상담 필요
          </Button>
        </div>
        <ErrorText className="mt-2">{review.error}</ErrorText>
        {savedMsg && <p className="mt-2 text-sm font-semibold text-teal-700" aria-live="polite">{savedMsg}</p>}
        <p className="mt-2 text-xs text-slate-500">후속 조치는 기록용이며 진료 일정이나 응급 대응을 자동으로 변경하지 않습니다.</p>
        {reviews.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {reviews.map((r) => (
              <li key={r.id}>
                · {formatDateTime(r.createdAt)} — <strong>{r.action === "checked" ? "확인 완료" : "진료 상담 필요"}</strong>
                {r.note && ` · ${r.note}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RequestQueue({ data, staffId }: { data: CareLogData; staffId: string }) {
  // 담당 환자의 요청만 표시 (화면 필터 — DB 전환 후 RLS로 서버에서도 차단 필요)
  const all = requestsForStaff(data, staffId);
  const open = all.filter((r) => r.status !== "completed");
  const done = all.filter((r) => r.status === "completed").slice(0, 5);

  return (
    <Card>
      <SectionTitle icon={HandHelping} title="입원 환자 생활 요청" subtitle={`담당 환자 · 미처리 ${open.length}건`} action={<DemoBadge />} />
      {open.length === 0 ? (
        <EmptyState>미처리 요청이 없습니다.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {open.map((r) => (
            <RequestQueueItem key={r.id} data={data} request={r} staffId={staffId} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-slate-500">최근 처리 완료</h3>
          <ul className="space-y-1 text-sm text-slate-500">
            {done.map((r) => (
              <li key={r.id} className="truncate">
                ✓ {patientById(data, r.patientId)?.name} · {REQUEST_CATEGORY_LABEL[r.category]} · {formatDateTime(r.updatedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RequestQueueItem({ data, request: r, staffId }: { data: CareLogData; request: LifeRequest; staffId: string }) {
  const action = useAsyncAction();
  const p = patientById(data, r.patientId);
  const room = currentAdmission(data, r.patientId)?.room;
  const Icon = REQUEST_ICON[r.category];
  const next = nextRequestStatus(r.status);

  const advance = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 더블클릭의 두 번째 클릭은 무시 — 바뀐 버튼("처리 완료")이 연달아 눌리는 것을 방지
    if (e.detail > 1 || !next) return;
    void action.run(() => repository.updateRequestStatus(r.id, r.status, next, staffId));
  };

  return (
    <li className="rounded-2xl border border-slate-100 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-bold text-slate-900">{REQUEST_CATEGORY_LABEL[r.category]}</span>
            <span className="text-slate-500">
              {p?.name} {room && `· ${room}`}
            </span>
          </div>
          <p className="text-sm text-slate-600">{r.detail}</p>
          <p className="text-xs text-slate-400">{formatDateTime(r.createdAt)} 접수</p>
          <div className="mt-2 overflow-x-auto">
            <RequestStatusSteps status={r.status} />
          </div>
          <ErrorText className="mt-2">{action.error}</ErrorText>
          <div className="mt-3">
            {next === "acknowledged" ? (
              <Button size="sm" variant="secondary" disabled={action.pending} onClick={advance}>
                직원 확인
              </Button>
            ) : next === "completed" ? (
              <Button size="sm" disabled={action.pending} onClick={advance}>
                처리 완료{r.mealChange ? " (식사 형태 반영)" : ""}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
