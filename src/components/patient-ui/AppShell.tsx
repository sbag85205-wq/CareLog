"use client";

import { LogOut, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, cn, PButton, PCard, Wordmark } from "@/components/patient-ui/kit";
import type { LoadState } from "@/lib/repository/supabase";

export interface ShellTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

/**
 * 로그인 버전 공통 화면 틀 — 모바일: 상단 + 하단 탭 / PC: 왼쪽 메뉴
 * (환자·간호사/의료진·보호자 화면이 같은 틀과 공통 컴포넌트를 사용)
 */
export function AppShell<T extends string>({
  tabs,
  active,
  onTab,
  roleLabel,
  userLabel,
  onLogout,
  loadState,
  onRetry,
  ready,
  children,
}: {
  tabs: ShellTab<T>[];
  active: T;
  onTab: (t: T) => void;
  roleLabel: string;
  userLabel?: string;
  onLogout: () => void;
  loadState: LoadState | null;
  onRetry: () => void;
  ready: boolean;
  children: ReactNode;
}) {
  const go = (t: T) => {
    onTab(t);
    window.scrollTo({ top: 0 });
  };
  const showTabs = tabs.length > 1;
  return (
    <div className="min-h-dvh bg-ivory text-ink lg:flex">
      {/* PC: 왼쪽 메뉴 */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-ivory px-5 py-7 lg:flex">
        <Wordmark sub="케어로그" />
        <p className="mt-3 text-sm text-ink-soft">
          <span className="font-bold text-sage-800">{roleLabel}</span>
          {userLabel && <span> · {userLabel}</span>}
        </p>
        {showTabs && (
          <nav aria-label="메뉴" className="mt-8 space-y-1.5">
            {tabs.map((t) => (
              <NavItem key={t.id} label={t.label} icon={t.icon} active={active === t.id} onClick={() => go(t.id)} layout="side" />
            ))}
          </nav>
        )}
        <div className="mt-auto space-y-3">
          <p className="rounded-2xl bg-ivory-deep px-4 py-3 text-xs leading-relaxed text-ink-soft">
            DB 연동 시험 (carelog-dev) · 가상 계정 전용입니다. 실제 환자정보를 입력하지 마세요.
          </p>
          <PButton variant="secondary" size="md" icon={LogOut} className="w-full" onClick={onLogout}>
            로그아웃
          </PButton>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 모바일: 상단 */}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-ivory/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Wordmark />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs whitespace-nowrap text-ink-soft max-[359px]:hidden">{roleLabel}</span>
              <PButton variant="ghost" size="sm" icon={LogOut} onClick={onLogout}>
                로그아웃
              </PButton>
            </div>
          </div>
        </header>

        <main className={cn("mx-auto max-w-xl px-4 pt-5 sm:px-6 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-16", showTabs ? "pb-32" : "pb-16")}>
          {(!loadState || loadState.state === "loading" || loadState.state === "idle" || (!ready && loadState.state === "ready")) && (
            <p className="py-24 text-center text-ink-soft">불러오는 중…</p>
          )}
          {loadState?.state === "error" && (
            <PCard>
              <Alert>{loadState.message}</Alert>
              <PButton variant="secondary" size="md" className="mt-4" onClick={onRetry}>
                다시 불러오기
              </PButton>
            </PCard>
          )}
          {ready && children}
        </main>

        {/* 모바일: 하단 탭 */}
        {showTabs && (
          <nav
            aria-label="메뉴"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          >
            <div className="mx-auto grid max-w-xl gap-1 px-2 py-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t) => (
                <NavItem key={t.id} label={t.label} icon={t.icon} active={active === t.id} onClick={() => go(t.id)} layout="bottom" />
              ))}
            </div>
          </nav>
        )}
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
        layout === "side" ? "min-h-12 w-full gap-3 px-4 text-base" : "min-h-14 min-w-0 flex-col justify-center gap-1 px-0.5 text-[0.7rem] leading-tight",
        active ? "bg-sage-100 font-bold text-sage-800" : "font-medium text-ink-soft hover:bg-ivory-deep hover:text-ink",
      )}
    >
      <Icon className={layout === "side" ? "h-6 w-6" : "h-5 w-5"} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** 화면 제목 (각 탭 상단) */
export function PageTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1.5 text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
