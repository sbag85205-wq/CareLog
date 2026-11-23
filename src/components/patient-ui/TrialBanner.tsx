import { TriangleAlert } from "lucide-react";
import { isTrialSite, TRIAL_NOTICE } from "@/lib/trial";

/** 공개 체험 사이트 전용 안내 띠 (모든 화면 맨 위, 인쇄 제외) — 다른 배포에서는 아무것도 그리지 않음 */
export function TrialBanner() {
  if (!isTrialSite()) return null;
  return (
    <div role="note" aria-label="체험용 사이트 안내" className="border-b border-butter-100 bg-butter-100/80 print:hidden">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-sm font-semibold break-keep text-butter-700 sm:px-6 lg:px-10">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{TRIAL_NOTICE}</span>
      </p>
    </div>
  );
}
