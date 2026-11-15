"use client";

/**
 * 환자 화면(/login, /my) 공통 디자인 컴포넌트 — 따뜻한 아이보리 + 파스텔 세이지
 * 버튼·입력창·선택 버튼·상태 표시는 이 파일의 컴포넌트만 사용합니다.
 * (기존 데모 화면은 components/ui/primitives.tsx 를 그대로 사용)
 */
import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/components/ui/primitives";

export { cn };

/* ───────────── 레이아웃 ───────────── */

export function Wordmark({ sub, className }: { sub?: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="text-[1.65rem] font-extrabold tracking-tight text-sage-700">CareLog</span>
      {sub && <span className="text-sm text-ink-soft">{sub}</span>}
    </div>
  );
}

export function PCard({
  children,
  tone = "white",
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  tone?: "white" | "tint" | "ivory";
  className?: string;
  as?: "section" | "div" | "article";
} & { "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-[1.75rem] p-5 sm:p-6",
        tone === "white" && "border border-line bg-white",
        tone === "tint" && "bg-sage-100",
        tone === "ivory" && "bg-ivory-deep",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeading({ title, sub, action, id }: { title: string; sub?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-bold text-ink">
          {title}
        </h2>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───────────── 버튼 ───────────── */

export function PButton({
  children,
  variant = "primary",
  size = "lg",
  icon: Icon,
  arrow,
  className,
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "soft" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  /** 버튼 끝 → 화살표 (시각 장식) */
  arrow?: boolean;
  className?: string;
  type?: "button" | "submit";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}) {
  return (
    <button
      type={type}
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold transition disabled:cursor-not-allowed",
        size === "lg" && "min-h-14 rounded-[1.25rem] px-6 text-[1.05rem]",
        size === "md" && "min-h-12 rounded-2xl px-5 text-base",
        size === "sm" && "min-h-10 rounded-xl px-3.5 text-sm",
        variant === "primary" && "bg-sage-700 text-white hover:bg-sage-800 disabled:bg-sage-300",
        variant === "secondary" &&
          "border border-line bg-white text-sage-800 hover:bg-sage-50 disabled:text-ink-soft disabled:opacity-60",
        variant === "soft" && "bg-sage-100 text-sage-800 hover:bg-sage-200 disabled:opacity-60",
        variant === "ghost" && "text-ink-soft hover:bg-ivory-deep hover:text-ink",
        className,
      )}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
      {children}
      {arrow && <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />}
    </button>
  );
}

/* ───────────── 입력 ───────────── */

export type HelperTone = "muted" | "ok" | "warn";

function Helper({ id, tone = "muted", children }: { id: string; tone?: HelperTone; children: ReactNode }) {
  return (
    <p
      id={id}
      className={cn(
        "mt-2 flex items-start gap-1 text-[0.82rem]",
        tone === "muted" && "text-ink-soft",
        tone === "ok" && "font-medium text-sage-700",
        tone === "warn" && "font-medium text-blush-700",
      )}
    >
      {tone === "ok" && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

const fieldBase =
  "w-full rounded-[1.1rem] border border-line bg-white px-5 text-[1.05rem] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage-500 focus:ring-4 focus:ring-sage-100";

export function TextField({
  label,
  helper,
  helperTone = "muted",
  className,
  inputClassName,
  ...input
}: {
  label: string;
  helper?: ReactNode;
  helperTone?: HelperTone;
  className?: string;
  inputClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-base font-bold text-ink">
        {label}
      </label>
      <input id={id} aria-describedby={helper ? helpId : undefined} className={cn(fieldBase, "h-14", inputClassName)} {...input} />
      {helper && (
        <Helper id={helpId} tone={helperTone}>
          {helper}
        </Helper>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hideLabel,
  counter,
  ...area
}: {
  label: string;
  hideLabel?: boolean;
  counter?: boolean;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const id = useId();
  const length = typeof area.value === "string" ? area.value.length : 0;
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-2 block text-base font-bold text-ink"}>
        {label}
      </label>
      <div className="rounded-[1.25rem] bg-ivory focus-within:ring-4 focus-within:ring-sage-100">
        <textarea id={id} className="block w-full resize-none rounded-[1.25rem] bg-transparent px-5 pt-4 pb-1 text-base leading-relaxed text-ink outline-none placeholder:text-ink-soft/60" {...area} />
        {counter && area.maxLength && (
          <div className="px-5 pb-3 text-right text-xs text-ink-soft" aria-hidden>
            {length} / {area.maxLength}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── 선택 버튼 ───────────── */

/** 둥근 탭/토글 (처음 이용하기·로그인, 7일·30일 등) */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  ariaLabel,
  mode = "toggle",
  className,
}: {
  items: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** tabs: role=tab(aria-selected) / toggle: aria-pressed */
  mode?: "tabs" | "toggle";
  className?: string;
}) {
  return (
    <div
      role={mode === "tabs" ? "tablist" : "group"}
      aria-label={ariaLabel}
      className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-[1.25rem] bg-ivory-deep p-1.5", className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={String(it.value)}
            type="button"
            role={mode === "tabs" ? "tab" : undefined}
            aria-selected={mode === "tabs" ? active : undefined}
            aria-pressed={mode === "toggle" ? active : undefined}
            onClick={() => onChange(it.value)}
            className={cn(
              "min-h-12 rounded-[1rem] px-3 text-base transition",
              active ? "bg-white font-bold text-sage-800 shadow-[0_1px_3px_rgba(38,63,51,0.08)]" : "font-medium text-ink-soft hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** 알약 모양 선택 버튼 그룹 (단일/복수 선택) — 선택되면 ✓ 표시 */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: { value: T; label: string }[];
  value: T | T[] | undefined;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-2xl border px-4 text-[0.95rem] transition",
              on
                ? "border-sage-300 bg-sage-100 font-bold text-sage-800"
                : "border-transparent bg-ivory font-medium text-ink-soft hover:border-sage-200 hover:text-ink",
            )}
          >
            {o.label}
            {on && <Check className="h-4 w-4" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** 큰 숫자 타일 (오늘의 컨디션 1~5) — 선택된 타일은 진한 세이지 + ✓ */
export function ScaleTiles<T extends number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={`${o.value}점 ${o.label}`}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-[6.25rem] flex-col items-center justify-between rounded-[1.25rem] px-1 pt-4 pb-3 transition sm:min-h-28",
              on ? "bg-sage-700 text-white shadow-sm" : "bg-white/75 text-sage-800 hover:bg-white",
            )}
          >
            <span className="flex h-9 items-center text-[1.75rem] leading-none font-bold">
              {on ? <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden /> : o.value}
            </span>
            <span className={cn("text-center text-[0.72rem] leading-tight font-semibold break-keep sm:text-xs", on ? "text-white" : "text-ink-soft")}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 막대 눈금 선택 (통증 0~10, 피로 1~5)
 * 각 칸이 버튼이며 누른 칸까지 채워집니다. zeroLabel이 있으면 맨 앞에 0점(없음) 버튼을 둡니다.
 */
export function SegmentScale({
  label,
  value,
  max,
  onChange,
  zeroLabel,
  describe,
}: {
  label: string;
  value: number | undefined;
  max: number;
  onChange: (v: number) => void;
  zeroLabel?: string;
  describe?: (v: number) => string;
}) {
  const steps = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-ink">{label}</span>
        <span className="text-sm font-bold text-sage-700" aria-hidden>
          {value === undefined ? "선택 전" : `${value} / ${max}`}
          {value !== undefined && describe && <span className="ml-1 font-medium text-ink-soft">· {describe(value)}</span>}
        </span>
      </div>
      <div role="group" aria-label={label} className={cn("flex items-center", max > 5 ? "gap-1" : "gap-1.5")}>
        {zeroLabel && (
          <button
            type="button"
            aria-pressed={value === 0}
            aria-label={`${label} 0점 ${zeroLabel}`}
            onClick={() => onChange(0)}
            className={cn(
              "mr-1 min-h-9 shrink-0 rounded-xl px-2.5 text-xs font-bold transition",
              value === 0 ? "bg-sage-700 text-white" : "bg-ivory text-ink-soft hover:text-ink",
            )}
          >
            {zeroLabel}
          </button>
        )}
        {steps.map((n) => {
          const filled = value !== undefined && n <= value;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              aria-label={`${label} ${n}점${describe ? ` ${describe(n)}` : ""}`}
              onClick={() => onChange(n)}
              className="group flex h-9 min-w-0 flex-1 items-center"
            >
              <span
                className={cn(
                  "block h-2.5 w-full rounded-full transition",
                  filled ? "bg-sage-700" : "bg-ivory-deep group-hover:bg-sage-200",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── 상태 표시 ───────────── */

export function StatusPill({
  children,
  tone = "sage",
  check,
  className,
}: {
  children: ReactNode;
  tone?: "sage" | "outline" | "ivory" | "warn";
  check?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap",
        tone === "sage" && "bg-sage-100 text-sage-800",
        tone === "outline" && "border border-sage-300 bg-sage-50 text-sage-800",
        tone === "ivory" && "bg-ivory-deep text-ink-soft",
        tone === "warn" && "bg-blush-50 text-blush-700",
        className,
      )}
    >
      {check && <Check className="h-4 w-4" aria-hidden />}
      {children}
    </span>
  );
}

/** 안내 문구 (성공·정보) */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p aria-live="polite" className={cn("rounded-2xl bg-sage-100 px-4 py-3 text-sm font-semibold text-sage-800", className)}>
      {children}
    </p>
  );
}

/** 오류 안내 (스크린리더에 즉시 읽힘) */
export function Alert({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("rounded-2xl bg-blush-50 px-4 py-3 text-sm font-semibold text-blush-700", className)}>
      {children}
    </p>
  );
}

/** 하단 시트(모바일) / 가운데 창(PC) */
export function SoftSheet({
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-sage-900/30 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] bg-ivory p-4 shadow-xl sm:max-w-2xl sm:rounded-[2rem] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <PButton variant="ghost" size="sm" onClick={onClose}>
            닫기
          </PButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 새싹 일러스트 (장식) */
export function LeafIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden fill="none">
      <path d="M62 148 C60 120 62 88 74 52 C78 40 82 30 84 22" stroke="#3e6b55" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M68 92 C46 96 14 86 6 58 C30 50 58 62 68 92 Z" fill="#a7c4ad" />
      <path d="M68 92 C50 82 30 70 12 60" stroke="#6a967a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M70 108 C80 78 104 66 118 70 C116 94 98 112 70 108 Z" fill="#dce8dd" />
      <path d="M70 108 C86 92 100 82 114 74" stroke="#7fa48a" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="86" cy="18" rx="9" ry="11" fill="#c8dbcb" stroke="#3e6b55" strokeWidth="2.2" />
      <ellipse cx="86" cy="15" rx="3.4" ry="4" fill="#f8f6f0" />
    </svg>
  );
}
