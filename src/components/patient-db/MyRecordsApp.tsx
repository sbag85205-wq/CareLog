"use client";

import { ChartNoAxesColumn, House, LogOut, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PatientConditionForm } from "@/components/patient-db/PatientConditionForm";
import { PatientRecordsView } from "@/components/patient-db/PatientRecordsView";
import { Alert, cn, PButton, PCard, StatusPill, Wordmark } from "@/components/patient-ui/kit";
import { CONDITION_WORD } from "@/components/patient-ui/labels";
import { RepositoryProvider } from "@/hooks/repository-context";
import { formatKoreanDate, formatLongKoreanDate, lastNDates, todayISO } from "@/lib/date";
import { MODE_LABEL } from "@/lib/labels";
import { createSupabasePatientRepository, type SupabasePatientRepository } from "@/lib/repository/supabase";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { HealthRecord } from "@/types";

const noopSubscribe = () => () => {};

type Tab = "home" | "records";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: House },
  { id: "records", label: "기록 보기", icon: ChartNoAxesColumn },
];

/** DB 모드: 로그인한 가상 환자 본인의 컨디션 기록 (Supabase, RLS 적용) */
export function MyRecordsApp() {
  const router = useRouter();
  const [repo, setRepo] = useState<SupabasePatientRepository | null>(null);
  const [tab, setTab] = useState<Tab>("home");

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

  const goTab = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const patient = snapshot?.patients[0];
  // 현재 날짜는 데이터가 준비된 뒤(브라우저)에서만 계산 — 사전 렌더링 중 new Date() 사용 금지 (cacheComponents)
  const today = snapshot ? todayISO() : "";
  const records = snapshot?.records ?? [];
  const ready = loadState?.state === "ready" && patient && repo;

  return (
    <div className="min-h-dvh bg-ivory text-ink lg:flex">
      {/* PC: 왼쪽 메뉴 */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-ivory px-5 py-7 lg:flex">
        <Wordmark sub="케어로그" />
        <nav aria-label="환자 메뉴" className="mt-10 space-y-1.5">
          {TABS.map((t) => (
            <NavItem key={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => goTab(t.id)} layout="side" />
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <p className="rounded-2xl bg-ivory-deep px-4 py-3 text-xs leading-relaxed text-ink-soft">
            DB 연동 시험 (carelog-dev) · 가상 환자 계정 전용입니다. 실제 환자정보를 입력하지 마세요.
          </p>
          <PButton variant="secondary" size="md" icon={LogOut} className="w-full" onClick={() => void logout()}>
            로그아웃
          </PButton>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 모바일: 상단 */}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-ivory/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
            <Wordmark />
            <div className="flex items-center gap-1.5">
              <span className="text-xs whitespace-nowrap text-ink-soft max-[359px]:hidden">가상 데이터</span>
              <PButton variant="ghost" size="sm" icon={LogOut} onClick={() => void logout()}>
                로그아웃
              </PButton>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-xl px-4 pt-5 pb-32 sm:px-6 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-16">
          {(!repo || loadState?.state === "loading" || loadState?.state === "idle") && (
            <p className="py-24 text-center text-ink-soft">기록을 불러오는 중…</p>
          )}
          {loadState?.state === "error" && (
            <PCard>
              <Alert>{loadState.message}</Alert>
              <PButton variant="secondary" size="md" className="mt-4" onClick={() => void repo?.load()}>
                다시 불러오기
              </PButton>
            </PCard>
          )}

          {ready && (
            <RepositoryProvider value={repo}>
              {tab === "home" ? (
                <HomeView
                  name={patient.name}
                  modeLabel={MODE_LABEL[patient.careMode]}
                  today={today}
                  records={records}
                  onShowRecords={() => goTab("records")}
                  form={(aside) => (
                    <PatientConditionForm
                      key={today}
                      patientId={patient.id}
                      date={today}
                      mode={patient.careMode}
                      existing={records.find((r) => r.date === today)}
                      aside={aside}
                    />
                  )}
                />
              ) : (
                <PatientRecordsView patient={patient} records={records} today={today} />
              )}
            </RepositoryProvider>
          )}
        </main>

        {/* 모바일: 하단 탭 */}
        <nav
          aria-label="환자 메뉴"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-2 px-4 py-2">
            {TABS.map((t) => (
              <NavItem key={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => goTab(t.id)} layout="bottom" />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
  layout,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  layout: "side" | "bottom";
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center rounded-2xl transition",
        layout === "side" ? "min-h-12 w-full gap-3 px-4 text-base" : "min-h-14 flex-col justify-center gap-1 text-xs",
        active ? "bg-sage-100 font-bold text-sage-800" : "font-medium text-ink-soft hover:bg-ivory-deep hover:text-ink",
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      {label}
    </button>
  );
}

function HomeView({
  name,
  modeLabel,
  today,
  records,
  onShowRecords,
  form,
}: {
  name: string;
  modeLabel: string;
  today: string;
  records: HealthRecord[];
  onShowRecords: () => void;
  form: (aside: React.ReactNode) => React.ReactNode;
}) {
  const latest = [...records].filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const week = lastNDates(7, today);
  const weekRecs = records.filter((r) => week.includes(r.date));
  const weekAvg = weekRecs.length ? weekRecs.reduce((s, r) => s + r.condition, 0) / weekRecs.length : null;
  const hasToday = records.some((r) => r.date === today);

  const recentCard = latest && (
    <PCard tone="tint" className="!py-4">
      <p className="text-sm font-bold text-sage-800">최근 기록 · {formatKoreanDate(latest.date, false)}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink">
          {CONDITION_WORD[latest.condition]} · 통증 {latest.pain}점
        </p>
        <button type="button" onClick={onShowRecords} className="text-sm font-semibold text-sage-800 underline-offset-4 hover:underline">
          전체 기록 보기 →
        </button>
      </div>
    </PCard>
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-soft">{formatLongKoreanDate(today)}</p>
          <StatusPill tone="outline">{modeLabel} 중</StatusPill>
        </div>
        <h1 className="mt-3 text-[1.75rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-3xl">
          {name} 님, 안녕하세요.
        </h1>
        <p className="mt-1.5 text-ink-soft">
          {hasToday ? "오늘 기록이 있어요. 다시 저장하면 수정됩니다." : "오늘의 작은 변화도 소중한 기록이에요."}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div>{form(<div className="lg:hidden">{recentCard}</div>)}</div>

        {/* PC: 오른쪽 요약 */}
        <aside className="hidden space-y-4 lg:sticky lg:top-10 lg:block" aria-label="최근 요약">
          <PCard>
            <h2 className="text-lg font-bold text-ink">이번 주 컨디션</h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-sage-700">{weekAvg === null ? "—" : weekAvg.toFixed(1)}</span>
              <span className="text-ink-soft">/ 5점 평균</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">최근 7일 중 {weekRecs.length}일 기록</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
              {week.map((d) => {
                const r = records.find((x) => x.date === d);
                return (
                  <div key={d} className="text-center">
                    <div
                      className={cn("mx-auto h-8 w-full rounded-lg", r ? "bg-sage-700" : "bg-ivory-deep")}
                      style={r ? { opacity: 0.35 + r.condition * 0.13 } : undefined}
                    />
                    <span className="mt-1 block text-[0.7rem] text-ink-soft">{Number(d.slice(8))}</span>
                  </div>
                );
              })}
            </div>
          </PCard>
          {recentCard}
          <PButton variant="secondary" size="md" className="w-full" arrow onClick={onShowRecords}>
            기록 보기
          </PButton>
        </aside>
      </div>
    </div>
  );
}
