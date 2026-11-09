"use client";

import { BedDouble, CheckCircle2, Droplets, HandHelping, MessageSquarePlus, Soup } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { RequestStatusSteps } from "@/components/inpatient/RequestStatusSteps";
import { Button, Card, ChoiceGroup, cn, DemoBadge, EmptyState, SectionTitle } from "@/components/ui/primitives";
import { repository } from "@/hooks/useCareLog";
import { formatDateTime, todayISO } from "@/lib/date";
import { MEAL_SLOT_LABEL, MEAL_TYPE_LABEL, REQUEST_CATEGORY_LABEL } from "@/lib/labels";
import type { LifeRequest, MealSlot, MealType, RequestCategory } from "@/types";

export const REQUEST_ICON: Record<RequestCategory, LucideIcon> = {
  water: Droplets,
  bedding: BedDouble,
  meal_change: Soup,
  other: HandHelping,
};

const DEFAULT_DETAIL: Record<RequestCategory, string> = {
  water: "물 한 병 부탁드립니다.",
  bedding: "침구 교체 부탁드립니다.",
  meal_change: "",
  other: "",
};

/** 입원 모드 — 비긴급 생활 요청 등록 및 진행 상태 확인 */
export function LifeRequestPanel({ patientId, requests }: { patientId: string; requests: LifeRequest[] }) {
  const [category, setCategory] = useState<RequestCategory | null>(null);
  const [detail, setDetail] = useState("");
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [toType, setToType] = useState<MealType>("porridge");
  const [justSent, setJustSent] = useState(false);

  function pick(c: RequestCategory) {
    setCategory(c);
    setDetail(DEFAULT_DETAIL[c]);
    setJustSent(false);
  }

  async function submit() {
    if (!category) return;
    const isMeal = category === "meal_change";
    const text = isMeal
      ? `${MEAL_SLOT_LABEL[slot]} 식사를 '${MEAL_TYPE_LABEL[toType]}'(으)로 변경 요청${detail.trim() ? ` · ${detail.trim()}` : ""}`
      : detail.trim();
    if (!text) return;
    await repository.createRequest({
      patientId,
      category,
      detail: text,
      mealChange: isMeal ? { date: todayISO(), slot, toType } : undefined,
    });
    setCategory(null);
    setDetail("");
    setJustSent(true);
  }

  const active = requests.filter((r) => r.status !== "completed");
  const done = requests.filter((r) => r.status === "completed");

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle icon={MessageSquarePlus} title="생활 요청" subtitle="비긴급 요청만 보내 주세요" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(REQUEST_CATEGORY_LABEL) as RequestCategory[]).map((c) => {
            const Icon = REQUEST_ICON[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => pick(c)}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-base font-bold transition",
                  category === c ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300",
                )}
              >
                <Icon className="h-8 w-8 text-sky-500" aria-hidden />
                {REQUEST_CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>

        {category && (
          <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            {category === "meal_change" && (
              <>
                <div>
                  <div className="mb-1 text-sm font-semibold text-slate-700">변경할 끼니 (오늘)</div>
                  <ChoiceGroup
                    ariaLabel="변경할 끼니"
                    size="sm"
                    columns="grid-cols-3"
                    value={slot}
                    onChange={setSlot}
                    options={(Object.keys(MEAL_SLOT_LABEL) as MealSlot[]).map((s) => ({ value: s, label: MEAL_SLOT_LABEL[s] }))}
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm font-semibold text-slate-700">원하는 형태</div>
                  <ChoiceGroup
                    ariaLabel="원하는 식사 형태"
                    size="sm"
                    columns="grid-cols-2 sm:grid-cols-4"
                    value={toType}
                    onChange={setToType}
                    options={(Object.keys(MEAL_TYPE_LABEL) as MealType[]).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))}
                  />
                </div>
              </>
            )}
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder={category === "meal_change" ? "추가로 전달할 내용 (선택)" : "요청 내용을 적어 주세요"}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white p-3 text-base outline-none focus:border-teal-400"
            />
            {category === "meal_change" && (
              <p className="text-xs text-slate-500">식사 변경은 즉시 확정되지 않으며, 담당 직원 확인 후 반영됩니다.</p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void submit()} disabled={category !== "meal_change" && !detail.trim()}>
                요청 보내기
              </Button>
              <Button variant="ghost" onClick={() => setCategory(null)}>
                취소
              </Button>
            </div>
          </div>
        )}
        {justSent && (
          <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700" aria-live="polite">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> 요청이 접수되었습니다 (데모). 의료진 화면에서 처리 과정을 시연할 수 있어요.
          </p>
        )}
      </Card>

      <RequestList title="진행 중인 요청" requests={active} empty="진행 중인 요청이 없습니다." />
      {done.length > 0 && <RequestList title="처리 완료" requests={done} empty="" />}
    </div>
  );
}

export function RequestList({ title, requests, empty }: { title: string; requests: LifeRequest[]; empty: string }) {
  return (
    <Card>
      <SectionTitle icon={HandHelping} title={title} subtitle={`${requests.length}건`} />
      {requests.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const Icon = REQUEST_ICON[r.category];
            return (
              <li key={r.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-800">{REQUEST_CATEGORY_LABEL[r.category]}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
                      {r.isDemo && <DemoBadge />}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{r.detail}</p>
                    <div className="mt-2 overflow-x-auto">
                      <RequestStatusSteps status={r.status} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
