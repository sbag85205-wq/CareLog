"use client";

import { HeartPulse, KeyRound, LogIn, ShieldAlert, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, cn, ErrorText } from "@/components/ui/primitives";
import { PASSWORD_MIN, PATIENT_AUTH_MESSAGES } from "@/lib/patient-auth/rules";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Tab = "first" | "login";
type Step = "verify" | "password";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; message?: string; signedIn?: boolean }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    return (await res.json()) as { ok: boolean; message?: string; signedIn?: boolean };
  } catch {
    return { ok: false, message: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg outline-none focus:border-teal-400";

export function PatientLoginApp() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [tab, setTab] = useState<Tab>("login");
  const [step, setStep] = useState<Step>("verify");
  const [loginCode, setLoginCode] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 이미 로그인되어 있으면 내 기록으로
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/my");
    });
  }, [router]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setStep("verify");
    setError(null);
    setNotice(null);
    setPassword("");
    setPasswordConfirm("");
    setBirthDate("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return; // 연타 방지
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === "login") {
        const r = await postJson("/api/patient-auth/login", { loginCode, password });
        if (!r.ok) return setError(r.message ?? PATIENT_AUTH_MESSAGES.loginFailed);
        setPassword("");
        router.replace("/my");
      } else if (step === "verify") {
        const r = await postJson("/api/patient-auth/verify", { loginCode, birthDate });
        setBirthDate(""); // 생년월일은 화면 상태에도 남기지 않음
        if (!r.ok) return setError(r.message ?? PATIENT_AUTH_MESSAGES.verifyFailed);
        setStep("password");
        setNotice("확인되었습니다. 10분 안에 새 비밀번호를 설정해 주세요.");
      } else {
        const r = await postJson("/api/patient-auth/set-password", { password, passwordConfirm });
        if (!r.ok) {
          if (r.message === PATIENT_AUTH_MESSAGES.setupExpired) setStep("verify");
          return setError(r.message ?? PATIENT_AUTH_MESSAGES.setupSaveFailed);
        }
        setPassword("");
        setPasswordConfirm("");
        if (r.signedIn) {
          router.replace("/my");
        } else {
          setTab("login");
          setStep("verify");
          setNotice("비밀번호를 설정했습니다. 환자 코드와 새 비밀번호로 로그인해 주세요.");
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50/60 via-white to-white">
      <header className="border-b border-slate-100 bg-white/90">
        <div className="bg-violet-50 px-4 py-1.5 text-center text-xs font-medium text-violet-800 sm:text-sm">
          <ShieldAlert className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />
          DB 연동 시험 화면 · <strong>가상 환자 계정만</strong> 사용하세요. 실명·실제 생년월일을 입력하지 마세요.
        </div>
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 text-white shadow-sm">
            <HeartPulse className="h-6 w-6" aria-hidden />
          </span>
          <div className="leading-tight">
            <div className="text-xl font-extrabold tracking-tight text-slate-900">CareLog</div>
            <div className="text-xs font-medium text-slate-500">환자 로그인</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        {!configured ? (
          <Card>
            <ErrorText>{PATIENT_AUTH_MESSAGES.notConfigured}</ErrorText>
            <p className="mt-3 text-sm text-slate-500">가상 데이터 데모는 계속 이용할 수 있습니다.</p>
          </Card>
        ) : (
          <Card>
            <div role="tablist" aria-label="로그인 방식" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
              {(
                [
                  { key: "first", label: "처음 이용하기", icon: UserRoundCheck },
                  { key: "login", label: "로그인", icon: LogIn },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => switchTab(key)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-base font-bold transition",
                    tab === key ? "bg-white text-teal-700 shadow-sm" : "text-slate-500",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
              {(tab === "login" || step === "verify") && (
                <label className="block">
                  <span className="mb-1.5 block text-base font-bold text-slate-800">환자 코드</span>
                  <input
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={20}
                    placeholder="예: ABCD-EFGH-JKMN"
                    className={cn(inputClass, "font-mono tracking-wider")}
                    required
                  />
                  <span className="mt-1 block text-xs text-slate-500">병원에서 미리 발급한 코드 (하이픈 없이 입력해도 됩니다)</span>
                </label>
              )}

              {tab === "first" && step === "verify" && (
                <label className="block">
                  <span className="mb-1.5 block text-base font-bold text-slate-800">생년월일 8자리</span>
                  <input
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="YYYYMMDD"
                    className={inputClass}
                    required
                  />
                </label>
              )}

              {(tab === "login" || step === "password") && (
                <label className="block">
                  <span className="mb-1.5 block text-base font-bold text-slate-800">{tab === "login" ? "비밀번호" : "새 비밀번호"}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={tab === "login" ? "current-password" : "new-password"}
                    maxLength={72}
                    className={inputClass}
                    required
                  />
                  {tab === "first" && (
                    <span className="mt-1 block text-xs text-slate-500">{PASSWORD_MIN}자 이상, 영문과 숫자를 함께 사용</span>
                  )}
                </label>
              )}

              {tab === "first" && step === "password" && (
                <label className="block">
                  <span className="mb-1.5 block text-base font-bold text-slate-800">비밀번호 확인</span>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    maxLength={72}
                    className={inputClass}
                    required
                  />
                </label>
              )}

              {notice && (
                <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800" aria-live="polite">
                  {notice}
                </p>
              )}
              <ErrorText>{error}</ErrorText>

              <Button type="submit" size="lg" className="w-full" disabled={pending} icon={tab === "login" ? LogIn : KeyRound}>
                {pending
                  ? "확인 중…"
                  : tab === "login"
                    ? "로그인"
                    : step === "verify"
                      ? "확인"
                      : "비밀번호 설정하고 시작하기"}
              </Button>
            </form>
          </Card>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          로그인 없이 둘러보기:{" "}
          <Link href="/" className="font-semibold text-teal-700 underline">
            가상 데이터 데모
          </Link>
        </p>
      </main>
    </div>
  );
}
