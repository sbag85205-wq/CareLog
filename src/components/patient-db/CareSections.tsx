"use client";

/**
 * 입원 식사·생활 요청 (환자 화면에서 기록, 의료진·보호자 화면에서 읽기 전용으로 재사용)
 * 저장은 DB 저장소(RLS·RPC)로만 — 식사 형태는 환자가 직접 못 바꾸고 "식사 변경 요청"이 처리 완료될 때 반영
 */
import { BedDouble, Droplets, MessageSquarePlus, Soup } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  ChipGroup,
  PButton,
  PCard,
  SoftSheet,
  StatusPill,
  StatusSteps,
  TextArea,
} from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime, formatKoreanTime, todayISO, toSeoulDate } from "@/lib/date";
import {
  DIGESTION_LABEL,
  MEAL_INTAKE_OPTIONS,
  MEAL_SLOT_LABEL,
  MEAL_TYPE_LABEL,
  REQUEST_CATEGORY_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_ORDER,
} from "@/lib/labels";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { mealsOn, requestsOf } from "@/lib/selectors";
import type { Digestion, LifeRequest, MealIntake, MealSlot, MealType, RequestCategory } from "@/types";

const SLOT_TIME: Record<MealSlot, string> = { breakfast: "08:00", lunch: "12:00", dinner: "18:00" };
const STATUS_STEPS = REQUEST_STATUS_ORDER.map((k) => ({ key: k, label: REQUEST_STATUS_LABEL[k] }));
const DIGESTION_OPTIONS = (Object.keys(DIGESTION_LABEL) as Digestion[]).map((k) => ({ value: k, label: DIGESTION_LABEL[k] }));

/** 오늘의 식사 (DB 메뉴가 없으면 가상 식단으로 표시) */
export function todaysMeals(d: DbSnapshot, patientId: string, date: string) {
  return mealsOn(d, patientId, date).map((m) => {
    const dbMenu = d.menus.find((x) => x.date === date && x.slot === m.slot && x.mealType === m.mealType);
    return { ...m, menu: dbMenu?.items ?? m.menu, virtualMenu: !dbMenu };
  });
}

/* ───────────── 오늘의 식사 ───────────── */

export function MealsSection({
  snapshot,
  patientId,
  repo,
  readOnly,
}: {
  snapshot: DbSnapshot;
  patientId: string;
  repo?: SupabaseRepository;
  readOnly?: boolean;
}) {
  const today = todayISO();
  const meals = todaysMeals(snapshot, patientId, today);
  const [changeSlot, setChangeSlot] = useState<MealSlot | null>(null);

  return (
    <section aria-labelledby="meals-title" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="meals-title" className="text-xl font-bold text-ink">
          오늘의 식사
        </h2>
        <span className="text-xs text-ink-soft">{meals.some((m) => m.virtualMenu) ? "가상 식단" : "병원 식단"}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {meals.map((m) => (
          <MealCard
            key={m.slot}
            patientId={patientId}
            date={today}
            slot={m.slot}
            mealType={m.mealType}
            menu={m.menu}
            intake={m.log?.intake}
            digestion={m.log?.digestion}
            pendingChange={m.pendingChange}
            repo={readOnly ? undefined : repo}
            onRequestChange={readOnly ? undefined : () => setChangeSlot(m.slot)}
          />
        ))}
      </div>
      {repo && !readOnly && (
        <MealChangeSheet
          open={changeSlot !== null}
          slot={changeSlot}
          current={meals.find((m) => m.slot === changeSlot)?.mealType ?? "regular"}
          patientId={patientId}
          date={today}
          repo={repo}
          onClose={() => setChangeSlot(null)}
        />
      )}
    </section>
  );
}

function MealCard({
  patientId,
  date,
  slot,
  mealType,
  menu,
  intake,
  digestion,
  pendingChange,
  repo,
  onRequestChange,
}: {
  patientId: string;
  date: string;
  slot: MealSlot;
  mealType: MealType;
  menu: string[];
  intake?: MealIntake;
  digestion?: Digestion;
  pendingChange: boolean;
  repo?: SupabaseRepository;
  onRequestChange?: () => void;
}) {
  const action = useAsyncAction();
  // 누르는 즉시 선택 표시, 저장 실패 시 원래 값으로 (DB 값이 다시 내려오면 그 값 사용)
  const [local, setLocal] = useState<{ intake?: MealIntake; digestion?: Digestion }>({});
  const shownIntake = local.intake ?? intake;
  const shownDigestion = local.digestion ?? digestion;
  const label = MEAL_SLOT_LABEL[slot];

  async function save(patch: { intake?: MealIntake; digestion?: Digestion }) {
    if (!repo) return;
    setLocal((l) => ({ ...l, ...patch }));
    const r = await action.run(() => repo.upsertMealLog({ patientId, date, slot, ...patch }));
    setLocal((l) => {
      const next = { ...l };
      if (patch.intake !== undefined) delete next.intake;
      if (patch.digestion !== undefined) delete next.digestion;
      return next;
    });
    return r;
  }

  return (
    <PCard aria-label={`${label} 식사`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-sage-800">
          {label} · {SLOT_TIME[slot]}
        </p>
        <span className="flex flex-wrap justify-end gap-1">
          {mealType !== "regular" && <StatusPill tone="outline">{MEAL_TYPE_LABEL[mealType]}</StatusPill>}
          {pendingChange && <StatusPill tone="warn">변경 요청 중</StatusPill>}
        </span>
      </div>
      <p className="mt-2 leading-relaxed text-ink">{menu.join(" · ")}</p>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">섭취량</p>
          {repo ? (
            <ChipGroup
              ariaLabel={`${label} 섭취량`}
              value={shownIntake}
              onChange={(v) => void save({ intake: v })}
              options={MEAL_INTAKE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          ) : (
            <p className="text-sm text-ink-soft">{shownIntake === undefined ? "기록 전" : MEAL_INTAKE_OPTIONS.find((o) => o.value === shownIntake)?.label}</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">소화 상태</p>
          {repo ? (
            <ChipGroup ariaLabel={`${label} 소화`} value={shownDigestion} onChange={(v) => void save({ digestion: v })} options={DIGESTION_OPTIONS} />
          ) : (
            <p className="text-sm text-ink-soft">{shownDigestion ? DIGESTION_LABEL[shownDigestion] : "기록 전"}</p>
          )}
        </div>
      </div>
      <Alert className="mt-3">{action.error}</Alert>
      {onRequestChange && (
        <PButton variant="ghost" size="sm" className="mt-3 -ml-2" icon={Soup} onClick={onRequestChange} disabled={pendingChange}>
          {pendingChange ? "식사 형태 변경 요청 처리 중" : "식사 형태 변경 요청"}
        </PButton>
      )}
    </PCard>
  );
}

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABEL) as MealType[];

function MealChangeSheet({
  open,
  slot,
  current,
  patientId,
  date,
  repo,
  onClose,
}: {
  open: boolean;
  slot: MealSlot | null;
  current: MealType;
  patientId: string;
  date: string;
  repo: SupabaseRepository;
  onClose: () => void;
}) {
  const [to, setTo] = useState<MealType | undefined>(undefined);
  const action = useAsyncAction();
  if (!slot) return null;
  const options = MEAL_TYPES.filter((t) => t !== current).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }));
  return (
    <SoftSheet open={open} title={`${MEAL_SLOT_LABEL[slot]} 식사 형태 변경 요청`} onClose={onClose}>
      <PCard>
        <p className="text-sm text-ink-soft">지금: {MEAL_TYPE_LABEL[current]} · 의료진이 처리를 완료하면 식사 형태가 바뀌어요.</p>
        <p className="mt-4 mb-2 font-bold text-ink">바꾸고 싶은 형태</p>
        <ChipGroup ariaLabel="바꿀 식사 형태" value={to} onChange={setTo} options={options} />
        <Alert className="mt-4">{action.error}</Alert>
        <PButton
          className="mt-5 w-full"
          disabled={!to || action.pending}
          onClick={async () => {
            if (!to) return;
            const r = await action.run(() =>
              repo.createRequest({
                patientId,
                category: "meal_change",
                detail: `${MEAL_SLOT_LABEL[slot]} 식사를 ${MEAL_TYPE_LABEL[to]}(으)로 바꿔 주세요.`,
                mealChange: { date, slot, toType: to },
              }),
            );
            if (r.ok) {
              setTo(undefined);
              onClose();
            }
          }}
        >
          {action.pending ? "요청 중…" : "변경 요청 보내기"}
        </PButton>
      </PCard>
    </SoftSheet>
  );
}

/* ───────────── 생활 요청 ───────────── */

const QUICK: { category: Exclude<RequestCategory, "meal_change">; label: string; icon: typeof Droplets; detail: string }[] = [
  { category: "water", label: "물", icon: Droplets, detail: "물 한 병 부탁드려요." },
  { category: "bedding", label: "침구", icon: BedDouble, detail: "침구를 바꿔 주세요." },
  { category: "other", label: "기타", icon: MessageSquarePlus, detail: "" },
];

export function RequestsSection({ snapshot, patientId, repo }: { snapshot: DbSnapshot; patientId: string; repo: SupabaseRepository }) {
  const [draft, setDraft] = useState<{ category: Exclude<RequestCategory, "meal_change">; detail: string } | null>(null);
  const action = useAsyncAction();
  const requests = requestsOf(snapshot, patientId).slice(0, 12);

  return (
    <section aria-labelledby="req-title" className="space-y-3">
      <div className="px-1">
        <h2 id="req-title" className="text-xl font-bold text-ink">
          생활 요청
        </h2>
        <p className="mt-1 text-sm text-ink-soft">필요한 것이 있으면 알려 주세요. 응급 상황에는 호출 버튼을 눌러 주세요.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {QUICK.map((q) => (
          <PButton key={q.category} variant="soft" size="md" icon={q.icon} onClick={() => setDraft({ category: q.category, detail: q.detail })}>
            {q.label}
          </PButton>
        ))}
      </div>

      {requests.length === 0 ? (
        <PCard tone="ivory">
          <p className="text-sm text-ink-soft">아직 남긴 요청이 없어요.</p>
        </PCard>
      ) : (
        <ul className="space-y-3" aria-label="내 생활 요청">
          {requests.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} />
            </li>
          ))}
        </ul>
      )}

      <SoftSheet open={draft !== null} title={draft ? REQUEST_CATEGORY_LABEL[draft.category] : ""} onClose={() => setDraft(null)}>
        {draft && (
          <PCard>
            <TextArea
              label="요청 내용"
              value={draft.detail}
              maxLength={300}
              counter
              rows={3}
              placeholder="필요한 내용을 적어 주세요 (가상 데이터만 입력)"
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
            <Alert className="mt-4">{action.error}</Alert>
            <PButton
              className="mt-5 w-full"
              disabled={!draft.detail.trim() || action.pending}
              onClick={async () => {
                const r = await action.run(() => repo.createRequest({ patientId, category: draft.category, detail: draft.detail }));
                if (r.ok) setDraft(null);
              }}
            >
              {action.pending ? "보내는 중…" : "요청 보내기"}
            </PButton>
          </PCard>
        )}
      </SoftSheet>
    </section>
  );
}

/** 요청 1건 (상태 단계 표시) — 의료진은 action 영역에 처리 버튼을 넣음 */
export function RequestCard({ request: r, patientName, action }: { request: LifeRequest; patientName?: string; action?: React.ReactNode }) {
  return (
    <PCard className="!p-4 sm:!p-5" aria-label={`${REQUEST_CATEGORY_LABEL[r.category]} ${REQUEST_STATUS_LABEL[r.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-sage-800">
            {patientName && <span className="text-ink">{patientName} · </span>}
            {REQUEST_CATEGORY_LABEL[r.category]}
          </p>
          <p className="mt-1 break-words text-ink">{r.detail}</p>
          {r.mealChange && (
            <p className="mt-1 text-xs text-ink-soft">
              {r.mealChange.date.slice(5).replace("-", "/")} {MEAL_SLOT_LABEL[r.mealChange.slot]} → {MEAL_TYPE_LABEL[r.mealChange.toType]}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-ink-soft">{toSeoulDate(r.createdAt) === todayISO() ? `오늘 ${formatKoreanTime(r.createdAt)}` : formatDateTime(r.createdAt)}</span>
      </div>
      <div className="mt-3">
        <StatusSteps steps={STATUS_STEPS} current={r.status} />
      </div>
      {action && <div className="mt-3">{action}</div>}
    </PCard>
  );
}
