"use client";

import { Clock, Loader2, Soup, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ChoiceGroup, DemoBadge, ErrorText, SectionTitle } from "@/components/ui/primitives";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { repository } from "@/hooks/useCareLog";
import { toUserMessage } from "@/lib/errors";
import { formatKoreanDate } from "@/lib/date";
import { DIGESTION_LABEL, MEAL_INTAKE_LABEL, MEAL_INTAKE_OPTIONS, MEAL_SLOT_LABEL, MEAL_TYPE_LABEL } from "@/lib/labels";
import type { MealView } from "@/lib/selectors";
import type { Digestion, MealIntake, MealType } from "@/types";

const MEAL_TYPES: MealType[] = ["regular", "porridge", "soft", "liquid"];

/** 입원 모드 — 오늘의 식사 (메뉴 확인, 섭취량·소화 체크, 식사 형태 변경 요청) */
export function MealTracker({
  patientId,
  date,
  meals,
  readOnly = false,
}: {
  patientId: string;
  date: string;
  meals: MealView[];
  readOnly?: boolean;
}) {
  return (
    <Card>
      <SectionTitle icon={UtensilsCrossed} title="오늘의 식사" subtitle={`${formatKoreanDate(date)} · 가상 병원식 메뉴`} action={<DemoBadge />} />
      <div className="grid gap-4 lg:grid-cols-3">
        {meals.map((m) => (
          <MealCard key={m.slot} patientId={patientId} date={date} meal={m} readOnly={readOnly} />
        ))}
      </div>
    </Card>
  );
}

function MealCard({ patientId, date, meal, readOnly }: { patientId: string; date: string; meal: MealView; readOnly: boolean }) {
  const [changing, setChanging] = useState(false);
  const [toType, setToType] = useState<MealType>("porridge");
  /** 저장 대기 중인 선택 수 — 선택은 화면에 즉시 반영되고, 저장은 뒤에서 진행 */
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const changeRequest = useAsyncAction();

  async function save(patch: { intake?: MealIntake; digestion?: Digestion }) {
    setSaveError(null);
    setSaving((n) => n + 1);
    try {
      // 저장소가 낙관적으로 먼저 반영하고, 실패하면 이전 값으로 되돌립니다.
      await repository.upsertMealLog({ patientId, date, slot: meal.slot, ...patch });
    } catch (e) {
      setSaveError(`${toUserMessage(e)} 이전 선택으로 되돌렸습니다.`);
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function requestChange() {
    const res = await changeRequest.run(() =>
      repository.createRequest({
        patientId,
        category: "meal_change",
        detail: `${MEAL_SLOT_LABEL[meal.slot]} 식사를 '${MEAL_TYPE_LABEL[toType]}'(으)로 변경 요청`,
        mealChange: { date, slot: meal.slot, toType },
      }),
    );
    if (res.ok) setChanging(false);
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-lg font-bold text-slate-900">
          {MEAL_SLOT_LABEL[meal.slot]}
          {saving > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400" aria-live="polite">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> 저장 중
            </span>
          )}
        </span>
        <Badge tone={meal.mealType === "regular" ? "slate" : "blue"}>{MEAL_TYPE_LABEL[meal.mealType]}</Badge>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-slate-600">{meal.menu.join(" · ")}</p>
      {meal.pendingChange && (
        <Badge tone="amber" icon={Clock} className="mb-3 self-start">
          형태 변경 요청 중 · 직원 확인 대기
        </Badge>
      )}

      {readOnly ? (
        <p className="text-sm text-slate-700">
          섭취량: <strong>{meal.log?.intake !== undefined ? MEAL_INTAKE_LABEL[meal.log.intake] : "미기록"}</strong>
          {meal.log?.digestion && <> · 소화: {DIGESTION_LABEL[meal.log.digestion]}</>}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-700">섭취량</div>
            <ChoiceGroup
              ariaLabel={`${MEAL_SLOT_LABEL[meal.slot]} 섭취량`}
              size="sm"
              columns="grid-cols-5"
              value={meal.log?.intake}
              onChange={(v) => save({ intake: v })}
              options={MEAL_INTAKE_OPTIONS.map((o) => ({ value: o.value, label: <span className="text-xs">{o.label}</span> }))}
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-700">식사 후 소화</div>
            <ChoiceGroup
              ariaLabel={`${MEAL_SLOT_LABEL[meal.slot]} 소화 상태`}
              size="sm"
              columns="grid-cols-3"
              value={meal.log?.digestion}
              onChange={(v) => save({ digestion: v })}
              options={(Object.keys(DIGESTION_LABEL) as Digestion[]).map((k) => ({
                value: k,
                label: <span className="text-xs">{DIGESTION_LABEL[k]}</span>,
              }))}
            />
          </div>

          <ErrorText>{saveError}</ErrorText>

          {changing ? (
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <div className="mb-2 text-sm font-semibold text-slate-700">원하는 식사 형태</div>
              <ChoiceGroup
                ariaLabel="원하는 식사 형태"
                size="sm"
                columns="grid-cols-3"
                value={toType}
                onChange={setToType}
                options={MEAL_TYPES.filter((t) => t !== meal.mealType).map((t) => ({ value: t, label: <span className="text-xs">{MEAL_TYPE_LABEL[t]}</span> }))}
              />
              <p className="mt-2 text-xs text-slate-500">요청은 즉시 확정되지 않고 담당 직원 확인 후 반영됩니다.</p>
              <ErrorText className="mt-2">{changeRequest.error}</ErrorText>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={changeRequest.pending} onClick={() => void requestChange()}>
                  {changeRequest.pending ? "보내는 중…" : "요청 보내기"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={Soup} disabled={meal.pendingChange} onClick={() => setChanging(true)} className="w-full">
              식사 형태 변경 요청
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
