"use client";

import { CalendarDays, LineChart as LineChartIcon, Pencil } from "lucide-react";
import { useState } from "react";
import { ConditionForm } from "@/components/health/ConditionForm";
import { HealthChart } from "@/components/health/HealthChart";
import { Badge, Card, cn, DemoBadge, SectionTitle, Sheet } from "@/components/ui/primitives";
import { formatKoreanDate, lastNDates, todayISO, weekdayOf } from "@/lib/date";
import { CONDITION_FACE, DIGESTION_LABEL, MEAL_INTAKE_LABEL, MODE_LABEL } from "@/lib/labels";
import type { HealthRecord, Patient } from "@/types";

const CONDITION_BG = ["", "bg-sky-100", "bg-sky-200", "bg-sky-300", "bg-sky-500 text-white", "bg-sky-700 text-white"];

interface Props {
  patient: Patient;
  records: HealthRecord[];
  /** 수정 가능 여부 (환자 본인만) */
  editable?: boolean;
}

/** 건강기록 조회: 그래프 + 30일 달력(미기록일 표시) + 날짜별 목록·수정 */
export function HealthHistory({ patient, records, editable = true }: Props) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const today = todayISO();
  const byDate = new Map(records.map((r) => [r.date, r]));
  const dates30 = lastNDates(30);
  const missingCount = dates30.filter((d) => !byDate.has(d)).length;
  const leadingBlanks = weekdayOf(dates30[0]);
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const editingRecord = editingDate ? byDate.get(editingDate) : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={LineChartIcon} title="건강 변화 그래프" subtitle="통원·입원 기록이 하나로 이어집니다" action={<DemoBadge />} />
        <HealthChart records={records} admissionDate={patient.careMode === "inpatient" ? patient.admissionDate : undefined} />
      </Card>

      <Card>
        <SectionTitle
          icon={CalendarDays}
          title="최근 30일 기록 달력"
          subtitle={`기록 ${30 - missingCount}일 · 미기록 ${missingCount}일${editable ? " · 날짜를 눌러 기록/수정" : ""}`}
        />
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400">
          {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
            <div key={w}>{w}</div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {dates30.map((d) => {
            const r = byDate.get(d);
            const day = Number(d.slice(8));
            return (
              <button
                key={d}
                type="button"
                disabled={!editable}
                onClick={() => setEditingDate(d)}
                title={r ? `${formatKoreanDate(d)} 컨디션 ${r.condition}점` : `${formatKoreanDate(d)} 기록 없음`}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
                  r ? CONDITION_BG[r.condition] : "border-2 border-dashed border-slate-200 bg-white text-slate-400",
                  d === today && "ring-2 ring-teal-500 ring-offset-1",
                  editable && "hover:scale-105",
                )}
              >
                <span className="font-bold">{day}</span>
                <span className="text-[10px] font-medium leading-none">{r ? `${r.condition}점` : "미기록"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">색이 진할수록 컨디션 점수가 높습니다 · 점선 칸은 기록이 없는 날</p>
      </Card>

      <Card>
        <SectionTitle icon={CalendarDays} title="날짜별 기록" subtitle={`총 ${records.length}건`} />
        <ul className="divide-y divide-slate-100">
          {sorted.slice(0, 20).map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">{formatKoreanDate(r.date)}</span>
                  <Badge tone={r.recordedIn === "inpatient" ? "blue" : "teal"}>{MODE_LABEL[r.recordedIn]}</Badge>
                  {r.isDemo && <DemoBadge />}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  컨디션 {r.condition}점({CONDITION_FACE[r.condition]}) · 통증 {r.pain} · 피로 {r.fatigue} · 수면 {r.sleep} · 식사{" "}
                  {MEAL_INTAKE_LABEL[r.mealIntake]} · 소화 {DIGESTION_LABEL[r.digestion]}
                </p>
                {(r.symptoms.length > 0 || r.memo) && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {r.symptoms.length > 0 && `증상: ${r.symptoms.join(", ")}`}
                    {r.symptoms.length > 0 && r.memo && " · "}
                    {r.memo}
                  </p>
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditingDate(r.date)}
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 sm:self-center"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> 수정
                </button>
              )}
            </li>
          ))}
        </ul>
        {sorted.length > 20 && <p className="pt-2 text-center text-xs text-slate-400">최근 20건만 표시</p>}
      </Card>

      <Sheet
        open={editingDate !== null}
        title={editingDate ? `${formatKoreanDate(editingDate)} 기록 ${editingRecord ? "수정" : "작성"}` : ""}
        onClose={() => setEditingDate(null)}
      >
        {editingDate && (
          <ConditionForm
            key={`${editingDate}-${formVersion}`}
            patientId={patient.id}
            date={editingDate}
            mode={patient.careMode}
            existing={editingRecord}
            onSaved={() => {
              setFormVersion((v) => v + 1);
              setEditingDate(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
