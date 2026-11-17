"use client";

import { HeartHandshake } from "lucide-react";
import { useState } from "react";
import { MealsSection, RequestCard } from "@/components/patient-db/CareSections";
import { MedicationsView } from "@/components/patient-db/MedicationsView";
import { ConditionTrend } from "@/components/patient-db/PatientRecordsView";
import { AppShell, PageTitle, type ShellTab } from "@/components/patient-ui/AppShell";
import { CardHeading, PCard, Segmented, StatusPill } from "@/components/patient-ui/kit";
import { CONDITION_WORD, SLEEP_WORD } from "@/components/patient-ui/labels";
import { useDbApp } from "@/hooks/useDbApp";
import { formatKoreanDate, formatKoreanTime, todayISO } from "@/lib/date";
import { currentAdmission } from "@/lib/domain/admissions";
import { MODE_LABEL, SCOPE_LABEL } from "@/lib/labels";
import type { DbSnapshot } from "@/lib/repository/supabase";
import { medicationsOf, recordsOf, requestsOf } from "@/lib/selectors";
import type { AccessScope, HealthRecord, Patient } from "@/types";

type Tab = "home";
const TABS: ShellTab<Tab>[] = [{ id: "home", label: "안부", icon: HeartHandshake }];

/**
 * 로그인 버전 — 보호자 (읽기 전용)
 * 보이는 환자·항목은 환자가 공유한 범위만: 화면 숨김이 아니라 DB(RLS)가 조회 결과에서 제외
 */
export function GuardianApp() {
  const { repo, snapshot, loadState, ready, logout } = useDbApp("guardian");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <AppShell
      tabs={TABS}
      active="home"
      onTab={() => {}}
      roleLabel="보호자"
      userLabel={snapshot?.viewer.displayName || undefined}
      onLogout={() => void logout()}
      loadState={loadState}
      onRetry={() => void repo?.load()}
      ready={ready}
    >
      {ready && snapshot && <GuardianHome snapshot={snapshot} selected={selected} onSelect={setSelected} />}
    </AppShell>
  );
}

function GuardianHome({ snapshot, selected, onSelect }: { snapshot: DbSnapshot; selected: string | null; onSelect: (id: string) => void }) {
  const patients = snapshot.patients;
  if (patients.length === 0) {
    return (
      <div className="space-y-5">
        <PageTitle title="안부" />
        <PCard>
          <p className="font-bold text-ink">공유받은 정보가 없어요.</p>
          <p className="mt-2 text-sm text-ink-soft">환자에게 받은 초대 링크를 이 계정으로 열어 수락해 주세요. 공유가 철회되면 여기에서 더 이상 보이지 않아요.</p>
        </PCard>
      </div>
    );
  }
  const patient = patients.find((p) => p.id === selected) ?? patients[0];
  const grant = snapshot.grants.find((g) => g.patientId === patient.id && g.granteeId === snapshot.viewer.userId && !g.revokedAt);
  const scopes = grant?.scopes ?? [];
  return (
    <div className="space-y-6">
      {patients.length > 1 && (
        <Segmented ariaLabel="환자 선택" items={patients.map((p) => ({ value: p.id, label: p.name }))} value={patient.id} onChange={onSelect} />
      )}
      <GuardianPatient snapshot={snapshot} patient={patient} scopes={scopes} />
    </div>
  );
}

function GuardianPatient({ snapshot, patient, scopes }: { snapshot: DbSnapshot; patient: Patient; scopes: AccessScope[] }) {
  const today = todayISO();
  const has = (s: AccessScope) => scopes.includes(s);
  const records = recordsOf(snapshot, patient.id);
  const admission = currentAdmission(snapshot, patient.id);
  const requests = requestsOf(snapshot, patient.id).slice(0, 8);
  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-3xl">{patient.name} 님의 안부</h1>
          <StatusPill tone="outline">
            {MODE_LABEL[patient.careMode]} 중{admission && admission.room !== "미입력" ? ` · ${admission.room}호` : ""}
          </StatusPill>
        </div>
        <p className="mt-2 text-sm text-ink-soft">공유받은 항목: {scopes.length ? scopes.map((s) => SCOPE_LABEL[s]).join(" · ") : "없음"} · 읽기 전용</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          {has("records") ? (
            <>
              <LatestCheckIn records={records} today={today} />
              <ConditionTrend byDate={new Map(records.map((r) => [r.date, r]))} today={today} range={7} />
            </>
          ) : (
            <PCard tone="ivory">
              <p className="text-ink-soft">건강기록은 공유되지 않았어요.</p>
            </PCard>
          )}
        </div>
        <div className="space-y-5">
          {has("requests") && (
            <section aria-labelledby="g-req" className="space-y-3">
              <h2 id="g-req" className="px-1 text-xl font-bold text-ink">
                생활 요청
              </h2>
              {requests.length === 0 ? (
                <PCard tone="ivory">
                  <p className="text-sm text-ink-soft">남긴 요청이 없어요.</p>
                </PCard>
              ) : (
                requests.map((r) => <RequestCard key={r.id} request={r} />)
              )}
            </section>
          )}
        </div>
      </div>

      {has("meals") && patient.careMode === "inpatient" && <MealsSection snapshot={snapshot} patientId={patient.id} readOnly />}
      {has("medications") && (
        <MedicationsView
          medications={medicationsOf(snapshot, patient.id, "guardian")}
          patientId={patient.id}
          editable={false}
          title="공개된 약"
          sub="환자가 보호자에게 공개를 허용한 약만 보여요."
        />
      )}
    </div>
  );
}

/** 최근 안부: 그래프보다 먼저, 기록 시각과 함께 */
function LatestCheckIn({ records, today }: { records: HealthRecord[]; today: string }) {
  const todayRecord = records.find((r) => r.date === today);
  const last = [...records].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!todayRecord) {
    return (
      <PCard tone="ivory" aria-label="최근 안부">
        <p className="text-lg font-bold text-ink">오늘 남긴 안부가 없어요</p>
        <p className="mt-1 text-sm text-ink-soft">
          {last ? `마지막 기록: ${formatKoreanDate(last.date, false)} ${formatKoreanTime(last.updatedAt)}` : "아직 남긴 기록이 없어요."}
        </p>
        {last && <CheckInBody r={last} />}
      </PCard>
    );
  }
  return (
    <PCard tone="tint" aria-label="최근 안부">
      <CardHeading title={`오늘 ${formatKoreanTime(todayRecord.updatedAt)}에 남긴 안부`} />
      <CheckInBody r={todayRecord} />
    </PCard>
  );
}

function CheckInBody({ r }: { r: HealthRecord }) {
  return (
    <div className="mt-3">
      <p className="text-[1.6rem] font-extrabold text-sage-700">{CONDITION_WORD[r.condition]}</p>
      <p className="mt-1 text-sm font-bold text-ink">
        통증 {r.pain}점 · 피로 {r.fatigue}점 · 수면 {SLEEP_WORD[r.sleep]}
        {r.symptoms.length > 0 && ` · ${r.symptoms.join(", ")}`}
      </p>
      {r.memo && <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 break-words text-ink">{r.memo}</p>}
    </div>
  );
}
