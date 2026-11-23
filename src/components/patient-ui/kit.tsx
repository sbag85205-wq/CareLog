"use client";

/**
 * 환자 화면(/login, /my, /demo) 공통 디자인 컴포넌트 — CareLog Design System v2 · Soft Glass
 * 블루 CTA 하나 + 민트·세이지 보조 + 라벤더·피치·버터 상태색. 색 토큰은 app/globals.css.
 * 버튼·입력창·탭·필터 칩·카드·상태 표시는 이 파일의 컴포넌트만 사용합니다.
 * (기존 데모 화면은 components/ui/primitives.tsx 를 그대로 사용)
 */
import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/components/ui/primitives";
import { CloudMascot, LogoMark } from "@/components/patient-ui/illustrations";
import { BRAND } from "@/lib/brand";

export { cn };

/* ───────────── 레이아웃 ───────────── */

export function Wordmark({ sub, className }: { sub?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className="h-9 w-9 shrink-0" />
      <span className="text-[1.4rem] font-extrabold tracking-tight text-ink">{BRAND.name}</span>
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
  /** white: 기본 흰 카드 · tint: 연한 블루 강조 · ivory: 보조 면 · mint/lavender: 강조 카드(화면당 1개) · glass: 유리 */
  tone?: "white" | "tint" | "ivory" | "mint" | "lavender" | "glass";
  className?: string;
  as?: "section" | "div" | "article";
} & { "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-[1.25rem] p-5 sm:p-6",
        tone === "white" && "border border-line bg-white shadow-soft",
        tone === "tint" && "border border-brand-100 bg-brand-50",
        tone === "ivory" && "border border-line/70 bg-ivory-deep/60",
        tone === "mint" && "border border-mint-200/70 bg-gradient-to-br from-mint-50 to-mint-100/80 shadow-soft",
        tone === "lavender" && "border border-lavender-100 bg-gradient-to-br from-lavender-50 to-lavender-100/70 shadow-soft",
        tone === "glass" && "glass",
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
        "inline-flex items-center justify-center gap-2 font-bold transition duration-150 disabled:cursor-not-allowed",
        size === "lg" && "min-h-[3.25rem] rounded-[0.875rem] px-6 text-[1.05rem]",
        size === "md" && "min-h-12 rounded-[0.875rem] px-5 text-base",
        size === "sm" && "min-h-10 shrink-0 rounded-xl px-3.5 text-sm whitespace-nowrap",
        variant === "primary" &&
          "bg-brand-700 text-white shadow-cta hover:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none",
        variant === "secondary" &&
          "border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50 disabled:text-ink-soft disabled:opacity-60",
        variant === "soft" && "bg-brand-100 text-brand-800 hover:bg-brand-200 disabled:opacity-60",
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
        tone === "ok" && "font-medium text-brand-700",
        tone === "warn" && "font-medium text-blush-700",
      )}
    >
      {tone === "ok" && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

const fieldBase =
  "w-full rounded-[0.875rem] border border-line bg-white px-4 text-[1.05rem] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 aria-invalid:border-peach-700 aria-invalid:ring-peach-100";

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
      <div className="rounded-[0.875rem] border border-line bg-paper focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
        <textarea id={id} className="block w-full resize-none rounded-[0.875rem] bg-transparent px-4 pt-3.5 pb-1 text-base leading-relaxed text-ink outline-none placeholder:text-ink-soft/60" {...area} />
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
      className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-[0.875rem] border border-line/60 bg-ivory-deep p-1", className)}
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
              "min-h-11 rounded-[0.7rem] px-3 text-base transition",
              active ? "bg-white font-bold text-ink shadow-[0_1px_3px_rgba(40,52,61,0.1)]" : "font-medium text-ink-soft hover:text-ink",
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
              "inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-[0.95rem] transition",
              on
                ? "border-brand-700 bg-brand-700 font-bold text-white shadow-cta"
                : "border-line bg-white font-semibold text-ink hover:border-brand-200 hover:bg-brand-50",
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
              on ? "bg-brand-700 text-white shadow-sm" : "bg-white/75 text-brand-800 hover:bg-white",
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
        <span className="text-sm font-bold text-brand-700" aria-hidden>
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
              value === 0 ? "bg-brand-700 text-white" : "bg-ivory text-ink-soft hover:text-ink",
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
                  filled ? "bg-brand-700" : "bg-ivory-deep group-hover:bg-brand-200",
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
  /**
   * sage: 기본 강조(블루) · outline: 블루 테두리 · ivory: 중립 · warn: 피치(불편·확인 필요)
   * mint: 잘 맞았어요·완료 · butter: 먹기 어려웠어요 · sky: 처방약 · lavender: 일반약 · dashed: 원인 미확인·확인 필요(중립 점선)
   * 색만으로 뜻을 전하지 않도록 항상 텍스트(+아이콘)를 함께 씁니다.
   */
  tone?: "sage" | "outline" | "ivory" | "warn" | "mint" | "butter" | "sky" | "lavender" | "dashed";
  check?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap",
        tone === "sage" && "bg-brand-100 text-brand-800",
        tone === "outline" && "border border-brand-200 bg-white text-brand-800",
        tone === "ivory" && "bg-ivory-deep text-ink-soft",
        tone === "warn" && "bg-peach-100 text-peach-700",
        tone === "mint" && "bg-mint-100 text-mint-700",
        tone === "butter" && "bg-butter-100 text-butter-700",
        tone === "sky" && "bg-sky-100 text-sky-700",
        tone === "lavender" && "bg-lavender-100 text-lavender-700",
        tone === "dashed" && "border border-dashed border-ink-soft/50 bg-white text-ink-soft",
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
    <p aria-live="polite" className={cn("rounded-[0.875rem] border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800", className)}>
      {children}
    </p>
  );
}

/** 오류 안내 (스크린리더에 즉시 읽힘) */
export function Alert({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("rounded-[0.875rem] border border-peach-100 bg-peach-50 px-4 py-3 text-sm font-semibold text-peach-700", className)}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white bg-ivory p-4 shadow-[0_20px_60px_rgba(40,52,61,0.18)] sm:max-w-2xl sm:rounded-[1.5rem] sm:p-6"
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

/** 로그인 화면 장식 — v2에서는 새싹 대신 몽글(구름 마스코트). 호출부 호환을 위해 이름 유지 */
export function LeafIllustration({ className }: { className?: string }) {
  return <CloudMascot className={cn("object-contain", className)} />;
}

/** 켜기/끄기 스위치 (예: 보호자에게 공개, 의료진과 공유) */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-soft">{description}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-brand-700" : "bg-ivory-deep ring-1 ring-line")} aria-hidden>
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

/** 생활 요청 진행 단계 (접수 → 직원 확인 → 처리 완료) */
export function StatusSteps({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1.5" aria-label={`진행 상태: ${steps[idx]?.label ?? ""}`}>
      {steps.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "inline-flex min-h-7 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-full px-2 text-xs font-bold whitespace-nowrap",
                i === idx ? "bg-brand-700 text-white" : done ? "bg-brand-100 text-brand-800" : "bg-ivory-deep text-ink-soft",
              )}
              aria-current={i === idx ? "step" : undefined}
            >
              {done && i !== idx && <Check className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="truncate">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 오류·완료 안내를 잠시 보여 주는 작은 상태 줄 */
export function InlineStatus({ error, done }: { error?: string | null; done?: string | null }) {
  if (error) return <Alert className="mt-3">{error}</Alert>;
  if (done)
    return (
      <p className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-700" aria-live="polite">
        <Check className="h-4 w-4" aria-hidden /> {done}
      </p>
    );
  return null;
}
