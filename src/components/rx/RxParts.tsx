"use client";

import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { Alert, cn, PButton, StatusPill } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/date";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import { CATEGORY_SOURCE_LABEL, categoryLabel } from "@/lib/rx/categories";
import {
  endDate,
  howToTake as howToTakeModel,
  isDiscomfortTag,
  KIND_LABEL,
  slashDate,
  tagGroup,
  tagLabel,
  type Prescription,
  type RxItem,
} from "@/lib/rx/model";
import type { VisitQuestion } from "@/types";

/** 정보 출처 — 처방전·복약 안내 / 식약처 / 사용자 본인의 경험을 항상 구분해 표시 */
export const SOURCE_TEXT = {
  rx: "처방전·복약 안내에 기재된 정보",
  mfds: "식약처 제공 정보",
  user: "환자가 직접 남긴 경험",
} as const;

export function SourceNote({ source, text, title }: { source: keyof typeof SOURCE_TEXT; text: string; title?: string }) {
  if (!text.trim()) return null;
  return (
    <div className={cn("rounded-xl px-3 py-2 text-sm", source === "mfds" ? "bg-sage-50" : "bg-ivory")}>
      <StatusPill tone={source === "rx" ? "ivory" : source === "mfds" ? "outline" : "sage"} className="!px-2 !py-0 !text-[0.7rem]">
        출처: {SOURCE_TEXT[source]}
      </StatusPill>
      {title && <p className="mt-1 text-xs font-bold text-ink-soft">{title}</p>}
      <p className="mt-1 break-words whitespace-pre-line text-ink">{text}</p>
    </div>
  );
}

/** 복용 방법 한 줄: 1회 1정 · 하루 3회 · 식후 30분 */
export const howToTake = howToTakeModel;

/** 약 종류 (분류 근거는 title·sr-only 로) */
export function CategoryPills({ item, showSource }: { item: Pick<RxItem, "categories" | "categorySource">; showSource?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {item.categories.map((c) => (
        <StatusPill key={c} tone={c === "unclassified" ? "warn" : "outline"} className="!px-2.5 !py-0.5 !text-xs">
          {c === "unclassified" ? "미분류 · 확인 필요" : categoryLabel(c)}
        </StatusPill>
      ))}
      {showSource && item.categorySource !== "none" && <span className="text-xs text-ink-soft">({CATEGORY_SOURCE_LABEL[item.categorySource]})</span>}
    </span>
  );
}

/** 복용 경험 태그: 도움(세이지) · 불편(분홍) · 메모 표시(아이보리) */
export function TagPills({ tags, small }: { tags: string[]; small?: boolean }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <StatusPill
          key={t}
          tone={isDiscomfortTag(t) ? "warn" : tagGroup(t) === "note" ? "ivory" : "sage"}
          className={small ? "!px-2.5 !py-0.5 !text-xs" : undefined}
        >
          {tagLabel(t) === "기타" ? `기타 (${t.replace(/^기타 /, "")})` : t}
        </StatusPill>
      ))}
    </span>
  );
}

/** 처방·일반약 표시 */
export function KindPill({ p }: { p: Pick<Prescription, "kind"> }) {
  return (
    <StatusPill tone={p.kind === "otc" ? "ivory" : "outline"} className="!px-2.5 !py-0.5 !text-xs">
      {KIND_LABEL[p.kind]}
    </StatusPill>
  );
}

/** 기간: 5일분 · 11/24까지 (지났으면 표시) */
export function periodText(p: Pick<Prescription, "prescribedOn">, i: Pick<RxItem, "duration">, today: string): { text: string; over: boolean } {
  const end = endDate(p.prescribedOn, i.duration);
  if (!i.duration) return { text: "기간 미입력", over: false };
  if (!end) return { text: i.duration, over: false };
  const [, m, d] = end.split("-").map(Number);
  return { text: `${i.duration} · ${m}/${d}까지`, over: end < today };
}

/** 지금 복용 중 카드 */
export function ActiveItemCard({
  item,
  prescription,
  today,
  onOpen,
  onStop,
  pending,
}: {
  item: RxItem;
  prescription: Prescription;
  today: string;
  onOpen?: () => void;
  onStop?: () => void;
  pending?: boolean;
}) {
  const period = periodText(prescription, item, today);
  return (
    <article className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-5" aria-label={`복용 중: ${item.name}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-lg font-bold break-words text-ink">
          {item.name}
          {item.strength && !item.name.includes(item.strength) && <span className="ml-1 text-base font-semibold text-ink-soft">{item.strength}</span>}
        </p>
        {period.over && <StatusPill tone="warn">기간 지남</StatusPill>}
      </div>
      <p className="mt-1 font-semibold text-sage-800">{howToTake(item)}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{period.text}</p>
      <div className="mt-2 space-y-1.5">
        <SourceNote source="rx" text={item.cautionRx} />
        <SourceNote source="mfds" text={item.cautionMfds} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="text-left text-sm font-semibold text-sage-700 underline-offset-4 hover:underline disabled:no-underline"
        >
          {slashDate(prescription.prescribedOn)} {prescription.department || "진료과 미입력"} 처방 →
        </button>
        {onStop && (
          <PButton size="sm" variant="ghost" disabled={pending} onClick={onStop}>
            복용 끝
          </PButton>
        )}
      </div>
    </article>
  );
}

/** 진료 질문 한 개 — 수정 가능, 작성·수정 시각 표시 */
export function QuestionItem({ q, repo, readOnly }: { q: VisitQuestion; repo?: SupabaseRepository; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const action = useAsyncAction();
  const edited = q.updatedAt && q.updatedAt.slice(0, 16) !== q.createdAt.slice(0, 16);
  return (
    <div className="rounded-2xl bg-ivory p-3" aria-label={`질문: ${q.text}`}>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!repo) return;
            const r = await action.run(() => repo.updateVisitQuestion(q.id, text));
            if (r.ok) setEditing(false);
          }}
        >
          <input
            aria-label="질문 수정"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[0.95rem] text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
          />
          <Alert>{action.error}</Alert>
          <div className="flex gap-2">
            <PButton type="submit" size="sm" icon={Check} disabled={!text.trim() || action.pending}>
              저장
            </PButton>
            <PButton size="sm" variant="ghost" onClick={() => (setText(q.text), setEditing(false))}>
              취소
            </PButton>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className={cn("min-w-0 break-words text-ink", q.done && "text-ink-soft line-through")}>{q.text}</p>
          {!readOnly && repo && (
            <button
              type="button"
              aria-label="질문 고치기"
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-lg p-1 text-ink-soft hover:bg-ivory-deep hover:text-ink"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-ink-soft">
        작성 {formatDateTime(q.createdAt)}
        {edited && ` · 수정 ${formatDateTime(q.updatedAt!)}`}
      </p>
    </div>
  );
}
