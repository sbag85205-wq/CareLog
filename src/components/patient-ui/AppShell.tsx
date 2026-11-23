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
 * 로그인 버전 공통 화면 틀 (Soft Glass)
 * 메뉴는 상단 탭 하나로 통일 — PC: 로고 옆 한 줄 / 좁은 화면: 로고 아래 가로 스크롤.
 * (환자·간호사/의료진·보호자 화면이 같은 틀과 공통 컴포넌트를 사용)
 */
export function AppShell<T extends string>({
  tabs,
  active,
  onTab,
  roleLabel,
  userLabel,
  onLogout,
  topBar,
  sideNote,
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
  /** 없으면 로그아웃 버튼을 숨김 (공개 데모) */
  onLogout?: () => void;
  /** 화면 맨 위 띠 (공개 데모: 가상 데이터 표시·역할 전환) */
  topBar?: ReactNode;
  /** 화면 아래쪽 안내 문구 (데이터 출처·주의) */
  sideNote?: ReactNode;
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
    <div className="min-h-dvh bg-ivory text-ink">
      {topBar}
      <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-6 px-4 sm:px-6 lg:flex-nowrap lg:px-8">
          <div className="order-1 flex min-h-16 min-w-0 items-center">
            <Wordmark />
          </div>
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 lg:order-3">
            <p className="text-right text-xs leading-tight text-ink-soft max-[359px]:hidden sm:text-sm">
              <span className="font-bold text-ink">{roleLabel}</span>
              {userLabel && <span className="hidden sm:inline"> · {userLabel}</span>}
            </p>
            {onLogout && (
              <PButton variant="ghost" size="sm" icon={LogOut} onClick={onLogout}>
                로그아웃
              </PButton>
            )}
          </div>
          {showTabs && (
            <nav
              aria-label="메뉴"
              className="scrollbar-none order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 pb-2 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:order-2 lg:mx-0 lg:w-auto lg:flex-1 lg:px-0 lg:pb-0"
            >
              <div className="flex w-max gap-1">
                {tabs.map((t) => (
                  <NavItem key={t.id} label={t.label} active={active === t.id} onClick={() => go(t.id)} />
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-10">
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
        <p className="no-print mt-10 rounded-[0.875rem] border border-line/70 bg-white/60 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          {sideNote ?? "DB 연동 시험 (carelog-dev) · 가상 계정 전용입니다. 실제 환자정보를 입력하지 마세요."}
        </p>
      </main>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-[0.75rem] px-4 text-[0.95rem] whitespace-nowrap transition lg:min-h-12",
        active ? "bg-brand-100 font-bold text-brand-800" : "font-medium text-ink-soft hover:bg-ivory-deep hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

/** 화면 제목 (각 탭 상단) — 제목 32/800 (모바일 24) */
export function PageTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-[1.9rem]">{title}</h1>
        {sub && <p className="mt-1.5 text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
