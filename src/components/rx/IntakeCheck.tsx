"use client";

import { Check } from "lucide-react";
import { CloudMascot } from "@/components/patient-ui/illustrations";
import { Alert, cn, PButton, PCard, StatusPill } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatKoreanTime } from "@/lib/date";
import { activeItems, SLOT_LABEL, type RxSnapshot } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";

/**
 * 오늘 복용 체크 — 사용자의 자기 기록 (홈의 강조 카드: 민트)
 * 정기 약: 정해 둔 시간대마다 '복용했어요' / 필요할 때 먹는 약: 먹었을 때만 기록
 * 체크하지 않은 칸은 '기록 없음' (안 먹었다고 단정하지 않음)
 */
export function IntakeCheck({ rx, store, patientId, today }: { rx: RxSnapshot; store: RxStore | null; patientId: string; today: string }) {
  const action = useAsyncAction();
  const active = activeItems(rx);
  if (active.length === 0) return null;
  const todays = rx.intakes.filter((x) => x.takenOn === today);
  // 정해 둔 시간대만 셈 (필요할 때 먹는 약은 횟수만 표시)
  const slots = active.flatMap(({ item }) => item.scheduleSlots.map((slot) => ({ itemId: item.id, slot })));
  const done = slots.filter((s) => todays.some((x) => x.itemId === s.itemId && x.slot === s.slot)).length;
  const pct = slots.length ? Math.round((done / slots.length) * 100) : 0;
  const allDone = slots.length > 0 && done === slots.length;
  return (
    <PCard tone="mint" aria-label="오늘 복용 체크" className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">오늘 복용 체크</h2>
          {/*
            사용자가 직접 누른 기록 수만 반영 (캐릭터가 복용 여부를 판단하지 않음)
            일부 기록: 작은 기본 몽글(정적) · 정해 둔 시간대를 모두 기록: 응원 몽글(짧은 등장)
          */}
          {allDone ? (
            <CloudMascot key="cheer" variant="cheer" animate className="-mt-2 w-[60px] shrink-0" />
          ) : done > 0 ? (
            <CloudMascot key="default" className="-mt-1 w-[44px] shrink-0" />
          ) : null}
        </div>
        {slots.length > 0 && (
          <>
            <p className="mt-2 text-ink">
              <span className="text-2xl font-extrabold text-mint-700">{done}</span>
              <span className="text-ink-soft"> / {slots.length} 기록</span>
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"
              role="progressbar"
              aria-label="오늘 시간대 기록"
              aria-valuemin={0}
              aria-valuemax={slots.length}
              aria-valuenow={done}
            >
              <div className="h-full rounded-full bg-sage transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
              <StatusPill tone="mint" className="!bg-white/80 !px-2.5 !py-0.5 !text-xs">
                <Check className="h-3 w-3" strokeWidth={2.6} /> 복용 {done}
              </StatusPill>
              <StatusPill tone="dashed" className="!px-2.5 !py-0.5 !text-xs">
                기록 없음 {slots.length - done}
              </StatusPill>
            </div>
          </>
        )}
        {allDone && (
          <p className="mt-2 text-sm font-semibold text-mint-700" aria-live="polite">
            오늘 정해 둔 시간대를 모두 기록했어요.
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">먹은 것만 눌러 주세요. 체크하지 않은 칸은 ‘기록 없음’이에요 (안 먹었다는 뜻이 아니에요).</p>
      </div>
      <ul className="space-y-2">
        {active.map(({ item }) => {
          const mine = todays.filter((x) => x.itemId === item.id);
          return (
            <li key={item.id} className="rounded-[0.875rem] border border-white bg-white/75 p-3" aria-label={`복용 체크: ${item.name}`}>
              <p className="font-bold text-ink">{item.name}</p>
              {item.scheduleSlots.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${item.name} 시간대`}>
                  {item.scheduleSlots.map((slot) => {
                    const log = mine.find((x) => x.slot === slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={Boolean(log)}
                        disabled={!store || action.pending}
                        onClick={() =>
                          void action.run(() => (log ? store!.removeIntake(log.id) : store!.logIntake({ patientId, itemId: item.id, takenOn: today, slot })))
                        }
                        className={cn(
                          "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[0.95rem] transition",
                          log ? "border-mint-200 bg-mint-100 font-bold text-mint-700" : "border-line bg-white text-ink-soft hover:border-mint-200",
                        )}
                      >
                        {log && <Check className="h-4 w-4" aria-hidden />}
                        {SLOT_LABEL[slot]} · {log ? "복용했어요" : "기록 없음"}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PButton
                    size="sm"
                    variant="secondary"
                    disabled={!store || action.pending}
                    onClick={() => void action.run(() => store!.logIntake({ patientId, itemId: item.id, takenOn: today, slot: "prn" }))}
                  >
                    지금 먹었어요
                  </PButton>
                  <span className="text-sm text-ink-soft">
                    필요할 때 먹는 약 ·{" "}
                    {mine.length ? `오늘 ${mine.length}번 기록 (${mine.map((m) => formatKoreanTime(m.createdAt)).join(", ")})` : "오늘 기록 없음"}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Alert>{action.error}</Alert>
    </PCard>
  );
}
