"use client";

import { ClipboardPen, HeartPulse, LogOut, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ConditionForm } from "@/components/health/ConditionForm";
import { HealthHistory } from "@/components/health/HealthHistory";
import { Button, Card, ErrorText, SectionTitle } from "@/components/ui/primitives";
import { RepositoryProvider } from "@/hooks/repository-context";
import { formatKoreanDate, todayISO } from "@/lib/date";
import { MODE_LABEL } from "@/lib/labels";
import { createSupabasePatientRepository, type SupabasePatientRepository } from "@/lib/repository/supabase";
import { getBrowserClient } from "@/lib/supabase/browser";

const noopSubscribe = () => () => {};

/** DB 모드: 로그인한 가상 환자 본인의 컨디션 기록 (Supabase) */
export function MyRecordsApp() {
  const router = useRouter();
  const [repo, setRepo] = useState<SupabasePatientRepository | null>(null);

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void client.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) return router.replace("/login");
      const r = createSupabasePatientRepository(client, data.user.id);
      setRepo(r);
      void r.load();
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const snapshot = useSyncExternalStore(repo?.subscribe ?? noopSubscribe, () => repo?.getSnapshot() ?? null, () => null);
  const loadState = useSyncExternalStore(repo?.subscribe ?? noopSubscribe, () => repo?.getLoadState() ?? null, () => null);

  async function logout() {
    await fetch("/api/patient-auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    await getBrowserClient()?.auth.signOut();
    router.replace("/login");
  }

  const patient = snapshot?.patients[0];
  // 현재 날짜는 데이터가 준비된 뒤(브라우저)에서만 계산 — 사전 렌더링 중 new Date() 사용 금지 (cacheComponents)
  const today = snapshot ? todayISO() : "";
  const todayRecord = snapshot?.records.find((r) => r.date === today);
  const admission = snapshot?.admissions[0];

  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50/60 via-white to-white">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="bg-violet-50 px-4 py-1.5 text-center text-xs font-medium text-violet-800 sm:text-sm">
          <ShieldAlert className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />
          DB 연동 시험 (carelog-dev) · 가상 환자 계정 · 실제 환자정보 입력 금지
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 text-white shadow-sm">
              <HeartPulse className="h-6 w-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <div className="text-xl font-extrabold tracking-tight text-slate-900">CareLog</div>
              <div className="text-xs font-medium text-slate-500">내 건강기록</div>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={LogOut} onClick={() => void logout()}>
            로그아웃
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:py-6">
        {(!repo || loadState?.state === "loading" || loadState?.state === "idle") && (
          <p className="py-16 text-center text-slate-400">기록을 불러오는 중…</p>
        )}
        {loadState?.state === "error" && (
          <Card>
            <ErrorText>{loadState.message}</ErrorText>
            <Button variant="secondary" className="mt-3" onClick={() => void repo?.load()}>
              다시 불러오기
            </Button>
          </Card>
        )}

        {loadState?.state === "ready" && patient && repo && (
          <RepositoryProvider value={repo}>
            <div className="rounded-3xl bg-gradient-to-br from-teal-500 to-sky-600 p-5 text-white shadow-md sm:p-6">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">가상 환자 · DB 저장</span>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{patient.name}님, 안녕하세요</h1>
              <p className="mt-1 text-sm text-white/90">
                {formatKoreanDate(today)} · {MODE_LABEL[patient.careMode]} 중
              </p>
            </div>

            <Card>
              <SectionTitle
                icon={ClipboardPen}
                title="오늘의 컨디션 기록"
                subtitle={`${formatKoreanDate(today)} · ${todayRecord ? "오늘 기록이 있어요 — 다시 저장하면 수정됩니다" : "아직 기록하지 않았어요"}`}
              />
              <ConditionForm
                key={today}
                patientId={patient.id}
                date={today}
                mode={patient.careMode}
                existing={todayRecord}
              />
            </Card>

            <HealthHistory patient={patient} admission={admission} records={snapshot?.records ?? []} />
          </RepositoryProvider>
        )}
      </main>
    </div>
  );
}
