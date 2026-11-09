"use client";

import { AlertTriangle, Clock, Database, Pill } from "lucide-react";
import { Badge, Card, DemoBadge, EmptyState, SectionTitle } from "@/components/ui/primitives";
import type { Medication } from "@/types";

export function MedicationList({
  medications,
  compact = false,
  title = "내 약 정보",
  subtitle,
}: {
  medications: Medication[];
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <SectionTitle icon={Pill} title={title} subtitle={subtitle ?? `등록된 약 ${medications.length}개`} action={<DemoBadge />} />
      {medications.length === 0 ? (
        <EmptyState>표시할 약 정보가 없습니다.</EmptyState>
      ) : (
        <ul className={compact ? "space-y-2" : "grid gap-3 md:grid-cols-2"}>
          {medications.map((m) => (
            <li key={m.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-slate-900">{m.name}</div>
                  <div className="text-sm text-slate-600">{m.purpose}</div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                  <Pill className="h-5 w-5" aria-hidden />
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Clock className="h-4 w-4 text-teal-600" aria-hidden />
                {m.dosage} · {m.schedule}
              </div>
              {!compact && (
                <>
                  <p className="mt-2 flex gap-1.5 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {m.caution}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="slate" icon={Database}>
                      {m.source === "mock" ? "가상 약품 · 식약처 API 연동 예정" : "식약처 공공데이터"}
                    </Badge>
                    {!m.visibleToGuardian && <Badge tone="amber">보호자 비공개</Badge>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <p className="mt-4 text-xs text-slate-500">
          약 정보는 시연용 예시 문구입니다. 실제 복용법은 반드시 의사·약사의 안내를 따르세요.
        </p>
      )}
    </Card>
  );
}
