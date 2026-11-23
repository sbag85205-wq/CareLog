"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { ChipGroup, cn, PCard, Switch } from "@/components/patient-ui/kit";
import { CloudMascot } from "@/components/patient-ui/illustrations";
import type { SupabaseRepository } from "@/lib/repository/supabase";
import {
  filterPrescriptions,
  itemsOf,
  notesOf,
  prescriptionLabel,
  usedDepartments,
  usedTags,
  type Prescription,
  type RxFilter,
  type RxSnapshot,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import type { VisitQuestion } from "@/types";
import { RxDetail } from "./RxDetail";
import { KindPill, TagPills } from "./RxParts";

const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

/**
 * 처방 이력 — 처방일 최신순, 진료과·★ 보관·복용 경험 태그로 좁히기
 * PC: 왼쪽 목록(★ 보관한 처방 + 날짜별), 오른쪽 상세 / 모바일: 목록에서 날짜를 누르면 상세
 */
export function RxHistory({
  snapshot,
  store,
  repo,
  questions,
  readOnly,
  initialSelected,
  filter,
  onOpenItem,
  onShare,
}: {
  snapshot: RxSnapshot;
  store: RxStore | null;
  repo?: SupabaseRepository;
  questions: VisitQuestion[];
  readOnly?: boolean;
  initialSelected?: string | null;
  /** 바깥(나의 약 기록)에서 정한 찾기 조건 — 있으면 이 화면의 찾기 상자는 숨김 */
  filter?: RxFilter;
  onOpenItem?: (itemId: string) => void;
  onShare?: (prescriptionId: string) => void;
}) {
  const [department, setDepartment] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);

  const list = filterPrescriptions(
    snapshot,
    filter ?? {
      department: department || undefined,
      starredOnly,
      tags,
    },
  );
  const external = Boolean(filter);
  const inDept = filterPrescriptions(snapshot, {
    department: department || undefined,
  });
  const tagOptions = usedTags(snapshot, new Set(inDept.map((p) => p.id)));
  const starred = list.filter((p) => p.starred);
  const current = snapshot.prescriptions.find((p) => p.id === selected) ?? null;
  // PC에서는 고른 처방이 없으면 목록 첫 처방을 오른쪽에 보여 줌
  const desktopShown = current ?? list[0] ?? null;

  if (snapshot.prescriptions.length === 0) {
    return (
      <PCard tone="ivory" className="flex flex-col items-center gap-2 text-center">
        {/* 공유받은 기록 화면(readOnly)에는 마스코트를 두지 않음 */}
        {!readOnly && <CloudMascot variant="notebook" className="w-[72px]" />}
        <p className="text-ink-soft">
          {readOnly ? "공유받은 기록이 없어요." : "아직 등록한 기록이 없어요. ‘약 등록하기’로 처방전이나 일반약을 등록해 보세요."}
        </p>
      </PCard>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className={cn("space-y-4", current && "hidden lg:block")}>
        {!external && (
          <PCard className="space-y-3 !p-4" aria-label="처방 찾기">
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">진료과</p>
              <ChipGroup
                ariaLabel="진료과"
                value={department}
                onChange={(d) => {
                  setDepartment(d);
                  setTags([]);
                }}
                options={[
                  { value: "", label: "전체" },
                  ...usedDepartments(snapshot).map((d) => ({
                    value: d,
                    label: d,
                  })),
                ]}
              />
            </div>
            <Switch label="★ 보관한 처방만" checked={starredOnly} onChange={setStarredOnly} />
            {tagOptions.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-ink-soft">복용 경험 태그</p>
                <ChipGroup
                  ariaLabel="복용 경험 태그"
                  value={tags}
                  onChange={(t) => setTags((c) => toggle(c, t))}
                  options={tagOptions.map((t) => ({ value: t, label: t }))}
                />
              </div>
            )}
          </PCard>
        )}

        {starred.length > 0 && !starredOnly && !filter?.starredOnly && (
          <section aria-label="★ 보관한 기록" className="space-y-2">
            <h3 className="px-1 text-sm font-bold text-brand-800">★ 보관한 기록</h3>
            <RxList list={starred} snapshot={snapshot} selected={desktopShown?.id ?? null} onOpen={setSelected} store={readOnly ? null : store} />
          </section>
        )}
        <section aria-label="날짜별 기록" className="space-y-2">
          <h3 className="px-1 text-sm font-bold text-ink-soft">
            {starredOnly || filter?.starredOnly ? "★ 보관한 기록" : "날짜별 기록"} · {list.length}건
          </h3>
          {list.length === 0 ? (
            <PCard tone="ivory" className="!p-4">
              <p className="text-sm text-ink-soft">조건에 맞는 기록이 없어요.</p>
            </PCard>
          ) : (
            <RxList list={list} snapshot={snapshot} selected={desktopShown?.id ?? null} onOpen={setSelected} store={readOnly ? null : store} />
          )}
        </section>
      </div>

      <div className={cn(!current && "hidden lg:block")}>
        {(current ?? desktopShown) && (
          <RxDetail
            key={(current ?? desktopShown)!.id}
            prescription={(current ?? desktopShown)!}
            snapshot={snapshot}
            store={store}
            repo={repo}
            questions={questions}
            readOnly={readOnly}
            onBack={() => setSelected(null)}
            onOpenItem={onOpenItem}
            onShare={onShare}
          />
        )}
      </div>
    </div>
  );
}

function RxList({
  list,
  snapshot,
  selected,
  onOpen,
  store,
}: {
  list: Prescription[];
  snapshot: RxSnapshot;
  selected: string | null;
  onOpen: (id: string) => void;
  store: RxStore | null;
}) {
  return (
    <ul className="space-y-2">
      {list.map((p) => {
        const label = prescriptionLabel(p, itemsOf(snapshot, p.id).length);
        const tags = [...new Set(notesOf(snapshot, p.id).flatMap((n) => n.tags))];
        return (
          <li key={p.id} className="relative">
            <button
              type="button"
              onClick={() => {
                onOpen(p.id);
                window.scrollTo({ top: 0 });
              }}
              aria-label={label}
              aria-current={selected === p.id ? "true" : undefined}
              className={cn(
                "w-full rounded-[1.25rem] border p-4 pr-14 text-left transition",
                selected === p.id ? "border-brand-500 bg-brand-50 lg:shadow-sm" : "border-line bg-white hover:border-brand-300",
              )}
            >
              <span className="flex items-center gap-2">
                <KindPill p={p} />
                <span className="font-bold text-ink">{label}</span>
              </span>
              {p.clinic && <p className="text-xs text-ink-soft">{p.clinic}</p>}
              <p className="mt-0.5 truncate text-xs text-ink-soft">
                {itemsOf(snapshot, p.id)
                  .map((i) => i.name)
                  .join(", ")}
              </p>
              {tags.length > 0 && (
                <span className="mt-2 block">
                  <TagPills tags={tags.slice(0, 4)} small />
                </span>
              )}
            </button>
            {store ? (
              <button
                type="button"
                aria-pressed={p.starred}
                aria-label={`${label} ${p.starred ? "보관 해제" : "보관"}`}
                onClick={() => void store.setStarred(p.id, !p.starred)}
                className={cn(
                  "absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl",
                  p.starred ? "text-brand-700" : "text-ink-soft/60 hover:text-ink-soft",
                )}
              >
                <Star className="h-5 w-5" fill={p.starred ? "currentColor" : "none"} aria-hidden />
              </button>
            ) : (
              p.starred && <Star className="absolute top-4 right-4 h-5 w-5 text-brand-700" fill="currentColor" aria-label="보관한 처방" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
