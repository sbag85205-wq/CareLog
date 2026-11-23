"use client";

import { PackagePlus, Search, Star, X } from "lucide-react";
import { useState } from "react";
import { MedicationsView } from "@/components/patient-db/MedicationsView";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { BottleIcon } from "@/components/patient-ui/illustrations";
import { ChipGroup, cn, Notice, PButton, PCard, Segmented, Switch } from "@/components/patient-ui/kit";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { CATEGORIES } from "@/lib/rx/categories";
import {
  filterItems,
  monthLabel,
  notesForItem,
  slashDate,
  usedDepartments,
  usedMonths,
  usedTags,
  type ItemRow,
  type RxFilter,
  type RxSnapshot,
  type UseState,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { medicationsOf } from "@/lib/selectors";
import type { Patient } from "@/types";
import { ItemDetail } from "./ItemDetail";
import { RxHistory } from "./RxHistory";
import { CategoryPills, KindPill, TagPills } from "./RxParts";

export type RecordsView = "items" | "records";
export interface RecordsNav {
  view?: RecordsView;
  filter?: RxFilter;
  record?: string | null;
  item?: string | null;
}

const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

/**
 * 나의 약 기록 — 예전에 먹었던 약을 다시 찾는 핵심 화면
 * 약별(제품 단위) · 처방/등록별(묶음 단위) 모두, 날짜·약 종류·진료과·경험 태그·★·제품명 조건을 함께 (AI 호출 없이 저장된 값만)
 */
export function MedRecordsView({
  snapshot,
  rx,
  rxStore,
  patient,
  repo,
  initial = {},
  notice,
  onRegister,
  onShare,
}: {
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  rxStore: RxStore | null;
  patient: Patient;
  repo: SupabaseRepository;
  initial?: RecordsNav;
  notice?: string | null;
  onRegister: () => void;
  onShare: (prescriptionId: string) => void;
}) {
  const [view, setView] = useState<RecordsView>(initial.view ?? (initial.record ? "records" : "items"));
  const [f, setF] = useState<RxFilter>(initial.filter ?? {});
  const [record, setRecord] = useState<string | null>(initial.record ?? null);
  const [item, setItem] = useState<string | null>(initial.item ?? null);
  const set = (patch: Partial<RxFilter>) => setF((cur) => ({ ...cur, ...patch }));
  const meds = medicationsOf(snapshot, patient.id);

  if (rx?.available && item) {
    const it = rx.items.find((i) => i.id === item);
    if (it)
      return (
        <ItemDetail
          key={it.id}
          item={it}
          snapshot={rx}
          store={rxStore}
          onBack={() => setItem(null)}
          onOpenRecord={(id) => {
            setItem(null);
            setRecord(id);
            setView("records");
          }}
        />
      );
  }

  const rows = rx?.available ? filterItems(rx, f) : [];
  const usedCats = rx?.available ? CATEGORIES.filter((c) => rx.items.some((i) => i.categories.includes(c.id))) : [];
  const active = Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : v && v !== "all")).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="나의 약 기록"
        sub="그때 먹었던 약을 날짜·종류·진료과·경험으로 다시 찾아요."
        action={
          <PButton size="md" icon={PackagePlus} onClick={onRegister}>
            약 등록하기
          </PButton>
        }
      />
      {rx && !rx.available && <Notice>{rx.message}</Notice>}
      <Notice>{notice}</Notice>

      {rx?.available && (
        <>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-soft" aria-hidden />
            <input
              value={f.query ?? ""}
              onChange={(e) => set({ query: e.target.value || undefined })}
              placeholder="기억나는 제품명·성분 일부"
              aria-label="제품명·성분으로 찾기"
              className="h-14 w-full rounded-[1.25rem] border border-line bg-white pr-4 pl-12 text-lg outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <PCard className="space-y-3 !p-4" aria-label="찾기 조건">
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">복용 상태</p>
              <ChipGroup<UseState>
                ariaLabel="복용 상태"
                value={f.use ?? "all"}
                onChange={(v) => set({ use: v })}
                options={[
                  { value: "all", label: "전체 약" },
                  { value: "current", label: "지금 복용 중" },
                  { value: "past", label: "과거 복용 기록" },
                ]}
              />
            </div>
            {usedCats.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-ink-soft">약 종류</p>
                <ChipGroup
                  ariaLabel="약 종류"
                  value={f.category ?? ""}
                  onChange={(v) => set({ category: v === f.category || !v ? undefined : v })}
                  options={[{ value: "", label: "전체" }, ...usedCats.map((c) => ({ value: c.id, label: c.label }))]}
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {usedDepartments(rx).length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-bold text-ink-soft">진료과</p>
                  <ChipGroup
                    ariaLabel="진료과"
                    value={f.department ?? ""}
                    onChange={(d) => set({ department: d || undefined })}
                    options={[{ value: "", label: "전체" }, ...usedDepartments(rx).map((d) => ({ value: d, label: d }))]}
                  />
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink-soft">날짜</span>
                <select
                  value={f.month ?? ""}
                  onChange={(e) => set({ month: e.target.value || undefined })}
                  aria-label="등록한 달"
                  className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
                >
                  <option value="">전체 기간</option>
                  {usedMonths(rx).map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Switch label="★ 보관한 약·기록만" checked={Boolean(f.starredOnly)} onChange={(v) => set({ starredOnly: v || undefined })} />
            {usedTags(rx).length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-ink-soft">복용 경험 태그</p>
                <ChipGroup
                  ariaLabel="복용 경험 태그"
                  value={f.tags ?? []}
                  onChange={(t) => set({ tags: toggle(f.tags ?? [], t) })}
                  options={usedTags(rx).map((t) => ({ value: t, label: t }))}
                />
              </div>
            )}
            {active > 0 && (
              <PButton size="sm" variant="ghost" icon={X} onClick={() => setF({})}>
                조건 지우기
              </PButton>
            )}
          </PCard>

          <div className="max-w-md">
            <Segmented
              ariaLabel="보는 방법"
              items={[
                { value: "items" as RecordsView, label: "약별로" },
                { value: "records" as RecordsView, label: "처방·등록별로" },
              ]}
              value={view}
              onChange={(v) => {
                setView(v);
                setRecord(null);
              }}
            />
          </div>

          {view === "items" ? (
            <section aria-label="찾은 약" className="space-y-2">
              <h2 className="px-1 text-sm font-bold text-ink-soft">찾은 약 · {rows.length}개</h2>
              {rows.length === 0 ? (
                <PCard tone="ivory" className="flex flex-col items-center gap-2 text-center">
                  <BottleIcon className="h-20 w-20" />
                  <p className="text-ink-soft">
                    {rx.items.length
                      ? "조건에 맞는 약이 없어요. 조건을 줄여 보세요."
                      : "아직 등록한 약이 없어요. ‘약 등록하기’로 처방전이나 일반약을 등록해 보세요."}
                  </p>
                </PCard>
              ) : (
                <ul className="grid gap-2 lg:grid-cols-2">
                  {rows.map((r) => (
                    <li key={r.item.id}>
                      <ItemCard row={r} rx={rx} store={rxStore} onOpen={() => (setItem(r.item.id), window.scrollTo({ top: 0 }))} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <RxHistory
              key={record ?? "none"}
              snapshot={rx}
              store={rxStore}
              repo={repo}
              questions={snapshot.visitQuestions}
              initialSelected={record}
              filter={f}
              onOpenItem={(id) => (setItem(id), window.scrollTo({ top: 0 }))}
              onShare={onShare}
            />
          )}
        </>
      )}

      {(meds.length > 0 || !rx?.available) && (
        <details className="rounded-[1.5rem] bg-ivory-deep px-4 py-3" open={!rx?.available}>
          <summary className="cursor-pointer font-semibold text-ink-soft">예전 방식으로 적어 둔 약 ({meds.length}개)</summary>
          <div className="mt-3">
            <MedicationsView
              medications={meds}
              patientId={patient.id}
              repo={repo}
              editable
              embedded
              title="직접 추가한 약"
              sub="처방전 없이 따로 적어 둔 약이에요."
            />
          </div>
        </details>
      )}
    </div>
  );
}

function ItemCard({ row: { item: i, prescription: p }, rx, store, onOpen }: { row: ItemRow; rx: RxSnapshot; store: RxStore | null; onOpen: () => void }) {
  const tags = [...new Set(notesForItem(rx, i).flatMap((n) => n.tags))];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${i.name} · ${slashDate(p.prescribedOn)}`}
        className="w-full rounded-[1.25rem] border border-line bg-white p-4 pr-14 text-left transition hover:border-brand-300"
      >
        <span className="flex flex-wrap items-center gap-2">
          <KindPill p={p} />
          <span className="text-sm text-ink-soft">
            {slashDate(p.prescribedOn)}
            {p.kind === "prescription" && p.department && ` · ${p.department}`}
          </span>
          {i.active && <span className="text-xs font-bold text-brand-700">복용 중</span>}
        </span>
        <span className="mt-1 block text-lg font-bold break-words text-ink">{i.name}</span>
        {i.ingredients && <span className="block text-sm text-ink-soft">성분 {i.ingredients}</span>}
        <span className="mt-1.5 block">
          <CategoryPills item={i} />
        </span>
        {tags.length > 0 && (
          <span className="mt-1.5 block">
            <TagPills tags={tags.slice(0, 4)} small />
          </span>
        )}
      </button>
      {store && (
        <button
          type="button"
          aria-pressed={i.starred}
          aria-label={`${i.name} ${i.starred ? "보관 해제" : "보관"}`}
          onClick={() => void store.updateItem(i.id, { starred: !i.starred })}
          className={cn(
            "absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-xl",
            i.starred ? "text-brand-700" : "text-ink-soft/60 hover:text-ink-soft",
          )}
        >
          <Star className="h-5 w-5" fill={i.starred ? "currentColor" : "none"} aria-hidden />
        </button>
      )}
    </div>
  );
}
