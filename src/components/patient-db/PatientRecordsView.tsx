"use client";

import { ChevronLeft, ChevronRight, PencilLine, Plus } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PatientConditionForm } from "@/components/patient-db/PatientConditionForm";
import { CardHeading, cn, PButton, PCard, Segmented, SoftSheet, StatusPill } from "@/components/patient-ui/kit";
import { CONDITION_WORD, SLEEP_WORD } from "@/components/patient-ui/labels";
import { addDays, formatDotDate, formatKoreanTime, formatLongKoreanDate, lastNDates, parseISODate } from "@/lib/date";
import { DIGESTION_LABEL, MEAL_INTAKE_LABEL, MODE_LABEL } from "@/lib/labels";
import type { Admission, HealthRecord, Patient } from "@/types";

/** 저장소가 불러오는 기간과 같음 (lib/repository/supabase.ts HISTORY_DAYS) */
const WINDOW_DAYS = 90;
/** 컨디션 선 색 — dataviz 검증 통과 (명도·채도·대비) */
const LINE = "#1f8256";
const AREA = "#e0ebe1";
const GRID = "#ece8de";
const AXIS = "#66706a";

type Range = 7 | 30;

interface Props {
  patient: Patient;
  records: HealthRecord[];
  /** 오늘 (한국 날짜) — 데이터가 준비된 뒤 브라우저에서 계산해 전달 */
  today: string;
  /** 입원 이력 (자기기록, 최신순으로 표시) */
  admissions?: Admission[];
  /** 읽기 전용 (의료진·보호자 화면에서 재사용) */
  readOnly?: boolean;
  title?: string;
  sub?: string;
}

/** 기록 보기: 컨디션 흐름(7일/30일) + 월 달력 + 날짜별 기록·수정 */
export function PatientRecordsView({
  patient,
  records,
  today,
  admissions = [],
  readOnly = false,
  title = "나의 기록",
  sub = "하루하루 쌓인 나의 변화를 살펴보세요.",
}: Props) {
  const [range, setRange] = useState<Range>(7);
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(false);
  const byDate = new Map(records.map((r) => [r.date, r]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[1.75rem] font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mt-1 text-ink-soft">{sub}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <Segmented
            ariaLabel="기간 선택"
            items={[
              { value: 7 as Range, label: "7일" },
              { value: 30 as Range, label: "30일" },
            ]}
            value={range}
            onChange={setRange}
          />
          <ConditionTrend byDate={byDate} today={today} range={range} />
          <BodySignals byDate={byDate} today={today} range={range} />
          {admissions.length > 0 && <AdmissionHistory admissions={admissions} />}
        </div>

        <div className="space-y-5">
          <MonthCalendar byDate={byDate} today={today} selected={selected} onSelect={setSelected} />
          <DayDetail date={selected} record={byDate.get(selected)} onEdit={readOnly ? undefined : () => setEditing(true)} />
        </div>
      </div>

      <SoftSheet
        open={editing}
        title={`${formatLongKoreanDate(selected, false)} 기록 ${byDate.has(selected) ? "수정" : "작성"}`}
        onClose={() => setEditing(false)}
      >
        {editing && (
          <PatientConditionForm
            key={`${selected}-${byDate.get(selected)?.updatedAt ?? "new"}`}
            patientId={patient.id}
            date={selected}
            mode={patient.careMode}
            existing={byDate.get(selected)}
            onSaved={() => setEditing(false)}
          />
        )}
      </SoftSheet>
    </div>
  );
}

/* ───────────── 컨디션 흐름 ───────────── */

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function ConditionTrend({ byDate, today, range }: { byDate: Map<string, HealthRecord>; today: string; range: Range }) {
  const dates = lastNDates(range, today);
  const prevDates = lastNDates(range, addDays(today, -range));
  const data = dates.map((date) => ({ date, condition: byDate.get(date)?.condition ?? null }));
  const avg = average(data.flatMap((d) => (d.condition === null ? [] : [d.condition])));
  const prevAvg = average(prevDates.flatMap((d) => (byDate.has(d) ? [byDate.get(d)!.condition] : [])));
  const diff = avg !== null && prevAvg !== null ? Math.round((avg - prevAvg) * 10) / 10 : null;
  const prevLabel = range === 7 ? "지난주" : "이전 30일";

  return (
    <PCard aria-labelledby="trend-title">
      <CardHeading
        id="trend-title"
        title="컨디션 흐름"
        action={<span className="pt-1 text-sm whitespace-nowrap text-ink-soft">{`${formatDotDate(dates[0])} – ${formatDotDate(dates.at(-1)!)}`}</span>}
      />
      <p className="flex items-baseline gap-2">
        <span className="text-[2rem] leading-none font-extrabold text-sage-700">{avg === null ? "평균 —" : `평균 ${avg.toFixed(1)}`}</span>
        <span className="text-ink-soft">/ 5점</span>
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {diff === null
          ? avg === null
            ? "이 기간에는 아직 기록이 없어요"
            : `${prevLabel} 기록이 없어 비교하지 않았어요`
          : diff === 0
            ? `${prevLabel}와 비슷해요`
            : `${prevLabel}보다 ${Math.abs(diff).toFixed(1)}점 ${diff > 0 ? "높아요" : "낮아요"}`}
      </p>

      <figure className="mt-4">
        <figcaption className="sr-only">
          {range}일 컨디션 점수(1~5점) 선 그래프. 기록 {data.filter((d) => d.condition !== null).length}일.
        </figcaption>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: -28 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                interval={range === 7 ? 0 : "preserveStartEnd"}
                minTickGap={14}
                height={40}
                tick={(p) => {
                  const value = String(p.payload.value);
                  const missing = !byDate.has(value);
                  return (
                    <g transform={`translate(${p.x},${p.y})`}>
                      <text textAnchor="middle" dy={12} fontSize={12} fill={AXIS}>
                        {Number(value.slice(8))}
                      </text>
                      {range === 7 && missing && (
                        <text textAnchor="middle" dy={28} fontSize={12} fill={AXIS}>
                          —
                        </text>
                      )}
                    </g>
                  );
                }}
              />
              <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} />
              <Tooltip
                cursor={{ stroke: "#c8dbcb", strokeWidth: 1 }}
                labelFormatter={(l) => formatLongKoreanDate(String(l), false)}
                formatter={(v) => [v === null || v === undefined ? "기록 없음" : `${v}점 · ${CONDITION_WORD[Number(v)]}`, "컨디션"]}
                contentStyle={{ borderRadius: 14, borderColor: "#e5e1d6", fontSize: 13 }}
              />
              <Area type="linear" dataKey="condition" fill={AREA} fillOpacity={0.9} stroke="none" connectNulls={false} isAnimationActive={false} />
              <Line
                type="linear"
                dataKey="condition"
                name="컨디션"
                stroke={LINE}
                strokeWidth={2}
                dot={range === 7 ? { r: 4, fill: LINE, stroke: "#fff", strokeWidth: 2 } : { r: 2.5, fill: LINE, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-ink-soft">— 미기록일은 평균에서 제외해요 · 선이 끊긴 곳은 기록이 없는 날</p>
      </figure>
    </PCard>
  );
}

function BodySignals({ byDate, today, range }: { byDate: Map<string, HealthRecord>; today: string; range: Range }) {
  const recs = lastNDates(range, today).flatMap((d) => (byDate.has(d) ? [byDate.get(d)!] : []));
  const pain = average(recs.map((r) => r.pain));
  const fatigue = average(recs.map((r) => r.fatigue));
  const sleep = average(recs.map((r) => r.sleep));
  const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1));
  const items = [
    { label: "기록한 날", value: `${recs.length}`, unit: `/ ${range}일` },
    { label: "평균 통증", value: fmt(pain), unit: "/ 10" },
    { label: "평균 피로", value: fmt(fatigue), unit: "/ 5" },
    { label: "평균 수면", value: fmt(sleep), unit: "/ 5" },
  ];
  return (
    <PCard tone="ivory" aria-label={`최근 ${range}일 몸의 신호 요약`}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-sm text-ink-soft">{it.label}</dt>
            <dd className="mt-0.5 text-xl font-bold text-ink">
              {it.value}
              <span className="ml-1 text-sm font-medium text-ink-soft">{it.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </PCard>
  );
}

/* ───────────── 월 달력 ───────────── */

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function MonthCalendar({
  byDate,
  today,
  selected,
  onSelect,
}: {
  byDate: Map<string, HealthRecord>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
}) {
  const minDate = addDays(today, -(WINDOW_DAYS - 1));
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const first = `${month}-01`;
  const firstDay = parseISODate(first);
  const daysInMonth = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(first, i));
  const canPrev = month > minDate.slice(0, 7);
  const canNext = month < today.slice(0, 7);
  const shift = (n: number) => {
    const d = parseISODate(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const last30 = lastNDates(30, today);
  const recorded30 = last30.filter((d) => byDate.has(d)).length;

  return (
    <PCard aria-labelledby="cal-title">
      <CardHeading
        id="cal-title"
        title={`${firstDay.getUTCFullYear()}년 ${firstDay.getUTCMonth() + 1}월`}
        sub={`최근 30일 중 ${recorded30}일 기록 · 날짜를 눌러 확인해요`}
        action={
          <div className="flex gap-1">
            <IconNav label="이전 달" disabled={!canPrev} onClick={() => shift(-1)}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </IconNav>
            <IconNav label="다음 달" disabled={!canNext} onClick={() => shift(1)}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </IconNav>
          </div>
        }
      />
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEK.map((w) => (
          <div key={w} className="pb-2 text-sm text-ink-soft" aria-hidden>
            {w}
          </div>
        ))}
        {Array.from({ length: firstDay.getUTCDay() }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => {
          const r = byDate.get(d);
          const inWindow = d >= minDate && d <= today;
          const isSel = d === selected;
          const label = `${formatLongKoreanDate(d, false)}${r ? `, 컨디션 ${CONDITION_WORD[r.condition]}` : inWindow ? ", 기록 없음" : ""}`;
          return (
            <button
              key={d}
              type="button"
              disabled={!inWindow}
              aria-pressed={isSel}
              aria-label={label}
              onClick={() => onSelect(d)}
              className={cn(
                "mx-auto flex h-12 w-full max-w-12 flex-col items-center justify-center rounded-2xl text-[0.95rem] transition",
                isSel ? "bg-sage-700 font-bold text-white" : inWindow ? "text-ink hover:bg-sage-50" : "text-ink-soft/40",
                d === today && !isSel && "font-bold text-sage-700 ring-1 ring-sage-300",
              )}
            >
              <span>{Number(d.slice(8))}</span>
              <span className="flex h-2 items-center" aria-hidden>
                {r ? (
                  <span className={cn("h-1.5 w-1.5 rounded-full", isSel ? "bg-white" : "bg-sage-600")} />
                ) : inWindow ? (
                  <span className={cn("text-[0.6rem] leading-none", isSel ? "text-white" : "text-ink-soft")}>—</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-600" aria-hidden /> 기록한 날
        </span>
        <span>— 기록 없는 날</span>
      </p>
    </PCard>
  );
}

function IconNav({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-ivory-deep disabled:text-ink-soft/30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/* ───────────── 날짜별 기록 ───────────── */

function DayDetail({ date, record: r, onEdit }: { date: string; record?: HealthRecord; onEdit?: () => void }) {
  return (
    <PCard aria-labelledby="day-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="day-title" className="text-xl font-bold text-ink">
          {formatLongKoreanDate(date, false)}
        </h2>
        {r ? (
          <StatusPill check>기록 완료</StatusPill>
        ) : (
          <StatusPill tone="ivory">기록 없음</StatusPill>
        )}
      </div>

      {r ? (
        <>
          <p className="text-[2rem] leading-tight font-extrabold text-sage-700">{CONDITION_WORD[r.condition]}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {MODE_LABEL[r.recordedIn]} 기록 · {formatKoreanTime(r.updatedAt)} 저장
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-bold text-ink">
            <div className="flex gap-1">
              <dt>통증</dt>
              <dd>{r.pain}점</dd>
            </div>
            <div className="flex gap-1">
              <dt>피로</dt>
              <dd>{r.fatigue}점</dd>
            </div>
            <div className="flex gap-1">
              <dt>수면</dt>
              <dd>{SLEEP_WORD[r.sleep]}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-ink-soft">
            식사 {MEAL_INTAKE_LABEL[r.mealIntake]} · 소화 {DIGESTION_LABEL[r.digestion]}
            {r.symptoms.length > 0 && ` · 증상 ${r.symptoms.join(", ")}`}
          </p>
          {r.memo && <p className="mt-3 rounded-2xl bg-ivory px-4 py-3 break-words text-ink">{r.memo}</p>}
        </>
      ) : (
        <p className="py-2 text-ink-soft">이 날은 아직 기록이 없어요.</p>
      )}

      {onEdit && (
        <PButton variant="secondary" className="mt-5 w-full" icon={r ? PencilLine : Plus} onClick={onEdit}>
          {r ? "이 날짜의 기록 수정" : "이 날짜 기록하기"}
        </PButton>
      )}
    </PCard>
  );
}

/* ───────────── 입원 이력 ───────────── */

/** 통원↔입원 전환 이력 (환자 자기기록 — 병원의 공식 입원 확인이 아님) */
function AdmissionHistory({ admissions }: { admissions: Admission[] }) {
  const list = [...admissions].sort((a, b) => b.admittedOn.localeCompare(a.admittedOn));
  return (
    <PCard aria-labelledby="adm-title">
      <CardHeading id="adm-title" title="입원 이력" sub="기록 상세의 '통원 기록·입원 기록'은 기록할 때의 모드예요." />
      <ul className="space-y-2">
        {list.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ivory px-4 py-3 text-sm">
            <span className="font-bold text-ink">
              {formatLongKoreanDate(a.admittedOn, false).replace(/ \S+요일$/, "")} ~ {a.dischargedOn ? formatLongKoreanDate(a.dischargedOn, false).replace(/ \S+요일$/, "") : "입원 중"}
            </span>
            <span className="text-ink-soft">
              {a.ward === "미입력" ? "병동 미입력" : a.ward} · {a.room === "미입력" ? "병실 미입력" : `${a.room}호`} · {a.source === "self_reported" ? "자기기록" : "병원 확인"}
            </span>
          </li>
        ))}
      </ul>
    </PCard>
  );
}
