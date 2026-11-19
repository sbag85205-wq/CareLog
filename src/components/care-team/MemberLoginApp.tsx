"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MemberLoginForm } from "@/components/care-team/MemberLoginForm";
import { LeafIllustration, PCard, Wordmark } from "@/components/patient-ui/kit";
import { getBrowserClient } from "@/lib/supabase/browser";

/** /login/member — 보호자·간호사/의료진 로그인 */
export function MemberLoginApp() {
  const router = useRouter();
  useEffect(() => {
    // 이미 로그인되어 있으면 서버가 역할에 맞는 화면으로 보냄
    void getBrowserClient()?.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  return (
    <div className="min-h-dvh bg-ivory text-ink">
      <main className="mx-auto w-full max-w-md px-5 pt-8 pb-10 lg:pt-16">
        <PCard className="!p-0 lg:!p-10 max-lg:!border-0 max-lg:!bg-transparent">
          <div className="relative">
            <Wordmark sub="케어로그" />
            <h1 className="mt-10 text-[1.85rem] leading-snug font-extrabold tracking-tight text-ink">
              보호자·의료진·관리자
              <br />
              로그인
            </h1>
            <p className="mt-3 text-ink-soft">미리 준비된 계정의 이메일과 비밀번호로 로그인해요.</p>
            <LeafIllustration className="absolute top-12 -right-1 h-28 w-24" />
          </div>
          <div className="mt-8">
            <MemberLoginForm onSuccess={(home) => router.replace(home)} />
          </div>
          <div className="mt-8 space-y-2 text-center text-sm text-ink-soft">
            <p>
              환자이신가요?{" "}
              <Link href="/login" className="font-semibold text-sage-700 underline underline-offset-4">
                아이디로 로그인
              </Link>
            </p>
            <p>DB 연동 시험 화면 · 가상 계정만 사용하세요.</p>
          </div>
        </PCard>
      </main>
    </div>
  );
}
