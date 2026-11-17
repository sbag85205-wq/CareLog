"use client";

import { Check, ChevronLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, LeafIllustration, Notice, PButton, PCard, Segmented, TextField, Wordmark, type HelperTone } from "@/components/patient-ui/kit";
import { checkPasswordPolicy, PASSWORD_MIN, PATIENT_AUTH_MESSAGES } from "@/lib/patient-auth/rules";
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
      if (data.user) router.replace("/"); // 서버가 확인한 역할의 화면으로
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


  const backToVerify = () => {
    setStep("verify");
    setPassword("");
    setPasswordConfirm("");
    setError(null);
  };

  // 비밀번호 규칙 실시간 안내 (서버에서도 같은 규칙으로 다시 검사)
  const pwRule = password ? checkPasswordPolicy(password, password, loginCode) : null;
  const pwHelper: [string, HelperTone] = !password
    ? [`영문과 숫자를 함께 넣어 ${PASSWORD_MIN}자 이상 입력해 주세요.`, "muted"]
    : pwRule
      ? [pwRule, "warn"]
      : [`영문·숫자를 포함해 ${PASSWORD_MIN}자 이상 입력했어요.`, "ok"];
  const confirmHelper: [string, HelperTone] = !passwordConfirm
    ? ["같은 비밀번호를 한 번 더 입력해 주세요.", "muted"]
    : passwordConfirm === password
      ? ["비밀번호가 일치해요.", "ok"]
      : ["비밀번호가 아직 달라요.", "warn"];

  const settingPassword = tab === "first" && step === "password";

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
            {settingPassword ? (
              <>
                <button
                  type="button"
                  onClick={backToVerify}
                  className="-ml-2 inline-flex min-h-10 items-center gap-0.5 rounded-xl px-2 text-ink-soft hover:bg-ivory-deep hover:text-ink"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden /> 이전
                </button>
                <p className="mt-6 text-sm font-bold text-sage-700">
                  <span className="inline-flex items-center gap-1">
                    본인 확인 <Check className="h-4 w-4" aria-label="완료" />
                  </span>
                  <span className="mx-3 text-ink-soft" aria-hidden>
                    —
                  </span>
                  <span className="text-ink">02 비밀번호 설정</span>
                </p>
                <h1 className="mt-4 text-[1.85rem] leading-snug font-extrabold tracking-tight text-ink">
                  나만의 비밀번호를
                  <br />
                  만들어 주세요.
                </h1>
                <p className="mt-3 text-ink-soft">
                  다음부터는 환자 코드와 비밀번호로 로그인해요. 10분 안에 새 비밀번호를 설정해 주세요.
                </p>
                <p className="mt-6 flex items-center gap-2 rounded-[1.25rem] bg-sage-100 px-5 py-4 font-bold text-sage-800">
                  <ShieldCheck className="h-5 w-5" aria-hidden /> 본인 확인 완료
                </p>
              </>
            ) : (
              <div className="relative">
                <Wordmark sub="케어로그" className="lg:hidden" />
                <h1 className="mt-10 text-[1.85rem] leading-snug font-extrabold tracking-tight text-ink lg:mt-0">
                  <span className="lg:hidden">
                    오늘의 나를,
                    <br />
                    천천히 기록해요.
                  </span>
                  <span className="hidden lg:inline">{tab === "login" ? "다시 오셨네요." : "처음 오셨나요?"}</span>
                </h1>
                <p className="mt-3 text-ink-soft">
                  <span className="lg:hidden">작은 변화도 놓치지 않도록 함께할게요.</span>
                  <span className="hidden lg:inline">
                    {tab === "login" ? "환자 코드와 비밀번호로 로그인해요." : "병원에서 받은 환자 코드와 생년월일로 본인 확인을 해요."}
                  </span>
                </p>
                <LeafIllustration className="absolute top-12 -right-1 h-28 w-24 lg:hidden" />
              </div>
            )}

            {!configured ? (
              <div className="mt-8 space-y-3">
                <Alert>{PATIENT_AUTH_MESSAGES.notConfigured}</Alert>
                <p className="text-sm text-ink-soft">가상 데이터 데모는 계속 이용할 수 있습니다.</p>
              </div>
            ) : (
              <>
                {!settingPassword && (
                  <Segmented
                    mode="tabs"
                    ariaLabel="로그인 방식"
                    className="mt-8"
                    items={[
                      { value: "first" as Tab, label: "처음 이용하기" },
                      { value: "login" as Tab, label: "로그인" },
                    ]}
                    value={tab}
                    onChange={switchTab}
                  />
                )}

                <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-6" noValidate>
                  {!settingPassword && (
                    <TextField
                      label="환자 코드"
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                      autoComplete="username"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={20}
                      placeholder="예: ABCD-EFGH-JKMN"
                      inputClassName="font-mono tracking-wider"
                      helper="병원에서 안내받은 코드를 입력해 주세요. 하이픈(-)은 없어도 돼요."
                      required
                    />
                  )}

                  {tab === "first" && step === "verify" && (
                    <TextField
                      label="생년월일 8자리"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="YYYYMMDD"
                      helper="예: 1970년 1월 1일 → 19700101"
                      required
                    />
                  )}

                  {tab === "login" && (
                    <TextField
                      label="비밀번호"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      maxLength={72}
                      required
                    />
                  )}

                  {settingPassword && (
                    <>
                      <TextField
                        label="새 비밀번호"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        maxLength={72}
                        helper={pwHelper[0]}
                        helperTone={pwHelper[1]}
                        required
                      />
                      <TextField
                        label="새 비밀번호 확인"
                        type="password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        autoComplete="new-password"
                        maxLength={72}
                        helper={confirmHelper[0]}
                        helperTone={confirmHelper[1]}
                        required
                      />
                    </>
                  )}

                  <Notice>{notice}</Notice>
                  <Alert>{error}</Alert>

                  <PButton type="submit" className="w-full" disabled={pending} arrow={!pending && tab === "first"}>
                    {pending
                      ? "확인 중…"
                      : tab === "login"
                        ? "로그인"
                        : step === "verify"
                          ? "본인 확인하고 시작하기"
                          : "설정하고 내 건강기록으로"}
                  </PButton>
                </form>
              </>
            )}

            <div className="mt-8 space-y-2 text-center text-sm text-ink-soft">
              <p>DB 연동 시험 화면 · 가상 환자 계정만 사용하세요. 실명·실제 생년월일은 입력하지 마세요.</p>
              <p>
                보호자·간호사이신가요?{" "}
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
