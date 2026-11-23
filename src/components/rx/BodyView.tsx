"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { ChipGroup, Notice, PButton, PCard } from "@/components/patient-ui/kit";
import {
  dotDate,
  itemsOf,
  noteDate,
  productKey,
  productTimeline,
  slashDate,
  TAG_GROUP_LABEL,
  tagGroup,
  usedTags,
  type RxNote,
  type RxSnapshot,
  type TagGroup,
} from "@/lib/rx/model";
import { KindPill, SOURCE_TEXT, TagPills } from "./RxParts";

type GroupFilter = "all" | Exclude<TagGroup, "note">;
const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

/**
 * 내 몸의 반응 — 복용 후 느낀 경험을 모아 보기 (좋은 점 · 복용 후 불편 · 복용 과정 불편)
 * 모두 사용자가 직접 남긴 기록. 원인을 판정하지 않음.
 */
export function BodyView({
  rx,
  onOpenRecord,
  onOpenItem,
  onRegister,
  initialTags = [],
}: {
  rx: RxSnapshot | null;
  onOpenRecord: (id: string) => void;
  onOpenItem: (id: string) => void;
  onRegister: () => void;
  initialTags?: string[];
}) {
  const [group, setGroup] = useState<GroupFilter>("all");
  const [tags, setTags] = useState<string[]>(initialTags);

  if (!rx?.available) {
    return (
      <div className="space-y-5">
        <PageTitle title="내 몸의 반응" sub="약을 먹고 느낀 점을 모아 봐요." />
        <Notice>{rx?.message ?? "불러오는 중…"}</Notice>
      </div>
    );
  }
  const byRecord = new Map(rx.prescriptions.map((p) => [p.id, p]));
  const notes = [...rx.notes]
    .filter((n) => byRecord.has(n.prescriptionId))
    .filter((n) => group === "all" || n.tags.some((t) => tagGroup(t) === group))
    .filter((n) => tags.every((t) => n.tags.includes(t)))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)) || b.createdAt.localeCompare(a.createdAt));

  // 같은 제품(품목기준코드)으로 날짜가 다른 경험이 2개 이상
  const seen = new Set<string>();
  const repeated = rx.items
    .filter((i) => i.externalItemSeq)
    .filter((i) => (seen.has(productKey(i)) ? false : (seen.add(productKey(i)), true)))
    .map((i) => ({ item: i, timeline: productTimeline(rx, i).filter((t) => !t.wholeRecord) }))
    .filter((x) => new Set(x.timeline.map((t) => noteDate(t.note))).size >= 2);

  return (
    <div className="space-y-5">
      <PageTitle title="내 몸의 반응" sub="약을 먹고 느낀 좋은 점과 불편했던 점을 함께 모아 봐요." />
      <p className="rounded-2xl bg-ivory-deep px-4 py-3 text-sm text-ink-soft">
        모두 {SOURCE_TEXT.user}이에요. 앱이 약의 효과나 부작용을 판정하지 않아요. 여러 약을 함께 먹은 날의 기록은 어느 약 때문인지 확인되지 않은 것으로 보여요.
      </p>

      <PCard className="space-y-3 !p-4" aria-label="경험 고르기">
        <ChipGroup<GroupFilter>
          ariaLabel="경험 묶음"
          value={group}
          onChange={setGroup}
          options={[
            { value: "all", label: "전체" },
            { value: "good", label: "도움이 된 경험" },
            { value: "after", label: "복용 후 불편" },
            { value: "process", label: "복용 과정 불편" },
          ]}
        />
        {usedTags(rx).length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold text-ink-soft">태그로 찾기</p>
            <ChipGroup
              ariaLabel="경험 태그"
              value={tags}
              onChange={(t) => setTags((c) => toggle(c, t))}
              options={usedTags(rx).map((t) => ({ value: t, label: t }))}
            />
          </div>
        )}
      </PCard>

      {repeated.length > 0 && group === "all" && tags.length === 0 && (
        <section aria-label="같은 약을 여러 번 기록" className="space-y-2">
          <h2 className="px-1 text-lg font-bold text-ink">같은 약, 다른 날의 경험</h2>
          {repeated.map(({ item, timeline }) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenItem(item.id)}
              className="w-full rounded-[1.25rem] border border-line bg-white p-4 text-left hover:border-brand-300"
              aria-label={`${item.name} 날짜별 경험`}
            >
              <p className="flex items-center justify-between gap-2 font-bold text-ink">
                {item.name} <ChevronRight className="h-5 w-5 text-ink-soft" aria-hidden />
              </p>
              <ol className="mt-2 space-y-1.5">
                {timeline.map(({ note }) => (
                  <li key={note.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 font-semibold text-brand-800">{dotDate(noteDate(note))}</span>
                    <TagPills tags={note.tags} small />
                  </li>
                ))}
              </ol>
            </button>
          ))}
        </section>
      )}

      <section aria-label="복용 경험 모음" className="space-y-2">
        <h2 className="px-1 text-sm font-bold text-ink-soft">
          {group === "all" ? "모든 경험" : TAG_GROUP_LABEL[group]} · {notes.length}건
        </h2>
        {rx.notes.length === 0 ? (
          <PCard tone="ivory" className="space-y-3">
            <p className="text-ink-soft">
              아직 남긴 경험이 없어요. 약을 등록하고, 먹어 본 뒤 느낀 점을 남겨 보세요. 지금 먹는 약이 없어도 예전에 먹었던 약을 등록할 수 있어요.
            </p>
            <PButton size="md" onClick={onRegister}>
              약 등록하기
            </PButton>
          </PCard>
        ) : notes.length === 0 ? (
          <PCard tone="ivory">
            <p className="text-ink-soft">조건에 맞는 경험이 없어요.</p>
          </PCard>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id}>
                <ExperienceCard note={n} rx={rx} onOpenRecord={onOpenRecord} onOpenItem={onOpenItem} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExperienceCard({
  note: n,
  rx,
  onOpenRecord,
  onOpenItem,
}: {
  note: RxNote;
  rx: RxSnapshot;
  onOpenRecord: (id: string) => void;
  onOpenItem: (id: string) => void;
}) {
  const p = rx.prescriptions.find((x) => x.id === n.prescriptionId)!;
  const items = itemsOf(rx, p.id);
  const item = items.find((i) => i.id === n.itemId);
  const confirmedSuggestions = n.suggestedTags.filter((t) => n.tags.includes(t));
  return (
    <PCard className="!p-4" aria-label={`경험: ${item?.name ?? "함께 먹은 약 전체"}`}>
      <p className="text-sm font-bold text-brand-800">{dotDate(noteDate(n))}</p>
      <p className="mt-0.5 font-bold text-ink">{item ? item.name : `${p.kind === "otc" ? "이 등록 전체" : "함께 먹은 약 전체"} (${items.length}개)`}</p>
      {!item && <p className="text-xs font-semibold text-blush-700">어느 약 때문인지는 확인되지 않은 기록이에요</p>}
      <div className="mt-2">
        <TagPills tags={n.tags} />
      </div>
      {confirmedSuggestions.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> 자동 제안을 확인한 태그: {confirmedSuggestions.join(", ")}
        </p>
      )}
      {n.memo && (
        <p className="mt-2 break-words text-ink">
          <span className="mr-1 text-xs font-bold text-ink-soft">원본 메모</span>
          {n.memo}
        </p>
      )}
      {n.summary && (
        <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink">
          <span className="mr-1 text-xs font-bold text-brand-800">자동 정리</span>
          {n.summary}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <KindPill p={p} />
        <button type="button" onClick={() => onOpenRecord(p.id)} className="min-h-10 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
          {slashDate(p.prescribedOn)} {p.kind === "otc" ? "등록" : `${p.department || ""} 처방`} 보기 →
        </button>
        {item && (
          <button type="button" onClick={() => onOpenItem(item.id)} className="min-h-10 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            이 약 모아 보기 →
          </button>
        )}
      </div>
    </PCard>
  );
}
