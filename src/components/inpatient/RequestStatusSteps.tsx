import { Check } from "lucide-react";
import { cn } from "@/components/ui/primitives";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_ORDER } from "@/lib/labels";
import type { RequestStatus } from "@/types";

/** 접수 → 직원 확인 → 처리 완료 진행 표시 */
export function RequestStatusSteps({ status }: { status: RequestStatus }) {
  const current = REQUEST_STATUS_ORDER.indexOf(status);
  return (
    <ol className="flex items-center gap-1" aria-label={`진행 상태: ${REQUEST_STATUS_LABEL[status]}`}>
      {REQUEST_STATUS_ORDER.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="flex items-center gap-1">
            {i > 0 && <span className={cn("h-0.5 w-4 sm:w-6", done ? "bg-teal-400" : "bg-slate-200")} />}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                i === current
                  ? "bg-teal-500 text-white"
                  : done
                    ? "bg-teal-50 text-teal-700"
                    : "bg-slate-100 text-slate-400",
              )}
            >
              {done && i < current && <Check className="h-3 w-3" aria-hidden />}
              {REQUEST_STATUS_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
