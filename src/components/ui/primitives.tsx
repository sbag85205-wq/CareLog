"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const BADGE_TONE = {
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

export function Badge({
  children,
  tone = "slate",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap",
        BADGE_TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="violet" className={className}>
      데모 데이터
    </Badge>
  );
}

/** 큰 터치 영역의 선택 버튼 그룹 (단일/복수 선택 공용) */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  columns,
  size = "md",
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; sub?: string }[];
  value: T | T[] | undefined;
  onChange: (v: T) => void;
  columns?: string;
  size?: "md" | "sm";
  ariaLabel: string;
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div role="group" aria-label={ariaLabel} className={cn("grid gap-2", columns ?? "grid-cols-3 sm:grid-cols-5")}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={selected(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border-2 text-center font-semibold transition",
            size === "md" ? "min-h-14 px-2 py-2.5 text-base" : "min-h-11 px-2 py-1.5 text-sm",
            selected(o.value)
              ? "border-teal-500 bg-teal-50 text-teal-800"
              : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50/40",
          )}
        >
          {o.label}
          {o.sub && <span className="mt-0.5 text-xs font-medium text-slate-500">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  type = "button",
  disabled,
  className,
  size = "md",
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  size?: "md" | "lg" | "sm";
}) {
  const variants = {
    primary: "bg-gradient-to-r from-teal-500 to-sky-500 text-white shadow-sm hover:from-teal-600 hover:to-sky-600",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100",
  };
  const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-base", lg: "h-14 px-6 text-lg" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {Icon && <Icon className="h-5 w-5" aria-hidden />}
      {children}
    </button>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {Icon && <Icon className="h-4 w-4" aria-hidden />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
        {value}
        {unit && <span className="ml-0.5 text-base font-semibold text-slate-500">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** 저장 실패 등 오류 안내 (스크린리더에 즉시 읽힘) */
export function ErrorText({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700", className)}>
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** 하단 시트(모바일) / 중앙 모달(PC) */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
