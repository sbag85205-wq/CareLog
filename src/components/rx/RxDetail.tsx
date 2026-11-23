"use client";

import { ChevronLeft, ChevronRight, Pencil, Presentation, Share2, Star } from "lucide-react";
import { useState } from "react";
import { Alert, cn, Notice, PButton, PCard, SoftSheet, StatusPill, Switch } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatLongKoreanDate } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import {
  DEPARTMENTS,
  dotDate,
  experienceSentence,
  itemsOf,
  notesOf,
  slashDate,
  SOURCE_LABEL,
  tagLabel,
  type Prescription,
  type RxNote,
  type RxSnapshot,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import type { VisitQuestion } from "@/types";
import { NoteCard, NoteEditor } from "./NoteEditor";
import { CategoryPills, howToTake, KindPill, QuestionItem, SourceNote, SOURCE_TEXT, TagPills } from "./RxParts";

const dateTitle = (p: Prescription) => `${formatLongKoreanDate(p.prescribedOn).replace(/ \S+요일$/, "")} ${p.kind === "otc" ? "등록" : "처방"}`;

/** 기록 상세 (처방·일반약) — 그때 확인해 저장한 약·복용 방법·주의사항 + 사용자가 남긴 복용 경험 */
export function RxDetail({
  prescription: p,
  snapshot,
  store,
  repo,
  questions,
  readOnly,
  onBack,
  onOpenItem,
  onShare,
}: {
  prescription: Prescription;
  snapshot: RxSnapshot;
  store: RxStore | null;
  repo?: SupabaseRepository;
  questions: VisitQuestion[];
  readOnly?: boolean;
  onBack?: () => void;
  onOpenItem?: (itemId: string) => void;
  onShare?: (prescriptionId: string) => void;
}) {
  const items = itemsOf(snapshot, p.id);
  const notes = notesOf(snapshot, p.id);
  const related = questions.filter((q) => q.prescriptionId === p.id);
  const [showing, setShowing] = useState(false);
  const [editMeta, setEditMeta] = useState(false);
  const action = useAsyncAction();
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => void action.run(fn);
  const otc = p.kind === "otc";
  const activeShares = snapshot.shares.filter((s) => s.prescriptionId === p.id && !s.revokedAt).length;

  return (
    <div className="space-y-4" aria-label="기록 상세">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-xl px-2 text-ink-soft hover:bg-ivory-deep hover:text-ink lg:hidden"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden /> 목록으로
        </button>
      )}
      <PCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.6rem] leading-tight font-extrabold text-ink">{dateTitle(p)}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-soft">
              <KindPill p={p} />
              {!otc && <StatusPill tone="outline">{p.department || "진료과 미입력"}</StatusPill>}
              {p.clinic && <span className="text-sm">{p.clinic}</span>}
              <span className="text-sm">
                {otc ? "제품" : "약"} {items.length}개 · {SOURCE_LABEL[p.source]}로 등록
              </span>
            </p>
          </div>
          {!readOnly && store && (
            <button
              type="button"
              aria-pressed={p.starred}
              aria-label={p.starred ? "보관 해제" : "기록 보관 (★)"}
              onClick={() => run(() => store.setStarred(p.id, !p.starred))}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl border",
                p.starred ? "border-brand-300 bg-brand-100 text-brand-800" : "border-line bg-white text-ink-soft",
              )}
            >
              <Star className="h-5 w-5" fill={p.starred ? "currentColor" : "none"} aria-hidden />
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PButton size="md" icon={Presentation} onClick={() => setShowing(true)}>
            진료 때 보여주기
          </PButton>
          {!readOnly && store && (
            <PButton size="md" variant="secondary" icon={Pencil} onClick={() => setEditMeta((v) => !v)}>
              {otc ? "등록 정보 수정" : "처방 정보 수정"}
            </PButton>
          )}
          {!readOnly && onShare && (
            <PButton size="md" variant="secondary" icon={Share2} onClick={() => onShare(p.id)}>
              {activeShares ? `공유 중 ${activeShares}명` : "이 기록 공유하기"}
            </PButton>
          )}
        </div>
        {editMeta && store && <MetaEditor p={p} store={store} onDone={() => setEditMeta(false)} />}
        <Alert className="mt-3">{action.error}</Alert>
        <Notice className="mt-3">{notice}</Notice>
        {p.guidance && (
          <div className="mt-3">
            <SourceNote source="rx" text={p.guidance} />
          </div>
        )}
      </PCard>

      <section aria-label={otc ? "등록한 제품" : "그때 받은 약"} className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">{otc ? "등록한 제품" : "그때 받은 약"}</h3>
        {items.map((i) => (
          <PCard key={i.id} className="!p-4" aria-label={`${otc ? "제품" : "처방 약"}: ${i.name}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-lg font-bold break-words text-ink">
                {i.name}
                {i.strength && !i.name.includes(i.strength) && <span className="ml-1 text-ink-soft">{i.strength}</span>}
              </p>
              <span className="flex shrink-0 gap-1">
                {i.starred && <Star className="h-5 w-5 text-brand-700" fill="currentColor" aria-label="보관한 약" />}
                {i.active && <StatusPill check>복용 중</StatusPill>}
              </span>
            </div>
            {(i.ingredients || i.company) && (
              <p className="mt-0.5 text-sm text-ink-soft">{[i.ingredients && `성분 ${i.ingredients}`, i.company].filter(Boolean).join(" · ")}</p>
            )}
            <div className="mt-1.5">
              <CategoryPills item={i} />
            </div>
            {(!otc || i.dosage || i.frequency) && <p className="mt-1.5 text-sm font-semibold text-brand-800">{howToTake(i)}</p>}
            {!otc && <p className="text-sm text-ink-soft">기간: {i.duration || "미입력"}</p>}
            <div className="mt-2 space-y-1.5">
              <SourceNote source="rx" text={i.cautionRx} />
              <SourceNote source="mfds" text={i.cautionMfds} />
            </div>
            {!readOnly && store && (
              <div className="mt-2">
                <Switch
                  label="지금 복용 중"
                  description={otc ? "등록했다고 복용한 것으로 보지 않아요. 실제로 먹고 있을 때만 켜 주세요." : undefined}
                  checked={i.active}
                  onChange={(v) => run(() => store.setItemActive(i.id, v))}
                />
              </div>
            )}
            {onOpenItem && (
              <button
                type="button"
                onClick={() => onOpenItem(i.id)}
                className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                이 약의 경험 모아 보기 · 종류 고치기 <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </PCard>
        ))}
      </section>

      <section aria-label="복용 후 느낀 점" className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">복용 후 느낀 점</h3>
        <p className="px-1 text-xs text-ink-soft">
          {SOURCE_TEXT.user}이에요. 도움이 된 점과 불편했던 점을 함께 적을 수 있고, 여러 약을 함께 먹었다면 ‘{otc ? "이 등록 전체" : "처방 전체"}’로 남겨
          두세요.
        </p>
        {!readOnly && store && <NoteEditor p={p} items={items} store={store} />}
        {notes.length === 0 ? (
          <PCard tone="ivory">
            <p className="text-sm text-ink-soft">아직 남긴 복용 경험이 없어요.</p>
          </PCard>
        ) : (
          <ul className="space-y-2" aria-label="복용 경험 목록">
            {notes.map((n) => {
              const name = items.find((i) => i.id === n.itemId)?.name;
              return (
                <li key={n.id}>
                  <NoteCard
                    note={n}
                    targetName={name ?? (otc ? "이 등록 전체" : "처방 전체")}
                    items={items}
                    kind={p.kind}
                    store={readOnly ? null : store}
                    onQuestion={
                      readOnly || !repo
                        ? undefined
                        : async () => {
                            const r = await action.run(() => repo.addVisitQuestion(p.patientId, questionFromNote(p, n, name), p.id));
                            if (r.ok) setNotice("다음 진료 질문에 담았어요. 진료 준비와 '진료 때 보여주기'에서 고칠 수 있어요.");
                          }
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section aria-label="이 기록에서 담은 질문" className="space-y-2">
          <h3 className="px-1 text-lg font-bold text-ink">다음 진료 질문</h3>
          {related.map((q) => (
            <QuestionItem key={`${q.id}-${q.updatedAt ?? ""}`} q={q} repo={repo} readOnly={readOnly} />
          ))}
        </section>
      )}

      <SoftSheet open={showing} title="진료 때 보여주기" onClose={() => setShowing(false)}>
        {showing && <VisitShow p={p} snapshot={snapshot} questions={questions} repo={readOnly ? undefined : repo} />}
      </SoftSheet>
    </div>
  );
}

/** 복용 메모 → 질문 문장 (고칠 수 있음) */
export function questionFromNote(p: Prescription, n: RxNote, itemName?: string): string {
  const head = `${slashDate(p.prescribedOn)} ${p.kind === "otc" ? "일반약" : `${p.department || ""} 처방`}${itemName ? ` ${itemName}` : ""}`
    .replace(/\s+/g, " ")
    .trim();
  const body = [n.tags.map(tagLabel).join(", "), n.memo].filter(Boolean).join(" — ");
  return `${head}: ${body} — 괜찮을까요?`.slice(0, 200);
}

function MetaEditor({ p, store, onDone }: { p: Prescription; store: RxStore; onDone: () => void }) {
  const [date, setDate] = useState(p.prescribedOn);
  const [dept, setDept] = useState(p.department);
  const [clinic, setClinic] = useState(p.clinic);
  const action = useAsyncAction();
  return (
    <form
      className="mt-4 grid gap-2 rounded-2xl bg-ivory p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(() =>
          store.updatePrescription(p.id, { prescribedOn: date, clinic, ...(p.kind === "prescription" && { department: dept }) }),
        );
        if (r.ok) onDone();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">{p.kind === "otc" ? "구매·등록일" : "처방일"}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-white px-3" />
      </label>
      {p.kind === "prescription" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-ink-soft">진료과</span>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-white px-3">
            <option value="">선택 안 함</option>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      ) : (
        <span />
      )}
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-ink-soft">{p.kind === "otc" ? "약국 (선택)" : "의료기관 (선택)"}</span>
        <input value={clinic} maxLength={60} onChange={(e) => setClinic(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-white px-3" />
      </label>
      <Alert className="sm:col-span-2">{action.error}</Alert>
      <PButton type="submit" size="sm" className="sm:col-span-2" disabled={!date || action.pending}>
        저장
      </PButton>
    </form>
  );
}

/** 진료 때 보여주기 — 날짜·진료과·당시 약(성분·함량)·복용 경험·질문을 한 화면에 */
export function VisitShow({ p, snapshot, questions, repo }: { p: Prescription; snapshot: RxSnapshot; questions: VisitQuestion[]; repo?: SupabaseRepository }) {
  const items = itemsOf(snapshot, p.id);
  const notes = notesOf(snapshot, p.id);
  const related = questions.filter((q) => q.prescriptionId === p.id);
  const others = questions.filter((q) => q.prescriptionId !== p.id && !q.done);
  return (
    <div className="space-y-4 text-[1.05rem]" aria-label="진료 때 보여줄 내용">
      <PCard tone="tint">
        <p className="text-sm font-bold text-brand-800">{p.kind === "otc" ? "일반약 등록" : "처방"}</p>
        <p className="text-2xl font-extrabold text-brand-900">
          {dotDate(p.prescribedOn)} · {p.kind === "otc" ? p.clinic || "일반약" : p.department || "진료과 미입력"}
        </p>
        {p.kind === "prescription" && p.clinic && <p className="text-sm text-brand-800">{p.clinic}</p>}
      </PCard>
      <PCard>
        <p className="mb-2 font-bold text-ink">
          {p.kind === "otc" ? "제품" : "당시 약"} ({items.length}개)
        </p>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="border-b border-line pb-2 last:border-0">
              <p className="font-bold text-ink">
                {i.name}
                {i.strength && !i.name.includes(i.strength) && ` ${i.strength}`}
              </p>
              {i.ingredients && <p className="text-sm text-ink-soft">성분 {i.ingredients}</p>}
              <p className="text-sm text-ink-soft">
                {howToTake(i)}
                {i.duration && ` · ${i.duration}`}
              </p>
            </li>
          ))}
        </ul>
      </PCard>
      <PCard>
        <p className="mb-1 font-bold text-ink">복용 경험</p>
        <p className="mb-2 text-xs text-ink-soft">출처: {SOURCE_TEXT.user} — 의학적 판단이 아니에요.</p>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-soft">남긴 경험이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const name = items.find((i) => i.id === n.itemId)?.name;
              return (
                <li key={n.id} className="rounded-xl bg-ivory p-3">
                  <p className="font-semibold text-ink">{experienceSentence(p, n, name)}</p>
                  <div className="mt-1">
                    <TagPills tags={n.tags} small />
                  </div>
                  {n.memo && <p className="mt-1 text-sm text-ink">“{n.memo}”</p>}
                </li>
              );
            })}
          </ul>
        )}
      </PCard>
      <PCard>
        <p className="mb-2 font-bold text-ink">물어볼 질문</p>
        {related.length + others.length === 0 ? (
          <p className="text-sm text-ink-soft">담아 둔 질문이 없어요. 복용 경험에서 ‘다음 진료 질문에 담기’를 눌러 보세요.</p>
        ) : (
          <div className="space-y-2">
            {related.map((q) => (
              <QuestionItem key={`${q.id}-${q.updatedAt ?? ""}`} q={q} repo={repo} readOnly={!repo} />
            ))}
            {others.length > 0 && <p className="pt-1 text-xs font-bold text-ink-soft">그 밖의 질문</p>}
            {others.map((q) => (
              <QuestionItem key={`${q.id}-${q.updatedAt ?? ""}`} q={q} repo={repo} readOnly={!repo} />
            ))}
          </div>
        )}
      </PCard>
      <p className="px-1 text-xs text-ink-soft">이 화면은 사용자가 직접 보여 주는 기록이에요. 병원 시스템으로 전송되지 않아요.</p>
    </div>
  );
}
