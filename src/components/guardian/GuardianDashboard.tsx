"use client";

import { Activity, Eye, LineChart as LineChartIcon, Lock, NotebookText } from "lucide-react";
import { HealthChart } from "@/components/health/HealthChart";
import { MealTracker } from "@/components/inpatient/MealTracker";
import { RequestList } from "@/components/inpatient/LifeRequestPanel";
import { MedicationList } from "@/components/medication/MedicationList";
import { Badge, Card, DemoBadge, EmptyState, SectionTitle, StatTile } from "@/components/ui/primitives";
import { summarizeRecent } from "@/components/dashboard/VisitPrep";
import { formatKoreanDate, todayISO } from "@/lib/date";
import { CONDITION_FACE, MODE_LABEL, SCOPE_LABEL } from "@/lib/labels";
import { currentAdmission, grantedPatients, grantedScopes, mealsOn, medicationsOf, recordsOf, requestsOf } from "@/lib/selectors";
import type { AccessScope, CareLogData } from "@/types";

/**
 * 보호자 화면 — 승인(AccessGrant)된 가상 환자 정보만 조회 전용으로 표시합니다.
 * ⚠️ 프론트엔드 필터링일 뿐 실제 보안 기능이 아닙니다. 실제 서비스에서는 서버(RLS)에서 강제해야 합니다.
 */
export function GuardianDashboard({ data, guardianId }: { data: CareLogData; guardianId: string }) {
  const guardian = data.users.find((u) => u.id === guardianId);
  const patients = grantedPatients(data, guardianId);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 p-5 text-white shadow-md sm:p-6">
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">데모 보호자 계정 · 조회 전용</span>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">보호자 화면</h1>
        <p className="mt-1 text-sm text-white/90">
          {guardian?.name} ({guardian?.relation}) · 승인된 환자 {patients.length}명
        </p>
      </div>

      <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Lock className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          환자가 허용한 정보만 보이는 구조를 <strong>시연</strong>합니다. 현재는 실제 로그인·권한 검증이 없는 프로토타입이며, 보안
          기능이 구현된 서비스가 아닙니다.
        </p>
      </div>

      {patients.length === 0 && <EmptyState>승인된 환자가 없습니다.</EmptyState>}

      {patients.map((p) => {
        const scopes = grantedScopes(data, guardianId, p.id);
        const can = (s: AccessScope) => scopes.includes(s);
        const records = recordsOf(data, p.id);
        const latest = records.at(-1);
        const s7 = summarizeRecent(records, 7);
        const inpatient = p.careMode === "inpatient";
        const admission = currentAdmission(data, p.id);
        return (
          <div key={p.id} className="space-y-5">
            <Card>
              <SectionTitle icon={Eye} title={p.name} subtitle={`${p.department} · ${MODE_LABEL[p.careMode]} 중${inpatient && admission ? ` · ${admission.ward} ${admission.room}` : ""}`} action={<DemoBadge />} />
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                허용된 정보:
                {scopes.map((s) => (
                  <Badge key={s} tone="teal">
                    {SCOPE_LABEL[s]}
                  </Badge>
                ))}
              </div>
            </Card>

            {can("records") && (
              <div className="grid gap-5 lg:grid-cols-5">
                <Card className="lg:col-span-2">
                  <SectionTitle icon={Activity} title="최근 컨디션" />
                  {latest ? (
                    <>
                      <div className="rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 p-4">
                        <div className="text-sm text-slate-500">{formatKoreanDate(latest.date)} 기록{latest.date === todayISO() && " (오늘)"}</div>
                        <div className="text-3xl font-extrabold text-slate-900">
                          {latest.condition}점 <span className="text-lg font-semibold text-slate-500">{CONDITION_FACE[latest.condition]}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <StatTile label="7일 기록" value={s7.count} unit="일" />
                        <StatTile label="평균 컨디션" value={s7.avgCondition} />
                        <StatTile label="평균 통증" value={s7.avgPain} />
                      </div>
                    </>
                  ) : (
                    <EmptyState>기록이 없습니다.</EmptyState>
                  )}
                </Card>
                <Card className="lg:col-span-3">
                  <SectionTitle icon={LineChartIcon} title="최근 7일 컨디션" />
                  <HealthChart records={records} days={7} conditionOnly showRangeToggle={false} />
                </Card>
                <Card className="lg:col-span-5">
                  <SectionTitle icon={NotebookText} title="최근 건강기록 요약" />
                  <ul className="divide-y divide-slate-100">
                    {[...records].reverse().slice(0, 5).map((r) => (
                      <li key={r.id} className="py-2.5 text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">{formatKoreanDate(r.date)}</span> · 컨디션 {r.condition} · 통증 {r.pain} · 수면{" "}
                        {r.sleep}
                        {r.symptoms.length > 0 && ` · 증상: ${r.symptoms.join(", ")}`}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {can("medications") && (
              <MedicationList medications={medicationsOf(data, p.id, "guardian")} title="허용된 약 정보" subtitle="환자가 공개를 허용한 약만 표시" />
            )}

            {inpatient && can("meals") && <MealTracker patientId={p.id} date={todayISO()} meals={mealsOn(data, p.id, todayISO())} readOnly />}
            {inpatient && can("requests") && (
              <RequestList title="생활 요청 처리 상태" requests={requestsOf(data, p.id)} empty="생활 요청이 없습니다." />
            )}
            {!inpatient && (
              <p className="text-center text-sm text-slate-500">
                입원 중 식사·생활 요청 정보는 환자가 입원 모드일 때 표시됩니다. (환자 화면에서 입원 모드로 전환해 보세요)
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
