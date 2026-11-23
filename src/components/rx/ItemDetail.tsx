"use client";

import { BookOpen, ChevronLeft, Star } from "lucide-react";
import { useState } from "react";
import { Alert, ChipGroup, cn, PButton, PCard, StatusPill } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDrugEasyInfo, type EasyInfo } from "@/lib/drug-search-client";
import { CATEGORIES, CATEGORY_SOURCE_LABEL, categoryLabel } from "@/lib/rx/categories";
import {
  dotDate,
  itemsOf,
  prescriptionLabel,
  productTimeline,
  sameProduct,
  SLOT_LABEL,
  SLOTS,
  type IntakeSlot,
  type RxItem,
  type RxSnapshot,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { NoteEditor } from "./NoteEditor";
import { KindPill, SourceNote, SOURCE_TEXT, TagPills } from "./RxParts";

const toggle = <T,>(list: T[], t: T) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

/**
 * 약 한 개 상세 — 공식 제품 정보 · 약 종류(근거 표시, 고칠 수 있음) · 같은 제품의 날짜별 복용 경험
 * 같은 제품 판단은 식약처 품목기준코드가 같을 때만 (이름이 비슷해도 합치지 않음)
 */
export function ItemDetail({
  item,
  snapshot,
  store,
  onBack,
  onOpenRecord,
}: {
  item: RxItem;
  snapshot: RxSnapshot;
  store: RxStore | null;
  onBack: () => void;
  onOpenRecord: (prescriptionId: string) => void;
}) {
  const record = snapshot.prescriptions.find((p) => p.id === item.prescriptionId)!;
  const same = sameProduct(snapshot, item);
  const timeline = productTimeline(snapshot, item);
  const action = useAsyncAction();
  const [editCats, setEditCats] = useState(false);
  const run = (fn: () => Promise<unknown>) => void action.run(fn);

  return (
    <div className="space-y-4" aria-label="약 상세">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-xl px-2 text-ink-soft hover:bg-ivory-deep hover:text-ink"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden /> 목록으로
      </button>
      <PCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.6rem] leading-tight font-extrabold break-words text-ink">{item.name}</h2>
            <p className="mt-1 text-ink-soft">{[item.strength && `함량 ${item.strength}`, item.company].filter(Boolean).join(" · ") || "제품 정보 없음"}</p>
          </div>
          {store && (
            <button
              type="button"
              aria-pressed={item.starred}
              aria-label={item.starred ? "약 보관 해제" : "약 보관 (★)"}
              onClick={() => run(() => store.updateItem(item.id, { starred: !item.starred }))}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border",
                item.starred ? "border-brand-300 bg-brand-100 text-brand-800" : "border-line bg-white text-ink-soft",
              )}
            >
              <Star className="h-5 w-5" fill={item.starred ? "currentColor" : "none"} aria-hidden />
            </button>
          )}
        </div>

        <dl className="mt-4 grid gap-x-4 gap-y-2 rounded-2xl bg-ivory p-3 text-sm sm:grid-cols-[8rem_1fr]" aria-label="제품 정보">
          <dt className="font-bold text-ink-soft">성분</dt>
          <dd className="text-ink">{item.ingredients || "확인 안 됨"}</dd>
          <dt className="font-bold text-ink-soft">일반·전문</dt>
          <dd className="text-ink">{item.drugClass === "otc" ? "일반의약품" : item.drugClass === "rx" ? "전문의약품" : "확인 안 됨"}</dd>
          <dt className="font-bold text-ink-soft">식약처 약효 분류</dt>
          <dd className="text-ink">{item.mfdsClass || "확인 안 됨"}</dd>
          <dt className="font-bold text-ink-soft">제품 식별</dt>
          <dd className="text-ink">
            {item.externalItemSeq
              ? `품목기준코드 ${item.externalItemSeq}`
              : "식약처 제품으로 확인하지 않은 약이에요 (직접 입력). 다른 기록과 같은 제품으로 합치지 않아요."}
            {item.ediCode && ` · 보험코드 ${item.ediCode}`}
          </dd>
        </dl>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-bold text-ink">약 종류</p>
          {editCats && store ? (
            <CategoryEditor item={item} store={store} onDone={() => setEditCats(false)} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {item.categories.map((c) => (
                <StatusPill key={c} tone={c === "unclassified" ? "warn" : "outline"}>
                  {c === "unclassified" ? "미분류 · 확인 필요" : categoryLabel(c)}
                </StatusPill>
              ))}
              <span className="text-xs text-ink-soft">{CATEGORY_SOURCE_LABEL[item.categorySource]}</span>
              {store && (
                <PButton size="sm" variant="ghost" onClick={() => setEditCats(true)}>
                  종류 고치기
                </PButton>
              )}
            </div>
          )}
        </div>
        {store && <ScheduleEditor item={item} store={store} />}
        <Alert className="mt-3">{action.error}</Alert>
      </PCard>

      {item.externalItemSeq && <EasyInfoCard itemSeq={item.externalItemSeq} />}

      <section aria-label="같은 제품 기록" className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">이 제품을 등록한 날 ({same.length}번)</h3>
        <ul className="space-y-2">
          {same.map(({ item: it, prescription }) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onOpenRecord(prescription.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-left hover:border-brand-300"
              >
                <KindPill p={prescription} />
                <span className="font-semibold text-ink">{prescriptionLabel(prescription, itemsOf(snapshot, prescription.id).length)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="날짜별 복용 경험" className="space-y-2">
        <h3 className="px-1 text-lg font-bold text-ink">날짜별 복용 경험</h3>
        <p className="px-1 text-xs text-ink-soft">{SOURCE_TEXT.user}이에요. 같은 제품을 여러 번 먹었다면 날짜마다 따로 쌓여요.</p>
        {timeline.length === 0 ? (
          <PCard tone="ivory">
            <p className="text-sm text-ink-soft">아직 남긴 경험이 없어요.</p>
          </PCard>
        ) : (
          <ol className="space-y-2" aria-label="복용 경험 타임라인">
            {timeline.map(({ note: n, wholeRecord, prescription }) => (
              <li key={n.id} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-sm font-bold text-brand-800">{dotDate(n.takenOn ?? n.createdAt)}</p>
                {wholeRecord && (
                  <p className="mt-0.5 text-xs font-semibold text-blush-700">
                    {prescription.kind === "otc" ? "이 등록 전체" : "함께 먹은 약 전체"}에 남긴 기록 — 이 약 때문인지는 확인되지 않아요
                  </p>
                )}
                <div className="mt-1.5">
                  <TagPills tags={n.tags} small />
                </div>
                {n.memo && <p className="mt-1.5 break-words text-ink">{n.memo}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {store && (
        <section aria-label="이 약 복용 경험 남기기" className="space-y-2">
          <h3 className="px-1 text-lg font-bold text-ink">이 약을 먹고 느낀 점 남기기</h3>
          <NoteEditor p={record} items={itemsOf(snapshot, record.id)} store={store} presetItemId={item.id} />
        </section>
      )}
    </div>
  );
}

function CategoryEditor({ item, store, onDone }: { item: RxItem; store: RxStore; onDone: () => void }) {
  const [cats, setCats] = useState(item.categories.filter((c) => c !== "unclassified"));
  const action = useAsyncAction();
  return (
    <div className="space-y-2 rounded-2xl bg-ivory p-3">
      <p className="text-xs text-ink-soft">여러 개를 고를 수 있어요. 자동 분류가 틀렸다면 바로잡아 주세요.</p>
      <ChipGroup
        ariaLabel="약 종류 고르기"
        value={cats}
        onChange={(c) => setCats((cur) => toggle(cur, c))}
        options={CATEGORIES.filter((c) => c.id !== "unclassified").map((c) => ({ value: c.id, label: c.label }))}
      />
      <Alert>{action.error}</Alert>
      <div className="flex gap-2">
        <PButton
          size="sm"
          disabled={action.pending}
          onClick={async () => {
            const r = await action.run(() =>
              store.updateItem(item.id, cats.length ? { categories: cats, categorySource: "user" } : { categories: ["unclassified"], categorySource: "none" }),
            );
            if (r.ok) onDone();
          }}
        >
          종류 저장
        </PButton>
        <PButton size="sm" variant="ghost" onClick={onDone}>
          취소
        </PButton>
      </div>
    </div>
  );
}

function ScheduleEditor({ item, store }: { item: RxItem; store: RxStore }) {
  const action = useAsyncAction();
  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-ink">반복 복용 일정 (복용 체크)</p>
      <p className="mb-1.5 text-xs text-ink-soft">정해진 시간에 먹는 약만 골라 주세요. 비워 두면 ‘필요할 때 먹는 약’으로, 먹은 때만 기록해요.</p>
      <ChipGroup<IntakeSlot>
        ariaLabel="반복 복용 시간"
        value={item.scheduleSlots}
        onChange={(s) =>
          void action.run(() =>
            store.updateItem(item.id, { scheduleSlots: SLOTS.filter((x) => (x === s ? !item.scheduleSlots.includes(s) : item.scheduleSlots.includes(x))) }),
          )
        }
        options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))}
      />
      <Alert className="mt-2">{action.error}</Alert>
    </div>
  );
}

/** 식약처 e약은요 — 이 제품(품목기준코드)과 정확히 연결된 공식 정보만 */
function EasyInfoCard({ itemSeq }: { itemSeq: string }) {
  const fetchInfo = useDrugEasyInfo();
  const [state, setState] = useState<{ info?: EasyInfo; demo?: boolean; message?: string; loading?: boolean } | null>(null);
  return (
    <PCard aria-label="식약처 쉬운 설명">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-ink">식약처 쉬운 설명 (e약은요)</p>
        {!state?.info && (
          <PButton
            size="sm"
            variant="soft"
            icon={BookOpen}
            disabled={state?.loading}
            onClick={async () => {
              setState({ loading: true });
              const r = await fetchInfo(itemSeq);
              setState(r.ok ? { info: r.info, demo: r.demo } : { message: r.message });
            }}
          >
            {state?.loading ? "가져오는 중…" : "공식 정보 보기"}
          </PButton>
        )}
      </div>
      {state?.message && <p className="mt-2 text-sm text-ink-soft">{state.message}</p>}
      {state?.info && (
        <div className="mt-3 space-y-2">
          {state.demo && <StatusPill tone="warn">데모용 예시 · 실제 식약처 응답 아님</StatusPill>}
          <SourceNote source="mfds" title="어떤 증상에 쓰는 약인가요?" text={state.info.efficacy} />
          <SourceNote source="mfds" title="어떻게 먹나요? (공식 복용 방법)" text={state.info.usage} />
          <SourceNote source="mfds" title="먹기 전에 꼭 알아야 할 내용" text={state.info.beforeUse} />
          <SourceNote source="mfds" title="복용 시 주의사항" text={state.info.caution} />
          <p className="text-xs text-ink-soft">품목기준코드 {itemSeq} 제품의 공식 정보예요. 복용 여부는 의사·약사와 상의하세요.</p>
        </div>
      )}
    </PCard>
  );
}
