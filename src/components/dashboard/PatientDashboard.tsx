"use client";

import {
  BedDouble,
  CalendarCheck,
  ChevronRight,
  ClipboardPen,
  HandHelping,
  History,
  Home,
  Hospital,
  LineChart as LineChartIcon,
  Pencil,
  Pill,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { NextVisitBadge, VisitPrep } from "@/components/dashboard/VisitPrep";
import { ConditionForm } from "@/components/health/ConditionForm";
import { HealthChart } from "@/components/health/HealthChart";
import { HealthHistory } from "@/components/health/HealthHistory";
import { NonEmergencyNotice } from "@/components/layout/AppHeader";
import { LifeRequestPanel } from "@/components/inpatient/LifeRequestPanel";
import { MealTracker } from "@/components/inpatient/MealTracker";
import { RequestStatusSteps } from "@/components/inpatient/RequestStatusSteps";
import { MedicationList } from "@/components/medication/MedicationList";
import { Badge, Button, Card, cn, DemoBadge, EmptyState, ErrorText, SectionTitle } from "@/components/ui/primitives";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { repository } from "@/hooks/useCareLog";
import { formatKoreanDate, todayISO } from "@/lib/date";
import { CONDITION_FACE, MEAL_INTAKE_LABEL, MODE_LABEL, REQUEST_CATEGORY_LABEL } from "@/lib/labels";
import { currentAdmission, mealsOn, medicationsOf, questionsOf, recordOn, recordsOf, requestsOf } from "@/lib/selectors";
import type { Admission, CareLogData, CareMode, Patient } from "@/types";

type TabKey = "home" | "history" | "meds" | "visit" | "meals" | "requests";

const TABS: Record<CareMode, { key: TabKey; label: string; icon: LucideIcon }[]> = {
  outpatient: [
    { key: "home", label: "홈", icon: Home },
    { key: "history", label: "건강기록", icon: History },
    { key: "meds", label: "내 약", icon: Pill },
    { key: "visit", label: "진료 준비", icon: CalendarCheck },
  ],
  inpatient: [
    { key: "home", label: "홈", icon: Home },
    { key: "meals", label: "식사", icon: UtensilsCrossed },
    { key: "requests", label: "생활 요청", icon: HandHelping },
    { key: "history", label: "건강기록", icon: History },
    { key: "meds", label: "내 약", icon: Pill },
  ],
};

export function PatientDashboard({ data, patient }: { data: CareLogData; patient: Patient }) {
  const [tab, setTab] = useState<TabKey>("home");
  const mode = patient.careMode;
  const tabs = TABS[mode];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "home";
  const admission = currentAdmission(data, patient.id);
  const modeAction = useAsyncAction();

  const changeMode = (m: CareMode) => {
    if (m === patient.careMode) return;
    setTab("home");
    void modeAction.run(() => repository.setCareMode(patient.id, m));
  };

  return (
    <div className="space-y-5">
      <PatientHero patient={patient} admission={admission} onModeChange={changeMode} />
      <ErrorText>{modeAction.error}</ErrorText>

      <nav
        aria-label="환자 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:rounded-2xl md:border md:p-1.5 md:shadow-sm"
      >
        <ul className={cn("mx-auto grid max-w-lg md:max-w-none", mode === "inpatient" ? "grid-cols-5" : "grid-cols-4")}>
          {tabs.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                aria-current={activeTab === key ? "page" : undefined}
                onClick={() => {
                  setTab(key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 py-2 text-xs font-semibold transition md:flex-row md:justify-center md:gap-2 md:rounded-xl md:py-2.5 md:text-base",
                  activeTab === key ? "text-teal-600 md:bg-teal-50" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-6 w-6 md:h-5 md:w-5" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {activeTab === "home" && <PatientHome data={data} patient={patient} admission={admission} goTo={setTab} />}
      {activeTab === "history" && <HealthHistory patient={patient} admission={admission} records={recordsOf(data, patient.id)} />}
      {activeTab === "meds" && <MedicationList medications={medicationsOf(data, patient.id)} />}
      {activeTab === "visit" && (
        <VisitPrep patient={patient} records={recordsOf(data, patient.id)} questions={questionsOf(data, patient.id)} />
      )}
      {activeTab === "meals" && (
        <>
          <MealTracker patientId={patient.id} date={todayISO()} meals={mealsOn(data, patient.id, todayISO())} />
          <NonEmergencyNotice />
        </>
      )}
      {activeTab === "requests" && (
        <>
          <NonEmergencyNotice />
          <LifeRequestPanel patientId={patient.id} requests={requestsOf(data, patient.id)} />
        </>
      )}
    </div>
  );
}

function PatientHero({
  patient,
  admission,
  onModeChange,
}: {
  patient: Patient;
  admission?: Admission;
  onModeChange: (m: CareMode) => void;
}) {
  const inpatient = patient.careMode === "inpatient";
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 to-sky-600 p-5 text-white shadow-md sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">데모 환자 계정</span>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">{patient.department}</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{patient.name}님, 안녕하세요</h1>
          <p className="mt-1 text-sm text-white/90 sm:text-base">
            {formatKoreanDate(todayISO())} ·{" "}
            {inpatient ? (
              <>
                {admission ? `${admission.ward} ${admission.room} 입원 중` : "입원 중"}
                {admission && ` (입원일 ${formatKoreanDate(admission.admittedOn, false)})`}
              </>
            ) : (
              <>
                다음 진료 <NextVisitBadgeLight date={patient.nextVisitDate} />
              </>
            )}
          </p>
        </div>
        <div className="shrink-0">
          <div className="mb-1 text-xs font-semibold text-white/80">이용 모드</div>
          <div role="radiogroup" aria-label="이용 모드" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/15 p-1">
            {(["outpatient", "inpatient"] as CareMode[]).map((m) => {
              const Icon = m === "outpatient" ? Hospital : BedDouble;
              const active = patient.careMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onModeChange(m)}
                  className={cn(
                    "flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold transition",
                    active ? "bg-white text-teal-700 shadow" : "text-white hover:bg-white/10",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {MODE_LABEL[m]} 모드
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 max-w-72 text-[11px] leading-snug text-white/85">
            입원 모드는 <strong>환자 자기기록 모드</strong>이며 병원의 공식 입원 확인이 아닙니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function NextVisitBadgeLight({ date }: { date?: string }) {
  return (
    <span className="font-semibold">
      <NextVisitBadge date={date} light />
    </span>
  );
}

function PatientHome({
  data,
  patient,
  admission,
  goTo,
}: {
  data: CareLogData;
  patient: Patient;
  admission?: Admission;
  goTo: (t: TabKey) => void;
}) {
  const today = todayISO();
  const todayRecord = recordOn(data, patient.id, today);
  const [editing, setEditing] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const records = recordsOf(data, patient.id);
  const inpatient = patient.careMode === "inpatient";
  const showForm = !todayRecord || editing;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <Card>
          <SectionTitle
            icon={ClipboardPen}
            title="오늘의 컨디션 기록"
            subtitle={`${formatKoreanDate(today)} · ${MODE_LABEL[patient.careMode]} 중 기록`}
            action={
              todayRecord && !editing ? (
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                  수정
                </Button>
              ) : undefined
            }
          />
          {showForm ? (
            <ConditionForm
              key={`${today}-${formVersion}`}
              patientId={patient.id}
              date={today}
              mode={patient.careMode}
              existing={todayRecord}
              onSaved={() => {
                setFormVersion((v) => v + 1);
                setEditing(false);
              }}
            />
          ) : (
            todayRecord && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="컨디션" value={`${todayRecord.condition}점`} hint={CONDITION_FACE[todayRecord.condition]} />
                <MiniStat label="통증" value={`${todayRecord.pain}/10`} />
                <MiniStat label="수면" value={`${todayRecord.sleep}/5`} />
                <MiniStat label="식사량" value={MEAL_INTAKE_LABEL[todayRecord.mealIntake]} />
                {(todayRecord.symptoms.length > 0 || todayRecord.memo) && (
                  <p className="col-span-full rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    {todayRecord.symptoms.length > 0 && <>증상: {todayRecord.symptoms.join(", ")} </>}
                    {todayRecord.memo && <>· 메모: {todayRecord.memo}</>}
                  </p>
                )}
                <p className="col-span-full text-sm font-semibold text-teal-700">오늘 기록을 완료했어요</p>
              </div>
            )
          )}
        </Card>

        <Card>
          <SectionTitle
            icon={LineChartIcon}
            title="건강 변화 그래프"
            subtitle={inpatient ? "통원 기록부터 입원 기록까지 이어서 보기" : "최근 건강 상태"}
            action={<DemoBadge />}
          />
          <HealthChart records={records} admissionDate={inpatient ? admission?.admittedOn : undefined} />
          <button type="button" onClick={() => goTo("history")} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
            전체 기록·달력 보기 <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </Card>
      </div>

      <div className="space-y-5 lg:col-span-2">
        {inpatient ? <InpatientShortcuts data={data} patient={patient} goTo={goTo} /> : <OutpatientShortcuts data={data} patient={patient} goTo={goTo} />}
        <MedicationList medications={medicationsOf(data, patient.id)} compact subtitle="오늘 복용할 약" />
        {inpatient && <NonEmergencyNotice />}
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-teal-50/60 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function OutpatientShortcuts({ data, patient, goTo }: { data: CareLogData; patient: Patient; goTo: (t: TabKey) => void }) {
  const questions = questionsOf(data, patient.id).filter((q) => !q.done);
  return (
    <Card>
      <SectionTitle icon={CalendarCheck} title="진료 준비" />
      <div className="rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 p-4">
        <div className="text-sm text-slate-500">다음 진료일</div>
        <div className="text-lg font-bold text-slate-800">
          <NextVisitBadge date={patient.nextVisitDate} />
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-600">
        물어볼 질문 <strong className="text-slate-900">{questions.length}개</strong>
        {questions[0] && <p className="mt-1 truncate text-slate-500">· {questions[0].text}</p>}
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={() => goTo("visit")}>
        진료 준비 열기
      </Button>
    </Card>
  );
}

function InpatientShortcuts({ data, patient, goTo }: { data: CareLogData; patient: Patient; goTo: (t: TabKey) => void }) {
  const meals = mealsOn(data, patient.id, todayISO());
  const active = requestsOf(data, patient.id).filter((r) => r.status !== "completed");
  return (
    <>
      <Card>
        <SectionTitle icon={UtensilsCrossed} title="오늘의 식사" />
        <ul className="space-y-2">
          {meals.map((m) => (
            <li key={m.slot} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 text-sm">
              <span className="font-bold text-slate-800">{m.slot === "breakfast" ? "아침" : m.slot === "lunch" ? "점심" : "저녁"}</span>
              <span className="truncate px-2 text-slate-500">{m.menu.slice(0, 3).join(", ")}</span>
              <Badge tone={m.log?.intake !== undefined ? "teal" : "slate"}>
                {m.log?.intake !== undefined ? MEAL_INTAKE_LABEL[m.log.intake] : "미기록"}
              </Badge>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => goTo("meals")}>
          식사 기록·변경 요청
        </Button>
      </Card>
      <Card>
        <SectionTitle icon={HandHelping} title="생활 요청" subtitle={`진행 중 ${active.length}건`} />
        {active.length === 0 ? (
          <EmptyState>진행 중인 요청이 없습니다.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {active.slice(0, 3).map((r) => (
              <li key={r.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="mb-1.5 text-sm font-bold text-slate-800">{REQUEST_CATEGORY_LABEL[r.category]}</div>
                <RequestStatusSteps status={r.status} />
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-4 w-full" onClick={() => goTo("requests")}>
          새 요청 보내기
        </Button>
      </Card>
    </>
  );
}
