"use client";

import { HeartPulse, RotateCcw, ShieldAlert, Stethoscope, User, Users } from "lucide-react";
import { cn } from "@/components/ui/primitives";
import { ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@/types";

const ROLE_ICON = { patient: User, staff: Stethoscope, guardian: Users } as const;
const ROLES: Role[] = ["patient", "staff", "guardian"];

export function AppHeader({
  role,
  onRoleChange,
  onReset,
}: {
  role: Role;
  onRoleChange: (r: Role) => void;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="bg-violet-50 px-4 py-1.5 text-center text-xs font-medium text-violet-800 sm:text-sm">
        <ShieldAlert className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />
        프로토타입 · 화면의 모든 환자·약품·기록은 <strong>가상 데모 데이터</strong>이며 실제 의료정보가 아닙니다
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 text-white shadow-sm">
              <HeartPulse className="h-6 w-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <div className="text-xl font-extrabold tracking-tight text-slate-900">CareLog</div>
              <div className="text-xs font-medium text-slate-500">케어로그 · 통원·입원 건강기록</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:hidden"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            초기화
          </button>
        </div>

        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-700">데모 역할 전환 · 실제 로그인 아님</span>
            <button
              type="button"
              onClick={onReset}
              className="hidden items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:flex"
              title="가상 데이터를 처음 상태로 되돌립니다"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              데모 데이터 초기화
            </button>
          </div>
          <div role="tablist" aria-label="데모 역할 선택" className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
            {ROLES.map((r) => {
              const Icon = ROLE_ICON[r];
              const active = r === role;
              return (
                <button
                  key={r}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => onRoleChange(r)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    active ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {r === "staff" ? "의료진" : ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

export function NonEmergencyNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800", className)}>
      <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
      <p>
        <strong>CareLog는 응급 상황용 서비스가 아닙니다.</strong> 갑자기 상태가 나빠지거나 응급 상황이면 병상 호출벨,
        담당 의료진, 또는 119에 즉시 알리세요.
      </p>
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-28 pt-6 text-center text-xs leading-relaxed text-slate-400 md:pb-10">
      CareLog 프로토타입 · AX 액션러닝 개인 프로젝트
      <br />
      실제 로그인·접근제어·병원 시스템(EMR)·의약품 API가 연결되지 않은 시연용 화면입니다. 가상 데이터는 이 브라우저의
      localStorage에만 저장됩니다.
    </footer>
  );
}
