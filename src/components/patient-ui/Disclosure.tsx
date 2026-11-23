"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "./kit";

/** 접기·펼치기 상태를 이 브라우저에 기억 (저장 실패해도 화면은 정상 동작) */
function readOpen(key: string | undefined, fallback: boolean): boolean {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(`carelog.ui.${key}`);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeOpen(key: string | undefined, open: boolean) {
  if (!key) return;
  try {
    window.localStorage.setItem(`carelog.ui.${key}`, open ? "1" : "0");
  } catch {
    /* 저장 공간이 없어도 계속 사용 */
  }
}

/**
 * 접기·펼치기 섹션 (Soft Glass 카드와 같은 모양)
 * - 제목 줄 전체가 버튼 (aria-expanded · aria-controls), 44px 이상 누르기 영역
 * - summary: 접혀 있어도 보이는 한 줄 요약 (예: 3 / 5 기록)
 * - rememberKey: 사용자가 바꾼 상태를 이 브라우저에 기억
 */
export function Disclosure({
  title,
  summary,
  icon,
  defaultOpen = true,
  rememberKey,
  tone = "white",
  className,
  headerExtra,
  children,
  "aria-label": ariaLabel,
}: {
  title: ReactNode;
  summary?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  rememberKey?: string;
  tone?: "white" | "mint" | "lavender" | "tint" | "ivory";
  className?: string;
  /** 제목 줄 오른쪽에 붙는 장식(마스코트 등) — 버튼 밖 */
  headerExtra?: ReactNode;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(() => readOpen(rememberKey, defaultOpen));
  const id = useId();
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "rounded-[1.25rem]",
        tone === "white" && "border border-line bg-white shadow-soft",
        tone === "mint" && "border border-mint-200/70 bg-gradient-to-br from-mint-50 to-mint-100/80 shadow-soft",
        tone === "lavender" && "border border-lavender-100 bg-gradient-to-br from-lavender-50 to-lavender-100/70 shadow-soft",
        tone === "tint" && "border border-brand-100 bg-brand-50",
        tone === "ivory" && "border border-line/70 bg-ivory-deep/60",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen((v) => {
              writeOpen(rememberKey, !v);
              return !v;
            });
          }}
          className={cn("flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl text-left", open ? "pb-1" : "pb-4 sm:pb-5")}
        >
          {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-ink sm:text-xl">{title}</span>
            {summary && <span className="mt-0.5 block text-sm text-ink-soft">{summary}</span>}
          </span>
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700">
            {open ? "접기" : "펼치기"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </span>
        </button>
        {headerExtra}
      </div>
      <div id={id} hidden={!open} className="px-4 pb-4 sm:px-6 sm:pb-5">
        {children}
      </div>
    </section>
  );
}
