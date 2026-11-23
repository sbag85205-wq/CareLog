"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { CloudMascot } from "@/components/patient-ui/illustrations";
import { ChipGroup, cn, Notice, PButton, PCard, Segmented } from "@/components/patient-ui/kit";
import {
  dotDate,
  isDiscomfortTag,
  itemsOf,
  monthLabel,
  noteDate,
  productKey,
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
type BodyMode = "drug" | "timeline";

/** 약별 묶음: 같은 제품(품목기준코드) 또는 '함께 먹은 약 전체' 기록 */
interface DrugGroup {
  key: string;
  title: string;
  /** 처방 전체에 남긴 기록 묶음 (어느 약 때문인지 확인 안 됨) */
  whole: boolean;
  itemId?: string;
  recordId: string;
  notes: RxNote[];
}
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
  const [mode, setMode] = useState<BodyMode>("drug");

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

  // 약별 요약 — 같은 제품(품목기준코드가 같을 때만)끼리, 처방 전체 기록은 그 기록끼리
  const groups = new Map<string, DrugGroup>();
  for (const n of notes) {
    const p = byRecord.get(n.prescriptionId)!;
    const item = n.itemId ? rx.items.find((i) => i.id === n.itemId) : undefined;
    const key = item ? productKey(item) : `record:${p.id}`;
    const g = groups.get(key) ?? {
      key,
      title: item ? item.name : `${dotDate(p.prescribedOn)} ${p.kind === "otc" ? "일반약 등록" : `${p.department || ""} 처방`} · 함께 먹은 약 전체`,
      whole: !item,
      itemId: item?.id,
      recordId: p.id,
      notes: [],
    };
    g.notes.push(n);
    groups.set(key, g);
  }
  const drugGroups = [...groups.values()];
  // 날짜별 타임라인 — 달마다 묶기
  const months = [...new Set(notes.map((n) => noteDate(n).slice(0, 7)))];

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

      {rx.notes.length > 0 && (
        <div className="max-w-md">
          <Segmented
            ariaLabel="보는 방법"
            items={[
              { value: "drug" as BodyMode, label: "약별 요약" },
              { value: "timeline" as BodyMode, label: "날짜별 타임라인" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}

      {mode === "drug" && notes.length > 0 && (
        <section aria-label="약별 요약" className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-ink-soft">약별 요약 · {drugGroups.length}개</h2>
          <ul className="grid gap-2 lg:grid-cols-2 lg:items-start">
            {drugGroups.map((g) => (
              <li key={g.key}>
                <DrugSummaryCard g={g} rx={rx} onOpenItem={onOpenItem} onOpenRecord={onOpenRecord} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="복용 경험 모음" className={cn("space-y-2", mode === "drug" && notes.length > 0 && "hidden")}>
        <h2 className="px-1 text-sm font-bold text-ink-soft">
          {group === "all" ? "모든 경험" : TAG_GROUP_LABEL[group]} · {notes.length}건
        </h2>
        {rx.notes.length === 0 ? (
          // 불러온 뒤(rx.available)에만 여기 옴 — 로딩·오류는 위에서 따로 안내
          <PCard tone="ivory" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <CloudMascot variant="notebook" className="w-[64px] shrink-0" />
            <div className="min-w-0 space-y-3">
              <p className="text-ink-soft">
                아직 남긴 경험이 없어요. 약을 등록하고, 먹어 본 뒤 느낀 점을 남겨 보세요. 지금 먹는 약이 없어도 예전에 먹었던 약을 등록할 수 있어요.
              </p>
              <PButton size="md" onClick={onRegister}>
                약 등록하기
              </PButton>
            </div>
          </PCard>
        ) : notes.length === 0 ? (
          <PCard tone="ivory">
            <p className="text-ink-soft">조건에 맞는 경험이 없어요.</p>
          </PCard>
        ) : (
          <div className="space-y-5" aria-label="날짜별 타임라인">
            {months.map((m) => (
              <div key={m}>
                <h3 className="mb-2 px-1 text-base font-bold text-brand-800">{monthLabel(m)}</h3>
                <ol className="relative space-y-3 border-l-2 border-brand-100 pl-4 sm:pl-5">
                  {notes
                    .filter((n) => noteDate(n).startsWith(m))
                    .map((n) => (
                      <li key={n.id} className="relative">
                        <span
                          className="absolute top-5 -left-[1.4rem] h-3 w-3 rounded-full border-2 border-white bg-brand-500 sm:-left-[1.65rem]"
                          aria-hidden
                        />
                        <ExperienceCard note={n} rx={rx} onOpenRecord={onOpenRecord} onOpenItem={onOpenItem} />
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
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
          <button
            type="button"
            onClick={() => onOpenItem(item.id)}
            className="min-h-10 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
          >
            이 약 모아 보기 →
          </button>
        )}
      </div>
    </PCard>
  );
}

/** 약별 요약 카드 — 경험 수·도움/불편 횟수·자주 남긴 태그, 펼치면 날짜별 기록 */
function DrugSummaryCard({
  g,
  rx,
  onOpenItem,
  onOpenRecord,
}: {
  g: DrugGroup;
  rx: RxSnapshot;
  onOpenItem: (id: string) => void;
  onOpenRecord: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const good = g.notes.filter((n) => n.tags.some((t) => tagGroup(t) === "good")).length;
  const bad = g.notes.filter((n) => n.tags.some(isDiscomfortTag)).length;
  const freq = new Map<string, number>();
  for (const n of g.notes) for (const t of n.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
  const topTags = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);
  const dates = g.notes.map(noteDate).sort();
  const panel = `drug-${g.key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  const rec = rx.prescriptions.find((p) => p.id === g.recordId)!;
  return (
    <PCard className="!p-4" aria-label={`약별 요약: ${g.title}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold break-words text-ink">{g.title}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            경험 {g.notes.length}건 · {dates.length > 1 ? `${dotDate(dates[0])} ~ ${dotDate(dates[dates.length - 1])}` : dotDate(dates[0])}
          </p>
        </div>
        <KindPill p={rec} />
      </div>
      {g.whole && <p className="mt-1 text-xs font-semibold text-peach-700">어느 약 때문인지는 확인되지 않은 기록이에요</p>}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-mint-700">도움이 된 기록 {good}</span>
        <span className="font-semibold text-peach-700">불편 기록 {bad}</span>
      </p>
      <div className="mt-2">
        <TagPills tags={topTags} small />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {open ? "날짜별 기록 접기" : "날짜별 기록 보기"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => (g.itemId ? onOpenItem(g.itemId) : onOpenRecord(g.recordId))}
          className="min-h-11 px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          {g.itemId ? "약 상세 보기 →" : "기록 보기 →"}
        </button>
      </div>
      <ol id={panel} hidden={!open} className="mt-2 space-y-2 border-l-2 border-brand-100 pl-3" aria-label={`${g.title} 날짜별 경험`}>
        {g.notes.map((n) => (
          <li key={n.id} className="rounded-[0.75rem] bg-ivory/70 p-2.5">
            <p className="text-sm font-bold text-brand-800">{dotDate(noteDate(n))}</p>
            <TagPills tags={n.tags} small />
            {n.memo && <p className="mt-1 text-sm break-words text-ink">{n.memo}</p>}
          </li>
        ))}
      </ol>
    </PCard>
  );
}
