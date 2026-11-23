"use client";

import { CalendarDays, ChartNoAxesColumn, FileText, MessageCircleQuestion, Pencil, Pill, Plus, Presentation, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Disclosure } from "@/components/patient-ui/Disclosure";
import { ClipboardIcon } from "@/components/patient-ui/illustrations";
import { Alert, CardHeading, cn, Notice, PButton, PCard, SoftSheet, StatusPill, Switch, TextField } from "@/components/patient-ui/kit";
import { VisitShow } from "@/components/rx/RxDetail";
import { VisitSummary } from "@/components/rx/VisitSummary";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { addDays, diffDays, formatDateTime, formatLongKoreanDate } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import {
  activeItems,
  experienceSentence,
  howToTake,
  isDiscomfortTag,
  itemsOf,
  noteDate,
  prescriptionLabel,
  sortPrescriptions,
  type RxSnapshot,
} from "@/lib/rx/model";
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
  onRecords,
}: {
  patient: Patient;
  records: HealthRecord[];
  questions: VisitQuestion[];
  today: string;
  repo: SupabaseRepository;
  rx?: RxSnapshot | null;
  /** 건강 기록(컨디션) 화면 열기 */
  onRecords?: () => void;
}) {
  const [showId, setShowId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const active = rx?.available ? activeItems(rx) : [];
  const discomfortAll = rx?.available ? [...rx.notes].filter((n) => n.tags.some(isDiscomfortTag)).sort((a, b) => noteDate(b).localeCompare(noteDate(a))) : [];
  const discomfort = discomfortAll.slice(0, 3);
  const openQs = questions.filter((q) => !q.done);
  const latestRx = rx?.available ? sortPrescriptions(rx.prescriptions).find((p) => p.kind === "prescription") : undefined;
  const sentence = (n: (typeof discomfortAll)[number]) => {
    const p = rx!.prescriptions.find((x) => x.id === n.prescriptionId);
    return p ? experienceSentence(p, n, rx!.items.find((i) => i.id === n.itemId)?.name) : "";
  };
  const recent = rx?.available ? sortPrescriptions(rx.prescriptions).slice(0, 4) : [];
  const shown = rx?.prescriptions.find((p) => p.id === showId);
  const s = summarizeRecent(records, 14, today);
  const thisWeek = summarizeRecent(records, 7, today);
  const lastWeek = summarizeRecent(records, 7, addDays(today, -7));
  const painDiff = thisWeek.avgPain !== "-" && lastWeek.avgPain !== "-" ? Math.round((Number(thisWeek.avgPain) - Number(lastWeek.avgPain)) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <PageTitle
        title="진료 준비"
        sub="지금 먹는 약, 지난 처방, 기억해 둔 경험과 질문을 모아 진료실에서 바로 보여 줘요."
        action={
          rx?.available ? (
            <PButton size="md" icon={FileText} onClick={() => setSummaryOpen(true)}>
              진료용 요약 · 인쇄
            </PButton>
          ) : undefined
        }
      />
      {/* ───────── 진료 때 꼭 전할 핵심 (한 장) ───────── */}
      <PCard tone="lavender" aria-label="진료 핵심 정보" className="space-y-3">
        <h2 className="text-lg font-bold text-ink sm:text-xl">진료 때 꼭 전할 것</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <KeyRow icon={CalendarDays} label="다음 진료">
            {patient.nextVisitDate ? formatLongKoreanDate(patient.nextVisitDate) : "아직 정하지 않았어요"}
          </KeyRow>
          <KeyRow icon={Pill} label={`지금 복용 중 ${active.length}개`}>
            {active.length
              ? active
                  .slice(0, 3)
                  .map(({ item }) => item.name)
                  .join(", ") + (active.length > 3 ? ` 외 ${active.length - 3}개` : "")
              : "없음"}
          </KeyRow>
          <KeyRow icon={TriangleAlert} label={`기억해 둔 불편 경험 ${discomfortAll.length}건`}>
            {discomfortAll[0] ? sentence(discomfortAll[0]) : "없음"}
          </KeyRow>
          <KeyRow icon={MessageCircleQuestion} label={`물어볼 질문 ${openQs.length}개`}>
            {openQs.length
              ? openQs
                  .slice(0, 2)
                  .map((q) => q.text)
                  .join(" / ") + (openQs.length > 2 ? ` 외 ${openQs.length - 2}개` : "")
              : "아직 없어요"}
          </KeyRow>
        </dl>
        {rx?.available && (
          <div className="flex flex-wrap gap-2">
            <PButton size="md" icon={FileText} onClick={() => setSummaryOpen(true)}>
              진료용 요약 열기
            </PButton>
            {latestRx && (
              <PButton size="md" variant="secondary" icon={Presentation} className="!border-white" onClick={() => setShowId(latestRx.id)}>
                최근 처방 보여주기
              </PButton>
            )}
          </div>
        )}
      </PCard>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <NextVisitCard patient={patient} today={today} repo={repo} />
          {rx?.available && (
            <Disclosure
              title="현재 복용 중이라고 기록한 약"
              aria-label="현재 복용 중이라고 기록한 약"
              summary={`${active.length}개 · 사용자가 확인해 저장한 내용`}
              rememberKey="visit.current"
            >
              {active.length === 0 ? (
                <p className="text-sm text-ink-soft">지금 복용 중으로 표시한 약이 없어요.</p>
              ) : (
                <ul className="space-y-2">
                  {active.map(({ item: i }) => (
                    <li key={i.id} className="rounded-2xl bg-ivory p-3 text-sm">
                      <p className="font-bold text-ink">{i.name}</p>
                      {i.ingredients && <p className="text-ink-soft">성분 {i.ingredients}</p>}
                      <p className="text-ink-soft">
                        {howToTake(i)}
                        {i.duration && ` · ${i.duration}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
          )}
          {rx?.available && (
            <Disclosure
              title="기억해 둔 불편 경험"
              aria-label="기억해 둔 불편 경험"
              summary={`${discomfortAll.length}건 · 환자가 직접 남긴 경험, 원인 약물은 확인되지 않은 기록`}
              rememberKey="visit.discomfort"
            >
              {discomfort.length === 0 ? (
                <p className="text-sm text-ink-soft">남긴 불편 경험이 없어요.</p>
              ) : (
                <ul className="space-y-2">
                  {discomfort.map((n) => (
                    <li key={n.id} className="rounded-[0.875rem] border border-peach-100 bg-peach-50 p-3 text-sm text-ink">
                      {sentence(n)}
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
          )}
          {rx && (
            <Disclosure
              title="진료 때 보여주기 · 이전 처방 이력"
              aria-label="진료 때 보여주기 · 이전 처방 이력"
              summary={rx.available ? `최근 기록 ${recent.length}건 — 눌러서 한 화면으로 보여 줘요` : undefined}
              defaultOpen={false}
              rememberKey="visit.history"
            >
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
                        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-line bg-white p-3 text-left hover:border-brand-300"
                      >
                        <span className="font-semibold text-ink">{prescriptionLabel(p, itemsOf(rx, p.id).length)}</span>
                        <Presentation className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
          )}
          <Disclosure
            title="최근 2주 컨디션 요약"
            aria-label="최근 2주 요약"
            summary={`${formatLongKoreanDate(addDays(today, -13), false).replace(/ \S+요일$/, "")} – ${formatLongKoreanDate(today, false).replace(/ \S+요일$/, "")} · 기록 ${s.count}/14일`}
            defaultOpen={false}
            rememberKey="visit.condition"
          >
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
            {onRecords && (
              <PButton size="sm" variant="ghost" icon={ChartNoAxesColumn} className="mt-2" onClick={onRecords}>
                컨디션 기록 열기
              </PButton>
            )}
          </Disclosure>
        </div>
        <div className="space-y-5">
          <QuestionsCard patientId={patient.id} questions={questions} repo={repo} rx={rx} />
          {rx?.available && (
            <PCard tone="tint" aria-labelledby="summary-card-title" className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ClipboardIcon className="h-24 w-24 shrink-0" />
              <div className="min-w-0">
                <h2 id="summary-card-title" className="text-lg font-bold text-ink">
                  진료용 요약
                </h2>
                <p className="mt-1 text-sm text-ink-soft">복용약 · 불편 경험 · 질문을 A4 한 장으로 모아 의료진에게 보여줄 수 있어요.</p>
                <PButton size="sm" variant="secondary" icon={FileText} className="mt-3" onClick={() => setSummaryOpen(true)}>
                  요약 열기
                </PButton>
              </div>
            </PCard>
          )}
        </div>
      </div>
      <SoftSheet open={Boolean(shown)} title="진료 때 보여주기" onClose={() => setShowId(null)}>
        {shown && rx && <VisitShow p={shown} snapshot={rx} questions={questions} repo={repo} />}
      </SoftSheet>
      <SoftSheet open={summaryOpen} title="진료용 요약" onClose={() => setSummaryOpen(false)}>
        {summaryOpen && rx?.available && <VisitSummary rx={rx} patient={patient} questions={questions} today={today} />}
      </SoftSheet>
    </div>
  );
}

function KeyRow({ icon: Icon, label, children }: { icon: typeof Pill; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[0.875rem] border border-white bg-white/80 p-3">
      <dt className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Icon className="h-4 w-4 shrink-0 text-lavender-700" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-ink-soft">{children}</dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-3 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={cn("font-bold break-keep", strong ? "text-brand-700" : "text-ink")}>{value}</dd>
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
      <p id="visit-title" className="text-sm font-bold text-brand-800">
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
          <p className="mt-2 text-[1.6rem] leading-tight font-extrabold text-brand-900">
            {patient.nextVisitDate ? formatLongKoreanDate(patient.nextVisitDate, false) : "아직 정하지 않았어요"}
          </p>
          {d !== null && <p className="mt-1 text-sm text-brand-800">{d < 0 ? "지난 일정이에요" : d === 0 ? "오늘이에요" : `${d}일 남았어요`}</p>}
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
                  className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
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
                      className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
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
