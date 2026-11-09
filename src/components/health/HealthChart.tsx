"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/components/ui/primitives";
import { formatKoreanDate, formatShortDate, lastNDates } from "@/lib/date";
import type { HealthRecord } from "@/types";

/** 검증된 범주형 팔레트 순서 (blue → orange → aqua) */
const SERIES = {
  condition: { name: "컨디션", color: "#2a78d6" },
  sleep: { name: "수면", color: "#eb6834" },
  fatigue: { name: "피로도", color: "#1baf7a" },
  pain: { name: "통증", color: "#2a78d6" },
};

const GRID = "#e8e8e4";
const AXIS = "#52514e";

export type RangeDays = 7 | 30;

export function RangeToggle({ value, onChange }: { value: RangeDays; onChange: (v: RangeDays) => void }) {
  return (
    <div role="group" aria-label="기간 선택" className="inline-flex rounded-xl bg-slate-100 p-1">
      {([7, 30] as RangeDays[]).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold",
            value === d ? "bg-white text-teal-700 shadow-sm" : "text-slate-500",
          )}
        >
          최근 {d}일
        </button>
      ))}
    </div>
  );
}

interface Props {
  records: HealthRecord[];
  /** 고정 기간 (지정하지 않으면 토글 표시) */
  days?: RangeDays;
  /** 입원일 표시선 */
  admissionDate?: string;
  showPain?: boolean;
  showRangeToggle?: boolean;
  /** 컨디션만 표시 (요약용) */
  conditionOnly?: boolean;
}

export function HealthChart({
  records,
  days: fixedDays,
  admissionDate,
  showPain = true,
  showRangeToggle = true,
  conditionOnly = false,
}: Props) {
  const [rangeState, setRange] = useState<RangeDays>(7);
  const days = fixedDays ?? rangeState;
  const byDate = new Map(records.map((r) => [r.date, r]));
  const dates = lastNDates(days);
  const data = dates.map((date) => {
    const r = byDate.get(date);
    return {
      date,
      condition: r?.condition ?? null,
      sleep: r?.sleep ?? null,
      fatigue: r?.fatigue ?? null,
      pain: r?.pain ?? null,
    };
  });
  const recorded = data.filter((d) => d.condition !== null).length;
  const showAdmission = admissionDate && admissionDate >= dates[0];
  const dot = days === 7 ? { r: 4, strokeWidth: 2 } : { r: 2.5, strokeWidth: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {days}일 중 <strong className="text-slate-800">{recorded}일</strong> 기록 · 끊긴 구간은 기록이 없는 날
        </p>
        {showRangeToggle && !fixedDays && <RangeToggle value={rangeState} onChange={setRange} />}
      </div>

      <figure>
        <figcaption className="mb-1 text-sm font-semibold text-slate-700">
          {conditionOnly ? "컨디션 (1~5)" : "컨디션 · 수면 · 피로도 (1~5점)"}
        </figcaption>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 12, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval={days === 7 ? 0 : "preserveStartEnd"}
                minTickGap={16}
              />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={false} />
              <Tooltip
                labelFormatter={(l) => formatKoreanDate(String(l))}
                formatter={(v, n) => [v === null || v === undefined ? "기록 없음" : `${v}점`, n]}
                contentStyle={{ borderRadius: 12, borderColor: GRID, fontSize: 13 }}
              />
              {!conditionOnly && <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />}
              {showAdmission && (
                <ReferenceLine x={admissionDate} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "입원", fontSize: 11, fill: AXIS, position: "insideTopRight" }} />
              )}
              <Line type="monotone" dataKey="condition" name={SERIES.condition.name} stroke={SERIES.condition.color} strokeWidth={2.5} dot={{ ...dot, fill: SERIES.condition.color }} connectNulls={false} isAnimationActive={false} />
              {!conditionOnly && (
                <>
                  <Line type="monotone" dataKey="sleep" name={SERIES.sleep.name} stroke={SERIES.sleep.color} strokeWidth={2} dot={{ ...dot, fill: SERIES.sleep.color }} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="fatigue" name={SERIES.fatigue.name} stroke={SERIES.fatigue.color} strokeWidth={2} dot={{ ...dot, fill: SERIES.fatigue.color }} connectNulls={false} isAnimationActive={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      {showPain && !conditionOnly && (
        <figure>
          <figcaption className="mb-1 text-sm font-semibold text-slate-700">통증 (0~10점)</figcaption>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval={days === 7 ? 0 : "preserveStartEnd"} minTickGap={16} />
                <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={(l) => formatKoreanDate(String(l))}
                  formatter={(v) => [v === null || v === undefined ? "기록 없음" : `${v}점`, "통증"]}
                  contentStyle={{ borderRadius: 12, borderColor: GRID, fontSize: 13 }}
                />
                {showAdmission && <ReferenceLine x={admissionDate} stroke="#94a3b8" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="pain" name="통증" stroke={SERIES.pain.color} strokeWidth={2} dot={{ ...dot, fill: SERIES.pain.color }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </div>
  );
}
