"use client";

import { ArrowRight, LogIn, Play, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottleIcon, ClipboardIcon, CloudMascot, NotebookIcon, type MascotVariant } from "@/components/patient-ui/illustrations";
import { Alert, cn, PButton } from "@/components/patient-ui/kit";
import { BRAND } from "@/lib/brand";
import { getBrowserClient } from "@/lib/supabase/browser";
import { currentTrial, endTrial, startTrial } from "@/lib/trial-session";

const STEPS: { title: string; body: string; mascot: MascotVariant; prop?: "bottle" | "notebook" | "clipboard" }[] = [
  {
    title: "안녕하세요, 저는 구름이예요",
    body: `${BRAND.name}는 그때 먹었던 약과 그 약을 먹고 느낀 내 몸의 반응을 기록해 두는 곳이에요.`,
    mascot: "happy",
  },
  {
    title: "약은 사진이나 이름으로 등록해요",
    body: "처방전·약 상자·약국 영수증을 찍거나, 약 이름으로 찾아요. 찾지 못하면 이름만 적어도 돼요.",
    mascot: "default",
    prop: "bottle",
  },
  {
    title: "먹고 느낀 점을 남겨요",
    body: "좋았던 점과 불편했던 점을 함께 고르고, 오늘 컨디션과 복용 체크도 기록해요.",
    mascot: "notebook",
    prop: "notebook",
  },
  {
    title: "필요할 때 다시 찾고, 진료 때 보여줘요",
    body: "약 종류·경험으로 예전 약을 찾고, 진료실에서는 한 장으로 정리해 보여 줘요.",
    mascot: "cheer",
    prop: "clipboard",
  },
];

/**
 * 공개 체험 첫 화면 (/start) — 구름이 소개 4단계 → '체험 시작하기' 한 번으로 시작
 * 회원가입·아이디·비밀번호 없음: 방문자마다 독립된 익명 체험 세션 + 가상 예시 기록 (24시간 뒤 자동 삭제)
 */
export function TrialStartApp() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<{ expiresAt: string } | null>(null);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  // 같은 브라우저로 다시 왔을 때: 진행 중인 체험이 있으면 '이어서 체험하기'
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    void currentTrial(client).then(({ anonymous, status }) => {
      if (anonymous && status?.is_trial && !status.expired && status.expires_at) setResume({ expiresAt: status.expires_at });
    });
  }, []);

  async function begin(fresh = false) {
    const client = getBrowserClient();
    if (!client) return setError("지금은 체험을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.");
    setBusy(true);
    setError(null);
    if (fresh) await endTrial(client);
    const r = await startTrial(client);
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    router.replace("/my");
  }

  return (
    <main className="bg-hero flex min-h-dvh flex-col items-center px-4 pt-6 pb-8 sm:justify-center sm:py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight text-ink">{BRAND.name}</span>
          {!last && (
            <button
              type="button"
              onClick={() => setStep(STEPS.length - 1)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-white/60"
            >
              건너뛰기
            </button>
          )}
        </div>

        <section
          className="glass mt-4 rounded-[1.75rem] px-5 pt-6 pb-6 shadow-soft"
          aria-roledescription="소개"
          aria-label={`소개 ${step + 1} / ${STEPS.length}`}
        >
          <div className="flex h-44 items-end justify-center gap-1" aria-hidden>
            <CloudMascot key={step} variant={s.mascot} animate className="relative z-10 w-[112px]" />
            {s.prop === "bottle" && <BottleIcon className="-ml-6 h-28 w-28" />}
            {s.prop === "notebook" && <NotebookIcon className="-ml-6 w-28" />}
            {s.prop === "clipboard" && <ClipboardIcon className="-ml-6 h-28 w-28" />}
          </div>
          <h1 className="mt-5 text-[1.55rem] leading-tight font-extrabold break-keep text-ink">{s.title}</h1>
          <p className="mt-2 text-[1.05rem] leading-relaxed break-keep text-ink-soft">{s.body}</p>

          <ol className="mt-5 flex justify-center gap-2" aria-label="진행">
            {STEPS.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-label={`${i + 1}단계로`}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => setStep(i)}
                  className={cn("block h-2.5 rounded-full transition-all", i === step ? "w-7 bg-brand-700" : "w-2.5 bg-brand-200")}
                />
              </li>
            ))}
          </ol>
        </section>

        {last && (
          <ul className="mt-4 space-y-1.5 rounded-[1.25rem] border border-white bg-white/80 px-4 py-3 text-sm break-keep text-ink-soft" aria-label="체험 안내">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              회원가입·아이디·비밀번호 없이 시작해요. 방문자마다 따로 기록돼요.
            </li>
            <li>· 예시 기록이 들어 있어 바로 둘러볼 수 있어요.</li>
            <li>· 체험 기록은 24시간 뒤 자동으로 지워져요.</li>
            <li className="font-semibold text-butter-700">· 실제 이름·연락처·건강정보는 입력하지 마세요.</li>
          </ul>
        )}

        <Alert className="mt-4">{error}</Alert>

        <div className="mt-5 space-y-2.5">
          {last ? (
            resume ? (
              <>
                <PButton className="w-full" icon={Play} disabled={busy} onClick={() => router.replace("/my")}>
                  이어서 체험하기
                </PButton>
                <PButton className="w-full" variant="secondary" icon={RotateCcw} disabled={busy} onClick={() => void begin(true)}>
                  {busy ? "새 체험을 준비하고 있어요…" : "처음부터 새로 시작하기"}
                </PButton>
              </>
            ) : (
              <PButton className="w-full" icon={Play} disabled={busy} onClick={() => void begin()}>
                {busy ? "체험을 준비하고 있어요…" : "체험 시작하기"}
              </PButton>
            )
          ) : (
            <PButton className="w-full" onClick={() => setStep((x) => x + 1)}>
              다음 <ArrowRight className="h-5 w-5" aria-hidden />
            </PButton>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft">
          병원에서 받은 아이디가 있나요?{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 underline-offset-4 hover:underline">
            <LogIn className="h-4 w-4" aria-hidden /> 로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
