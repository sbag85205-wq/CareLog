"use client";

import { Clock, LogOut, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloudMascot } from "@/components/patient-ui/illustrations";
import { Alert, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import { formatDateTime } from "@/lib/date";
import { getBrowserClient } from "@/lib/supabase/browser";
import { currentTrial, endTrial } from "@/lib/trial-session";

/** 지금 세션이 로그인 없는 체험인지 · 언제 만료되는지 (일반 환자 계정이면 active=false) */
export function useTrialSession(ready: boolean) {
  const [state, setState] = useState<{ active: boolean; expired: boolean; expiresAt: string | null }>({ active: false, expired: false, expiresAt: null });
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    let cancelled = false;
    void currentTrial(client).then(({ anonymous, status }) => {
      if (cancelled || !anonymous || !status?.is_trial) return;
      setState({ active: true, expired: Boolean(status.expired), expiresAt: status.expires_at ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return state;
}

/** 화면 맨 위: 체험 중 · 자동 삭제 시각 · 체험 끝내기 */
export function TrialBar({ expiresAt, onEnd }: { expiresAt: string; onEnd: () => void }) {
  return (
    <div className="border-b border-mint-200/70 bg-mint-50" role="region" aria-label="체험 안내">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-10">
        <p className="flex items-center gap-1.5 text-sm font-semibold break-keep text-mint-700">
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          로그인 없는 체험 중 · 기록은 {formatDateTime(expiresAt)}에 자동으로 지워져요
        </p>
        <PButton size="sm" variant="ghost" icon={LogOut} onClick={onEnd}>
          체험 끝내기
        </PButton>
      </div>
    </div>
  );
}

/** 체험 끝내기 확인 — 내 체험 기록을 바로 지움 */
export function TrialEndSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SoftSheet open={open} title="체험 끝내기" onClose={onClose}>
      <PCard className="space-y-4">
        <p className="text-ink">이 체험에서 남긴 기록(컨디션·약·경험·질문)을 지금 바로 모두 지우고 체험을 마쳐요. 되돌릴 수 없어요.</p>
        <Alert>{error}</Alert>
        <div className="grid gap-2 sm:grid-cols-2">
          <PButton variant="secondary" onClick={onClose} disabled={busy}>
            계속 체험하기
          </PButton>
          <PButton
            icon={LogOut}
            disabled={busy}
            onClick={async () => {
              const client = getBrowserClient();
              if (!client) return;
              setBusy(true);
              try {
                await endTrial(client);
                router.replace("/start");
              } catch {
                setError("체험을 끝내지 못했어요. 잠시 후 다시 시도해 주세요.");
                setBusy(false);
              }
            }}
          >
            {busy ? "지우는 중…" : "기록 지우고 끝내기"}
          </PButton>
        </div>
      </PCard>
    </SoftSheet>
  );
}

/** 체험 시간이 끝난 세션 */
export function TrialExpired() {
  const router = useRouter();
  return (
    <PCard tone="ivory" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center" aria-label="체험 종료">
      <CloudMascot variant="default" className="w-[88px]" />
      <h1 className="text-xl font-bold text-ink">체험 시간이 끝났어요</h1>
      <p className="text-ink-soft">체험 기록은 자동으로 지워졌어요. 새로 시작하면 예시 기록과 함께 다시 둘러볼 수 있어요.</p>
      <PButton
        icon={RotateCcw}
        onClick={async () => {
          const client = getBrowserClient();
          if (client) await endTrial(client);
          router.replace("/start");
        }}
      >
        새로 시작하기
      </PButton>
    </PCard>
  );
}
