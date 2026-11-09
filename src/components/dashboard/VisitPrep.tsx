"use client";

import { CalendarCheck, ClipboardList, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, cn, DemoBadge, EmptyState, SectionTitle, StatTile } from "@/components/ui/primitives";
import { repository } from "@/hooks/useCareLog";
import { addDays, diffDays, formatKoreanDate, todayISO } from "@/lib/date";
import type { HealthRecord, Patient, VisitQuestion } from "@/types";

export function summarizeRecent(records: HealthRecord[], days: number) {
  const from = addDays(todayISO(), -(days - 1));
  const recent = records.filter((r) => r.date >= from);
  const avg = (k: "condition" | "pain" | "sleep") =>
    recent.length ? (recent.reduce((s, r) => s + r[k], 0) / recent.length).toFixed(1) : "-";
  const symptomCount = new Map<string, number>();
  recent.forEach((r) => r.symptoms.forEach((s) => symptomCount.set(s, (symptomCount.get(s) ?? 0) + 1)));
  const topSymptoms = [...symptomCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const worst = recent.reduce<HealthRecord | null>((w, r) => (!w || r.condition < w.condition ? r : w), null);
  return { count: recent.length, avgCondition: avg("condition"), avgPain: avg("pain"), avgSleep: avg("sleep"), topSymptoms, worst };
}

export function NextVisitBadge({ date, light = false }: { date?: string; light?: boolean }) {
  if (!date) return <span className={light ? "" : "text-slate-500"}>예약 없음</span>;
  const d = diffDays(date, todayISO());
  return (
    <span>
      {formatKoreanDate(date)}{" "}
      <span className={cn("font-bold", light ? "rounded-full bg-white/25 px-2" : d <= 3 ? "text-rose-600" : "text-teal-700")}>
        {d === 0 ? "오늘" : `D-${d}`}
      </span>
    </span>
  );
}

export function VisitPrep({
  patient,
  records,
  questions,
}: {
  patient: Patient;
  records: HealthRecord[];
  questions: VisitQuestion[];
}) {
  const [text, setText] = useState("");
  const s = summarizeRecent(records, 14);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={CalendarCheck} title="다음 진료" subtitle={patient.department} action={<DemoBadge />} />
        <div className="rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 text-lg font-semibold text-slate-800">
          <NextVisitBadge date={patient.nextVisitDate} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={ClipboardList} title="최근 2주 건강 요약" subtitle="진료 때 의료진에게 보여 주세요" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="기록한 날" value={s.count} unit="/14일" />
          <StatTile label="평균 컨디션" value={s.avgCondition} unit="/5" />
          <StatTile label="평균 통증" value={s.avgPain} unit="/10" />
          <StatTile label="평균 수면" value={s.avgSleep} unit="/5" />
        </div>
        <div className="mt-4 space-y-1.5 text-sm text-slate-700">
          <p>
            <strong>자주 기록한 증상:</strong>{" "}
            {s.topSymptoms.length ? s.topSymptoms.map(([k, n]) => `${k}(${n}회)`).join(", ") : "없음"}
          </p>
          {s.worst && (
            <p>
              <strong>컨디션이 가장 낮았던 날:</strong> {formatKoreanDate(s.worst.date)} · {s.worst.condition}점
              {s.worst.memo && ` · "${s.worst.memo}"`}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={MessageCircleQuestion} title="의료진에게 물어볼 질문" subtitle="생각날 때마다 메모해 두세요" />
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void repository.addVisitQuestion(patient.id, text.trim());
            setText("");
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder="예) 약을 식전에 먹어도 되나요?"
            className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-teal-400"
          />
          <Button type="submit" icon={Plus} className="h-12">
            추가
          </Button>
        </form>
        {questions.length === 0 ? (
          <EmptyState>아직 메모한 질문이 없습니다.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={q.done}
                  onChange={() => void repository.toggleVisitQuestion(q.id)}
                  aria-label="질문 완료 표시"
                  className="h-5 w-5 accent-teal-500"
                />
                <span className={cn("flex-1 text-base", q.done && "text-slate-400 line-through")}>{q.text}</span>
                <button
                  type="button"
                  onClick={() => void repository.deleteVisitQuestion(q.id)}
                  aria-label="질문 삭제"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
