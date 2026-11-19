"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, LeafIllustration, PButton, PCard, TextField, Wordmark } from "@/components/patient-ui/kit";
import { LOGIN_MESSAGES } from "@/lib/patient-auth/login-id";
import { PATIENT_AUTH_MESSAGES } from "@/lib/patient-auth/rules";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** /login — 환자: 병원(관리자)에서 받은 아이디 + 비밀번호 */
export function PatientLoginApp() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이미 로그인되어 있으면 서버가 확인한 역할의 화면으로
  useEffect(() => {
    void getBrowserClient()?.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return; // 연타 방지
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/patient-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const r = (await res.json()) as { ok: boolean; message?: string };
      if (!r.ok) return setError(r.message ?? LOGIN_MESSAGES.loginFailed);
      setPassword("");
      router.replace("/my");
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ivory text-ink">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-center lg:gap-12 lg:px-10 lg:py-10">
        {/* PC: 왼쪽 소개 */}
        <section className="relative hidden h-full max-h-[44rem] overflow-hidden rounded-[2.5rem] bg-sage-100 p-12 lg:flex lg:flex-col" aria-hidden>
          <Wordmark sub="케어로그" />
          <p className="mt-auto text-[2.6rem] leading-[1.25] font-extrabold tracking-tight text-sage-900">
            오늘의 나를,
            <br />
            천천히 기록해요.
          </p>
          <p className="mt-4 text-lg text-sage-800">작은 변화도 놓치지 않도록 함께할게요.</p>
          <ul className="mt-10 space-y-3 text-sage-900">
            {["하루 한 번, 컨디션과 몸의 신호를 기록해요", "7일·30일 흐름을 그래프로 살펴봐요", "같은 날 다시 저장하면 그날 기록이 수정돼요"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/70">
                  <Check className="h-4 w-4 text-sage-700" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <LeafIllustration className="absolute top-10 right-10 h-56 w-44 opacity-90" />
        </section>

        <main className="px-5 pt-8 pb-10 sm:mx-auto sm:w-full sm:max-w-md lg:max-w-none lg:px-0 lg:py-0">
          <PCard className="!p-0 lg:!p-10 lg:shadow-[0_8px_30px_rgba(38,63,51,0.06)] max-lg:!border-0 max-lg:!bg-transparent">
            <div className="relative">
              <Wordmark sub="케어로그" className="lg:hidden" />
              <h1 className="mt-10 text-[1.85rem] leading-snug font-extrabold tracking-tight text-ink lg:mt-0">
                <span className="lg:hidden">
                  오늘의 나를,
                  <br />
                  천천히 기록해요.
                </span>
                <span className="hidden lg:inline">환자 로그인</span>
              </h1>
              <p className="mt-3 text-ink-soft">병원에서 받은 아이디와 비밀번호로 로그인해요.</p>
              <LeafIllustration className="absolute top-12 -right-1 h-28 w-24 lg:hidden" />
            </div>

            {!configured ? (
              <div className="mt-8 space-y-3">
                <Alert>{PATIENT_AUTH_MESSAGES.notConfigured}</Alert>
                <p className="text-sm text-ink-soft">가상 데이터 데모는 계속 이용할 수 있습니다.</p>
              </div>
            ) : (
              <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-6" noValidate>
                <TextField
                  label="아이디"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={40}
                  placeholder="예: haneul01"
                  helper="병원(관리자)에서 안내받은 아이디를 입력해 주세요."
                  required
                />
                <TextField
                  label="비밀번호"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  maxLength={72}
                  helper="비밀번호를 잊으셨다면 병원(관리자)에 재설정을 요청해 주세요."
                  required
                />
                <Alert>{error}</Alert>
                <PButton type="submit" className="w-full" disabled={pending || !loginId || !password} arrow={!pending}>
                  {pending ? "확인 중…" : "로그인"}
                </PButton>
              </form>
            )}

            <div className="mt-8 space-y-2 text-center text-sm text-ink-soft">
              <p>DB 연동 시험 화면 · 가상 계정만 사용하세요. 실명·실제 정보는 입력하지 마세요.</p>
              <p>
                보호자·간호사·관리자이신가요?{" "}
                <Link href="/login/member" className="font-semibold text-sage-700 underline underline-offset-4">
                  보호자·의료진 로그인
                </Link>
              </p>
              <p>
                로그인 없이 둘러보기:{" "}
                <Link href="/demo" className="font-semibold text-sage-700 underline underline-offset-4">
                  가상 데이터 데모
                </Link>
              </p>
            </div>
          </PCard>
        </main>
      </div>
    </div>
  );
}
