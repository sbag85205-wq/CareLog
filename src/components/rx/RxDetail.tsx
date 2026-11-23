"use client";

import { ChevronLeft, MessageSquarePlus, Pencil, Presentation, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, ChipGroup, cn, Notice, PButton, PCard, SoftSheet, StatusPill, Switch, TextArea } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime, formatLongKoreanDate } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import { DEPARTMENTS, EXPERIENCE_TAGS, itemsOf, notesOf, slashDate, type Prescription, type RxNote, type RxSnapshot } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import type { VisitQuestion } from "@/types";
import { howToTake, QuestionItem, SourceNote } from "./RxParts";

const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

/** 처방 상세 — 그때 확인해 저장한 약·복용 방법·기간·주의사항 + 환자 본인이 남긴 복용 경험 */
export function RxDetail({
  prescription: p,
  snapshot,
  store,
  repo,
  questions,
  readOnly,
  onBack,
}: {
  prescription: Prescription;
  snapshot: RxSnapshot;
  store: RxStore | null;
  repo?: SupabaseRepository;
  questions: VisitQuestion[];
  readOnly?: boolean;
  onBack?: () => void;
}) {
  const items = itemsOf(snapshot, p.id);
  const notes = notesOf(snapshot, p.id);
  const related = questions.filter((q) => q.prescriptionId === p.id);
  const [showing, setShowing] = useState(false);
  const [editMeta, setEditMeta] = useState(false);
  const action = useAsyncAction();
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => void action.run(fn);

  return (
    <div className="space-y-4" aria-label="처방 상세">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex min-h-10 items-center gap-0.5 rounded-xl px-2 text-ink-soft hover:bg-ivory-deep hover:text-ink lg:hidden"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden /> 처방 목록
        </button>
      )}
      <PCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.6rem] leading-tight font-extrabold text-ink">{formatLongKoreanDate(p.prescribedOn).replace(/ \S+요일$/, "")} 처방</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-soft">
              <StatusPill tone="outline">{p.department || "진료과 미입력"}</StatusPill>
              {p.clinic && <span className="text-sm">{p.clinic}</span>}
              <span className="text-sm">약 {items.length}개</span>
            </p>
          </div>
          {!readOnly && store && (
            <button
              type="button"
              aria-pressed={p.starred}
              aria-label={p.starred ? "보관 해제" : "처방 보관 (★)"}
              onClick={() => run(() => store.setStarred(p.id, !p.starred))}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl border",
                p.starred ? "border-sage-300 bg-sage-100 text-sage-800" : "border-line bg-white text-ink-soft",
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
              처방 정보 수정
            </PButton>
          )}
        </div>
        {editMeta && store && <MetaEditor p={p} store={store} onDone={() => setEditMeta(false)} />}
        {!readOnly && store && (
          <div className="mt-4 border-t border-line pt-3">
            <Switch
              label="보호자와 공유"
              description="보호자에게 '약 정보' 공유를 허락했을 때 이 처방과 복용 경험이 보여요"
              checked={p.visibleToGuardian}
              onChange={(v) => run(() => store.setVisibleToGuardian(p.id, v))}
            />
          </div>
        )}
        <Alert className="mt-3">{action.error}</Alert>
        <Notice className="mt-3">{notice}</Notice>
        {p.guidance && (
          <div className="mt-3">
            <SourceNote source="rx" text={p.guidance} />
          </div>
        )}
      </PCard>

      <section aria-label="그때 받은 약" className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">그때 받은 약</h3>
        {items.map((i) => (
          <PCard key={i.id} className="!p-4" aria-label={`처방 약: ${i.name}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-bold break-words text-ink">
                {i.name}
                {i.strength && !i.name.includes(i.strength) && <span className="ml-1 text-ink-soft">{i.strength}</span>}
              </p>
              {i.active && <StatusPill check>복용 중</StatusPill>}
            </div>
            <p className="mt-1 text-sm font-semibold text-sage-800">{howToTake(i)}</p>
            <p className="text-sm text-ink-soft">기간: {i.duration || "미입력"}</p>
            <div className="mt-2 space-y-1.5">
              <SourceNote source="rx" text={i.cautionRx} />
              <SourceNote source="mfds" text={i.cautionMfds} />
            </div>
            {!readOnly && store && (
              <div className="mt-2">
                <Switch label="지금 복용 중" checked={i.active} onChange={(v) => run(() => store.setItemActive(i.id, v))} />
              </div>
            )}
          </PCard>
        ))}
      </section>

      <section aria-label="복용 후 느낀 점" className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">복용 후 느낀 점</h3>
        <p className="px-1 text-xs text-ink-soft">환자 본인이 남긴 경험이에요. 도움이 된 점과 불편했던 점을 함께 적을 수 있어요.</p>
        {!readOnly && store && <NoteEditor p={p} items={items} store={store} />}
        {notes.length === 0 ? (
          <PCard tone="ivory">
            <p className="text-sm text-ink-soft">아직 남긴 복용 경험이 없어요.</p>
          </PCard>
        ) : (
          <ul className="space-y-2" aria-label="복용 경험 목록">
            {notes.map((n) => (
              <li key={n.id}>
                <NoteCard
                  note={n}
                  itemName={items.find((i) => i.id === n.itemId)?.name}
                  p={p}
                  items={items}
                  store={readOnly ? null : store}
                  onQuestion={
                    readOnly || !repo
                      ? undefined
                      : async () => {
                          const text = questionFromNote(p, n, items.find((i) => i.id === n.itemId)?.name);
                          const r = await action.run(() => repo.addVisitQuestion(p.patientId, text, p.id));
                          if (r.ok) setNotice("다음 진료 질문에 담았어요. 진료 준비와 '진료 때 보여주기'에서 고칠 수 있어요.");
                        }
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section aria-label="이 처방에서 담은 질문" className="space-y-2">
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
  const head = `${slashDate(p.prescribedOn)} ${p.department || ""} 처방${itemName ? ` ${itemName}` : ""}`.replace(/\s+/g, " ").trim();
  const body = [n.tags.join(", "), n.memo].filter(Boolean).join(" — ");
  return `${head}: ${body} — 괜찮을까요?`.slice(0, 200);
}

function MetaEditor({ p, store, onDone }: { p: Prescription; store: RxStore; onDone: () => void }) {
  const [date, setDate] = useState(p.prescribedOn);
  const [dept, setDept] = useState(p.department);
  const action = useAsyncAction();
  return (
    <form
      className="mt-4 grid gap-2 rounded-2xl bg-ivory p-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await action.run(() =>
          store.updatePrescription(p.id, {
            prescribedOn: date,
            department: dept,
          }),
        );
        if (r.ok) onDone();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">처방일</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">진료과</span>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3">
          <option value="">선택 안 함</option>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <Alert className="sm:col-span-2">{action.error}</Alert>
      <PButton type="submit" size="sm" className="sm:col-span-2" disabled={!date || action.pending}>
        저장
      </PButton>
    </form>
  );
}

function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-xs font-bold text-sage-800">도움이 된 점</p>
        <ChipGroup
          ariaLabel="도움이 된 점"
          value={value}
          onChange={(t) => onChange(toggle(value, t))}
          options={EXPERIENCE_TAGS.good.map((t) => ({ value: t, label: t }))}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-bold text-blush-700">불편했던 점</p>
        <ChipGroup
          ariaLabel="불편했던 점"
          value={value}
          onChange={(t) => onChange(toggle(value, t))}
          options={EXPERIENCE_TAGS.bad.map((t) => ({ value: t, label: t }))}
        />
      </div>
    </div>
  );
}

function TargetPicker({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-ink-soft">어느 약에 대한 기록인가요?</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[0.95rem]"
        aria-label="기록 대상"
      >
        <option value="">처방 전체 (함께 먹은 약 모두)</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NoteEditor({ p, items, store }: { p: Prescription; items: { id: string; name: string }[]; store: RxStore }) {
  const [tags, setTags] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [target, setTarget] = useState("");
  const action = useAsyncAction();
  return (
    <PCard className="space-y-3" aria-label="복용 경험 남기기">
      <TargetPicker value={target} onChange={setTarget} items={items} />
      <TagPicker value={tags} onChange={setTags} />
      <TextArea
        label="메모"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={2}
        maxLength={1000}
        counter
        placeholder="예: 콧물은 줄었는데 저녁 약 먹고 속이 쓰렸어요 (가상 데이터만 입력)"
      />
      <Alert>{action.error}</Alert>
      <PButton
        size="md"
        className="w-full"
        disabled={(tags.length === 0 && !memo.trim()) || action.pending}
        onClick={async () => {
          const r = await action.run(() =>
            store.addNote({
              prescriptionId: p.id,
              patientId: p.patientId,
              itemId: target || null,
              tags,
              memo,
            }),
          );
          if (r.ok) {
            setTags([]);
            setMemo("");
            setTarget("");
          }
        }}
      >
        복용 경험 저장
      </PButton>
    </PCard>
  );
}

function NoteCard({
  note: n,
  itemName,
  p,
  items,
  store,
  onQuestion,
}: {
  note: RxNote;
  itemName?: string;
  p: Prescription;
  items: { id: string; name: string }[];
  store: RxStore | null;
  onQuestion?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(n.tags);
  const [memo, setMemo] = useState(n.memo);
  const [target, setTarget] = useState(n.itemId ?? "");
  const action = useAsyncAction();
  const edited = n.updatedAt.slice(0, 16) !== n.createdAt.slice(0, 16);
  return (
    <PCard className="!p-4" aria-label={`복용 경험: ${itemName ?? "처방 전체"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          <span className="font-bold text-sage-800">환자 본인이 남긴 경험</span> · {itemName ?? "처방 전체"} · 작성 {formatDateTime(n.createdAt)}
          {edited && ` · 수정 ${formatDateTime(n.updatedAt)}`}
        </p>
      </div>
      {editing && store ? (
        <div className="mt-3 space-y-3">
          <TargetPicker value={target} onChange={setTarget} items={items} />
          <TagPicker value={tags} onChange={setTags} />
          <TextArea label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} maxLength={1000} counter />
          <Alert>{action.error}</Alert>
          <div className="flex gap-2">
            <PButton
              size="sm"
              disabled={(tags.length === 0 && !memo.trim()) || action.pending}
              onClick={async () => {
                const r = await action.run(() =>
                  store.updateNote(n.id, {
                    itemId: target || null,
                    tags,
                    memo,
                  }),
                );
                if (r.ok) setEditing(false);
              }}
            >
              수정 저장
            </PButton>
            <PButton size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </PButton>
          </div>
        </div>
      ) : (
        <>
          {n.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {n.tags.map((t) => (
                <StatusPill key={t} tone={(EXPERIENCE_TAGS.bad as readonly string[]).includes(t) ? "warn" : "sage"}>
                  {t}
                </StatusPill>
              ))}
            </div>
          )}
          {n.memo && <p className="mt-2 break-words whitespace-pre-line text-ink">{n.memo}</p>}
          {(store || onQuestion) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onQuestion && (
                <PButton size="sm" variant="soft" icon={MessageSquarePlus} onClick={onQuestion}>
                  다음 진료 질문에 담기
                </PButton>
              )}
              {store && (
                <>
                  <PButton size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                    수정
                  </PButton>
                  <PButton size="sm" variant="ghost" icon={Trash2} onClick={() => void action.run(() => store.deleteNote(n.id))} aria-label="복용 경험 삭제">
                    삭제
                  </PButton>
                </>
              )}
            </div>
          )}
          <Alert className="mt-2">{action.error}</Alert>
        </>
      )}
      <span className="sr-only">{p.department}</span>
    </PCard>
  );
}

/** 진료 때 보여주기 — 날짜·진료과·당시 약·복용 경험·관련 질문을 한 화면에 */
export function VisitShow({ p, snapshot, questions, repo }: { p: Prescription; snapshot: RxSnapshot; questions: VisitQuestion[]; repo?: SupabaseRepository }) {
  const items = itemsOf(snapshot, p.id);
  const notes = notesOf(snapshot, p.id);
  const related = questions.filter((q) => q.prescriptionId === p.id);
  const others = questions.filter((q) => q.prescriptionId !== p.id && !q.done);
  return (
    <div className="space-y-4 text-[1.05rem]" aria-label="진료 때 보여줄 내용">
      <PCard tone="tint">
        <p className="text-sm font-bold text-sage-800">처방</p>
        <p className="text-2xl font-extrabold text-sage-900">
          {formatLongKoreanDate(p.prescribedOn).replace(/ \S+요일$/, "")} · {p.department || "진료과 미입력"}
        </p>
        {p.clinic && <p className="text-sm text-sage-800">{p.clinic}</p>}
      </PCard>
      <PCard>
        <p className="mb-2 font-bold text-ink">당시 약 ({items.length}개)</p>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="border-b border-line pb-2 last:border-0">
              <p className="font-bold text-ink">{i.name}</p>
              <p className="text-sm text-ink-soft">
                {howToTake(i)} · {i.duration || "기간 미입력"}
              </p>
            </li>
          ))}
        </ul>
      </PCard>
      <PCard>
        <p className="mb-2 font-bold text-ink">복용 경험 (환자 본인 기록)</p>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-soft">남긴 경험이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-ivory p-3">
                <p className="text-xs text-ink-soft">{items.find((i) => i.id === n.itemId)?.name ?? "처방 전체"}</p>
                <p className="font-semibold text-ink">{n.tags.join(" · ")}</p>
                {n.memo && <p className="text-ink">{n.memo}</p>}
              </li>
            ))}
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
    </div>
  );
}
