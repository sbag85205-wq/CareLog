/**
 * 의료진 대시보드 "검토 대상" 분류 — 개발 시연용 기준
 *
 * ⚠️ 의료적으로 검증된 위험 판정이 아닙니다. 응급 여부·진료 변경을 자동 결정하지 않으며,
 *    의료진이 기록을 직접 확인하도록 목록을 정렬·표시하는 용도로만 사용합니다.
 */
import { addDays, todayISO } from "@/lib/date";
import { currentAdmission } from "@/lib/domain/admissions";
import { reviewsOf } from "@/lib/selectors";
import type { CareLogData, HealthRecord, PatientSummary, TriageFlag } from "@/types";

export const TRIAGE_RULES = {
  /** 최근 30일 평균 컨디션이 이 값 이하이고 */
  reviewAvgMax: 2.0,
  /** 기록이 이 일수 이상이면 '검토 대상' */
  reviewMinDays: 10,
  /** 최근 30일 기록이 이 일수 미만이거나 최근 7일 기록이 3일 미만이면 '기록 부족' */
  insufficientDays30: 10,
  insufficientDays7: 3,
  /** 최근 7일 평균과 그 이전(8~30일) 평균의 차이가 이 값 이상이면 '변화 확인' */
  changeDelta: 1.5,
} as const;

const avg = (rs: HealthRecord[]) =>
  rs.length ? rs.reduce((s, r) => s + r.condition, 0) / rs.length : null;

export function summarizePatient(
  d: CareLogData,
  patientId: string,
  today: string = todayISO(),
): PatientSummary {
  const patient = d.patients.find((p) => p.id === patientId)!;
  const from30 = addDays(today, -29);
  const from7 = addDays(today, -6);
  const recs = d.records.filter((r) => r.patientId === patientId);
  const last30 = recs.filter((r) => r.date >= from30 && r.date <= today);
  const last7 = last30.filter((r) => r.date >= from7);
  const prev = last30.filter((r) => r.date < from7);

  const avg30 = avg(last30);
  const avg7 = avg(last7);
  const avgPrev = avg(prev);

  const flags: TriageFlag[] = [];
  if (avg30 !== null && avg30 <= TRIAGE_RULES.reviewAvgMax && last30.length >= TRIAGE_RULES.reviewMinDays) {
    flags.push("review");
  }
  if (last30.length < TRIAGE_RULES.insufficientDays30 || last7.length < TRIAGE_RULES.insufficientDays7) {
    flags.push("insufficient");
  }
  if (avg7 !== null && avgPrev !== null && last7.length >= 2 && Math.abs(avg7 - avgPrev) >= TRIAGE_RULES.changeDelta) {
    flags.push("change");
  }
  if (flags.length === 0) flags.push("stable");

  const lastRecordDate = recs.reduce<string | null>((m, r) => (!m || r.date > m ? r.date : m), null);

  return {
    patient,
    admission: currentAdmission(d, patientId),
    recordDays30: last30.length,
    avgCondition30: avg30,
    avgCondition7: avg7,
    avgConditionPrev: avgPrev,
    lastRecordDate,
    flags,
    openRequests: d.requests.filter((r) => r.patientId === patientId && r.status !== "completed").length,
    lastReview: reviewsOf(d, patientId)[0],
  };
}

const FLAG_PRIORITY: Record<TriageFlag, number> = { review: 0, change: 1, insufficient: 2, stable: 3 };

export function summarizeAll(d: CareLogData, staffId: string): PatientSummary[] {
  return d.patients
    .filter((p) => p.assignedStaffIds.includes(staffId))
    .map((p) => summarizePatient(d, p.id))
    .sort((a, b) => Math.min(...a.flags.map((f) => FLAG_PRIORITY[f])) - Math.min(...b.flags.map((f) => FLAG_PRIORITY[f])));
}
