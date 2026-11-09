/** 스냅샷에서 화면에 필요한 데이터를 뽑는 순수 함수들 (DB 쿼리로 대체될 부분) */
import { getMenu } from "@/data/mock-data";
import type { AccessScope, CareLogData, MealLog, MealSlot, Role } from "@/types";

export const recordsOf = (d: CareLogData, patientId: string) =>
  d.records.filter((r) => r.patientId === patientId).sort((a, b) => a.date.localeCompare(b.date));

export const recordOn = (d: CareLogData, patientId: string, date: string) =>
  d.records.find((r) => r.patientId === patientId && r.date === date);

export const patientById = (d: CareLogData, id: string) => d.patients.find((p) => p.id === id);

export const requestsOf = (d: CareLogData, patientId?: string) =>
  d.requests
    .filter((r) => !patientId || r.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const questionsOf = (d: CareLogData, patientId: string) =>
  d.visitQuestions.filter((q) => q.patientId === patientId);

/**
 * 약 목록. viewerRole이 guardian이면 보호자 공개 약만 반환.
 * (향후 Supabase RLS 정책으로 서버에서 강제해야 하는 규칙)
 */
export const medicationsOf = (d: CareLogData, patientId: string, viewerRole: Role = "patient") =>
  d.medications.filter(
    (m) => m.patientId === patientId && (viewerRole !== "guardian" || m.visibleToGuardian),
  );

export interface MealView {
  slot: MealSlot;
  log: MealLog | undefined;
  mealType: MealLog["mealType"];
  menu: string[];
  pendingChange: boolean;
}

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export function mealsOn(d: CareLogData, patientId: string, date: string): MealView[] {
  return SLOTS.map((slot) => {
    const log = d.mealLogs.find((m) => m.patientId === patientId && m.date === date && m.slot === slot);
    const mealType = log?.mealType ?? "regular";
    const pendingChange = d.requests.some(
      (r) =>
        r.patientId === patientId &&
        r.mealChange?.date === date &&
        r.mealChange.slot === slot &&
        r.status !== "completed",
    );
    return { slot, log, mealType, menu: getMenu(date, slot, mealType), pendingChange };
  });
}

/** 보호자 등 제3자의 접근 범위 조회 (데모용 — 실제 보안 아님) */
export function grantedScopes(d: CareLogData, userId: string, patientId: string): AccessScope[] {
  return d.accessGrants.find((g) => g.granteeUserId === userId && g.patientId === patientId)?.scopes ?? [];
}

export function grantedPatients(d: CareLogData, userId: string) {
  const ids = new Set(d.accessGrants.filter((g) => g.granteeUserId === userId).map((g) => g.patientId));
  return d.patients.filter((p) => ids.has(p.id));
}
