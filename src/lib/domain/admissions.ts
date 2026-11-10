/**
 * 통원·입원 모드 전환과 입원 이력 규칙 (향후 DB 함수 set_care_mode()와 동일하게 유지)
 *
 * - 입원 모드는 환자 자기기록 모드이며 병원의 공식 입원 확인이 아닙니다 (source = "self_reported").
 * - 입원으로 전환: 진행 중인 입원이 없으면 **새 입원 이력**을 만듭니다 (재입원도 항상 새 행).
 * - 통원으로 전환: 진행 중인 입원에 퇴원일만 기록합니다. 과거 이력·건강기록은 지우지 않습니다.
 */
import { CareLogError } from "@/lib/errors";
import { timestampValue } from "@/lib/date";
import type { Admission, CareLogData, CareMode } from "@/types";

export function admissionsOf(d: CareLogData, patientId: string): Admission[] {
  return d.admissions
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => a.admittedOn.localeCompare(b.admittedOn) || timestampValue(a.createdAt) - timestampValue(b.createdAt));
}

/** 진행 중인 입원 (퇴원일 없는 이력) */
export function currentAdmission(d: CareLogData, patientId: string): Admission | undefined {
  return d.admissions.find((a) => a.patientId === patientId && !a.dischargedOn);
}

export interface CareModeContext {
  /** 한국 날짜 */
  today: string;
  /** UTC ISO 8601 */
  now: string;
  /** 새 입원 이력 ID */
  admissionId: string;
  /** 새 입원 시 병동·병실 배정 (직전 병실을 넘겨줌) */
  assignRoom: (previousRoom: string | undefined) => { ward: string; room: string };
}

export function applyCareMode(d: CareLogData, patientId: string, mode: CareMode, ctx: CareModeContext): CareLogData {
  const patient = d.patients.find((p) => p.id === patientId);
  if (!patient) throw new CareLogError("not_found", "환자 정보를 찾을 수 없습니다.");

  const open = currentAdmission(d, patientId);
  let admissions = d.admissions;

  if (mode === "inpatient" && !open) {
    const previous = admissionsOf(d, patientId).at(-1);
    const { ward, room } = ctx.assignRoom(previous?.room);
    admissions = [
      ...admissions,
      {
        id: ctx.admissionId,
        patientId,
        ward,
        room,
        admittedOn: ctx.today,
        source: "self_reported",
        createdAt: ctx.now,
        isDemo: true,
      },
    ];
  }

  if (mode === "outpatient" && open) {
    const dischargedOn = ctx.today < open.admittedOn ? open.admittedOn : ctx.today;
    admissions = admissions.map((a) => (a.id === open.id ? { ...a, dischargedOn } : a));
  }

  if (admissions === d.admissions && patient.careMode === mode) return d;
  return {
    ...d,
    admissions,
    patients: d.patients.map((p) => (p.id === patientId ? { ...p, careMode: mode } : p)),
  };
}
