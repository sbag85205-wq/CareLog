"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, cn, PButton, PCard, StatusPill, Switch, TextField } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { addDays, diffDays, formatLongKoreanDate } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import { summarizeRecent } from "@/lib/visit-summary";
import type { HealthRecord, Patient, VisitQuestion } from "@/types";

/** 진료 준비: 다음 진료일 · 최근 2주 요약 · 의사에게 물어볼 질문 */
export function VisitPrepView({
  patient,
  records,
  questions,
  today,
  repo,
}: {
  patient: Patient;
  records: HealthRecord[];
  questions: VisitQuestion[];
  today: string;
  repo: SupabaseRepository;
}) {
  const s = summarizeRecent(records, 14, today);
  const thisWeek = summarizeRecent(records, 7, today);
  const lastWeek = summarizeRecent(records, 7, addDays(today, -7));
  const painDiff =
    thisWeek.avgPain !== "-" && lastWeek.avgPain !== "-" ? Math.round((Number(thisWeek.avgPain) - Number(lastWeek.avgPain)) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <PageTitle title="진료 준비" sub="궁금한 점을 미리 모아 두세요." />
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <NextVisitCard patient={patient} today={today} repo={repo} />
          <PCard aria-labelledby="sum-title">
            <CardHeading id="sum-title" title="최근 2주 요약" sub={`${formatLongKoreanDate(addDays(today, -13), false).replace(/ \S+요일$/, "")} – ${formatLongKoreanDate(today, false).replace(/ \S+요일$/, "")}`} />
            <dl className="divide-y divide-line">
              <Row label="기록한 날" value={`${s.count} / 14일`} />
              <Row label="평균 컨디션" value={s.avgCondition === "-" ? "—" : `${s.avgCondition} / 5점`} strong />
              <Row
                label="통증 변화"
                value={
                  s.avgPain === "-"
                    ? "—"
                    : `평균 ${s.avgPain}점${painDiff === null ? "" : painDiff === 0 ? " · 지난주와 같음" : ` · 지난주보다 ${Math.abs(painDiff).toFixed(1)}점 ${painDiff > 0 ? "증가" : "감소"}`}`
                }
              />
              <Row label="자주 기록한 증상" value={s.topSymptoms.length ? s.topSymptoms.map(([n, c]) => `${n} ${c}일`).join(" · ") : "없음"} />
            </dl>
            <p className="mt-3 text-xs text-ink-soft">진료 때 이 요약을 의료진에게 보여 주세요. 의료적 판단은 의료진과 상담해 주세요.</p>
          </PCard>
        </div>
        <QuestionsCard patientId={patient.id} questions={questions} repo={repo} />
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-3 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={cn("font-bold break-keep", strong ? "text-sage-700" : "text-ink")}>{value}</dd>
    </div>
  );
}

function NextVisitCard({ patient, today, repo }: { patient: Patient; today: string; repo: SupabaseRepository }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(patient.nextVisitDate ?? "");
  const action = useAsyncAction();
  const d = patient.nextVisitDate ? diffDays(patient.nextVisitDate, today) : null;
  return (
    <PCard tone="tint" aria-labelledby="visit-title">
      <p id="visit-title" className="text-sm font-bold text-sage-800">
        다음 진료
      </p>
      {editing ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await action.run(() => repo.setNextVisitDate(patient.id, value || null));
            if (r.ok) setEditing(false);
          }}
        >
          <TextField label="다음 진료일" type="date" min={today} value={value} onChange={(e) => setValue(e.target.value)} />
          <Alert>{action.error}</Alert>
          <div className="flex gap-2">
            <PButton type="submit" size="md" disabled={action.pending}>
              {action.pending ? "저장 중…" : "저장"}
            </PButton>
            <PButton variant="secondary" size="md" onClick={() => setEditing(false)}>
              취소
            </PButton>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-2 text-[1.6rem] leading-tight font-extrabold text-sage-900">
            {patient.nextVisitDate ? formatLongKoreanDate(patient.nextVisitDate, false) : "아직 정하지 않았어요"}
          </p>
          {d !== null && (
            <p className="mt-1 text-sm text-sage-800">{d < 0 ? "지난 일정이에요" : d === 0 ? "오늘이에요" : `${d}일 남았어요`}</p>
          )}
          <PButton variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(true)}>
            {patient.nextVisitDate ? "진료일 변경" : "진료일 입력"}
          </PButton>
        </>
      )}
    </PCard>
  );
}

function QuestionsCard({ patientId, questions, repo }: { patientId: string; questions: VisitQuestion[]; repo: SupabaseRepository }) {
  const [text, setText] = useState("");
  const add = useAsyncAction();
  const list = useAsyncAction();
  return (
    <PCard aria-labelledby="q-title">
      <CardHeading id="q-title" title="의사에게 물어볼 질문" sub="'의료진과 공유'를 켠 질문만 담당 의료진이 미리 볼 수 있어요." />
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const r = await add.run(() => repo.addVisitQuestion(patientId, text));
          if (r.ok) setText("");
        }}
      >
        <TextField className="flex-1" label="새 질문" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="예: 두통약을 같이 먹어도 되나요?" />
        <PButton type="submit" size="md" icon={Plus} className="h-14" disabled={!text.trim() || add.pending} aria-label="질문 추가">
          추가
        </PButton>
      </form>
      <Alert className="mt-3">{add.error ?? list.error}</Alert>
      {questions.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">아직 적어 둔 질문이 없어요.</p>
      ) : (
        <ul className="mt-5 space-y-3" aria-label="진료 질문 목록">
          {questions.map((q) => (
            <li key={q.id} className="rounded-2xl bg-ivory p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 accent-sage-700"
                  checked={q.done}
                  aria-label={`${q.text} — 물어봤어요`}
                  onChange={() => void list.run(() => repo.toggleVisitQuestion(q.id))}
                />
                <p className={cn("min-w-0 flex-1 break-words", q.done ? "text-ink-soft line-through" : "text-ink")}>{q.text}</p>
                <button
                  type="button"
                  aria-label={`${q.text} 삭제`}
                  onClick={() => void list.run(() => repo.deleteVisitQuestion(q.id))}
                  className="shrink-0 rounded-xl p-1.5 text-ink-soft hover:bg-ivory-deep hover:text-ink"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-8">
                <div className="flex-1">
                  <Switch label="의료진과 공유" checked={Boolean(q.sharedWithStaff)} onChange={(v) => void list.run(() => repo.setVisitQuestionShared(q.id, v))} />
                </div>
                {q.done && <StatusPill tone="ivory">물어봤어요</StatusPill>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PCard>
  );
}
