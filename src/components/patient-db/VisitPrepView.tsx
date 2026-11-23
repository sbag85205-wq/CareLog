"use client";

import { Pencil, Plus, Presentation, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, cn, Notice, PButton, PCard, SoftSheet, StatusPill, Switch, TextField } from "@/components/patient-ui/kit";
import { VisitShow } from "@/components/rx/RxDetail";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { addDays, diffDays, formatDateTime, formatLongKoreanDate } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import { itemsOf, prescriptionLabel, sortPrescriptions, type RxSnapshot } from "@/lib/rx/model";
import { summarizeRecent } from "@/lib/visit-summary";
import type { HealthRecord, Patient, VisitQuestion } from "@/types";

/** 진료 준비: 다음 진료일 · 최근 2주 요약 · 의사에게 물어볼 질문 */
export function VisitPrepView({
  patient,
  records,
  questions,
  today,
  repo,
  rx,
}: {
  patient: Patient;
  records: HealthRecord[];
  questions: VisitQuestion[];
  today: string;
  repo: SupabaseRepository;
  rx?: RxSnapshot | null;
}) {
  const [showId, setShowId] = useState<string | null>(null);
  const recent = rx?.available ? sortPrescriptions(rx.prescriptions).slice(0, 3) : [];
  const shown = rx?.prescriptions.find((p) => p.id === showId);
  const s = summarizeRecent(records, 14, today);
  const thisWeek = summarizeRecent(records, 7, today);
  const lastWeek = summarizeRecent(records, 7, addDays(today, -7));
  const painDiff = thisWeek.avgPain !== "-" && lastWeek.avgPain !== "-" ? Math.round((Number(thisWeek.avgPain) - Number(lastWeek.avgPain)) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <PageTitle title="진료 준비" sub="궁금한 점을 미리 모아 두세요." />
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <NextVisitCard patient={patient} today={today} repo={repo} />
          {rx && (
            <PCard aria-labelledby="show-title">
              <CardHeading id="show-title" title="진료 때 보여주기" sub="처방·당시 약·복용 경험·질문을 한 화면으로 보여 줘요." />
              {!rx.available ? (
                <Notice>{rx.message}</Notice>
              ) : recent.length === 0 ? (
                <p className="text-sm text-ink-soft">처방을 등록하면 여기서 바로 보여 줄 수 있어요.</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setShowId(p.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-white p-3 text-left hover:border-sage-300"
                      >
                        <span className="font-semibold text-ink">{prescriptionLabel(p, itemsOf(rx, p.id).length)}</span>
                        <Presentation className="h-5 w-5 shrink-0 text-sage-700" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PCard>
          )}
          <PCard aria-labelledby="sum-title">
            <CardHeading
              id="sum-title"
              title="최근 2주 요약"
              sub={`${formatLongKoreanDate(addDays(today, -13), false).replace(/ \S+요일$/, "")} – ${formatLongKoreanDate(today, false).replace(/ \S+요일$/, "")}`}
            />
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
        <QuestionsCard patientId={patient.id} questions={questions} repo={repo} rx={rx} />
      </div>
      <SoftSheet open={Boolean(shown)} title="진료 때 보여주기" onClose={() => setShowId(null)}>
        {shown && rx && <VisitShow p={shown} snapshot={rx} questions={questions} repo={repo} />}
      </SoftSheet>
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
          {d !== null && <p className="mt-1 text-sm text-sage-800">{d < 0 ? "지난 일정이에요" : d === 0 ? "오늘이에요" : `${d}일 남았어요`}</p>}
          <PButton variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(true)}>
            {patient.nextVisitDate ? "진료일 변경" : "진료일 입력"}
          </PButton>
        </>
      )}
    </PCard>
  );
}

function QuestionsCard({
  patientId,
  questions,
  repo,
  rx,
}: {
  patientId: string;
  questions: VisitQuestion[];
  repo: SupabaseRepository;
  rx?: RxSnapshot | null;
}) {
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
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
        <TextField
          className="flex-1"
          label="새 질문"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 두통약을 같이 먹어도 되나요?"
        />
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
                {editId === q.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!editText.trim()) return;
                      const r = await list.run(() => repo.updateVisitQuestion(q.id, editText));
                      if (r.ok) setEditId(null);
                    }}
                  >
                    <input
                      aria-label="질문 수정"
                      value={editText}
                      maxLength={200}
                      onChange={(e) => setEditText(e.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
                    />
                    <PButton type="submit" size="sm" disabled={!editText.trim() || list.pending}>
                      저장
                    </PButton>
                    <PButton size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      취소
                    </PButton>
                  </form>
                ) : (
                  <p className={cn("min-w-0 flex-1 break-words", q.done ? "text-ink-soft line-through" : "text-ink")}>{q.text}</p>
                )}
                {editId !== q.id && (
                  <button
                    type="button"
                    aria-label={`${q.text} 고치기`}
                    onClick={() => {
                      setEditId(q.id);
                      setEditText(q.text);
                    }}
                    className="shrink-0 rounded-xl p-1.5 text-ink-soft hover:bg-ivory-deep hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`${q.text} 삭제`}
                  onClick={() => void list.run(() => repo.deleteVisitQuestion(q.id))}
                  className="shrink-0 rounded-xl p-1.5 text-ink-soft hover:bg-ivory-deep hover:text-ink"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1 pl-8 text-xs text-ink-soft">
                {questionRef(q, rx)}작성 {formatDateTime(q.createdAt)}
                {q.updatedAt && q.updatedAt.slice(0, 16) !== q.createdAt.slice(0, 16) && ` · 수정 ${formatDateTime(q.updatedAt)}`}
              </p>
              <div className="mt-2 flex items-center gap-2 pl-8">
                <div className="flex-1">
                  <Switch
                    label="의료진과 공유"
                    checked={Boolean(q.sharedWithStaff)}
                    onChange={(v) => void list.run(() => repo.setVisitQuestionShared(q.id, v))}
                  />
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

/** 처방에서 담은 질문이면 어느 처방인지 앞에 표시 */
function questionRef(q: VisitQuestion, rx?: RxSnapshot | null): string {
  if (!q.prescriptionId || !rx?.available) return "";
  const p = rx.prescriptions.find((x) => x.id === q.prescriptionId);
  return p ? `${prescriptionLabel(p, itemsOf(rx, p.id).length)} · ` : "";
}
