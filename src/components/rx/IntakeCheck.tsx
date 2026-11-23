"use client";

import { Check } from "lucide-react";
import { Alert, cn, PButton, PCard } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatKoreanTime } from "@/lib/date";
import { activeItems, SLOT_LABEL, type RxSnapshot } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";

/**
 * 오늘 복용 체크 — 사용자의 자기 기록
 * 정기 약: 정해 둔 시간대마다 '복용했어요' / 필요할 때 먹는 약: 먹었을 때만 기록
 * 체크하지 않은 칸은 '기록 없음' (안 먹었다고 단정하지 않음)
 */
export function IntakeCheck({ rx, store, patientId, today }: { rx: RxSnapshot; store: RxStore | null; patientId: string; today: string }) {
  const action = useAsyncAction();
  const active = activeItems(rx);
  if (active.length === 0) return null;
  const todays = rx.intakes.filter((x) => x.takenOn === today);
  return (
    <PCard aria-label="오늘 복용 체크" className="space-y-3">
      <div>
        <h2 className="text-xl font-bold text-ink">오늘 복용 체크</h2>
        <p className="text-sm text-ink-soft">먹은 것만 눌러 주세요. 체크하지 않은 칸은 ‘기록 없음’이에요 (안 먹었다는 뜻이 아니에요).</p>
      </div>
      <ul className="space-y-2">
        {active.map(({ item }) => {
          const mine = todays.filter((x) => x.itemId === item.id);
          return (
            <li key={item.id} className="rounded-2xl bg-ivory p-3" aria-label={`복용 체크: ${item.name}`}>
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
                          "inline-flex min-h-12 items-center gap-1.5 rounded-2xl border px-4 text-[0.95rem] transition",
                          log ? "border-sage-300 bg-sage-100 font-bold text-sage-800" : "border-line bg-white text-ink-soft",
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
                    variant="soft"
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
