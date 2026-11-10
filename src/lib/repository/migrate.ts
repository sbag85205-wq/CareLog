/**
 * localStorage에 저장된 이전 버전 데이터를 현재 형식으로 변환합니다.
 *
 * - v1 (최초 프로토타입): 시각 형식 혼재, 입원 정보가 Patient.ward/room/admissionDate에 있음
 * - v2: 모든 시각 UTC ISO 8601, 입원 이력은 admissions 배열
 *
 * 사용자가 입력한 가상 기록(컨디션 기록, 요청 등)은 버리지 않고 그대로 옮깁니다.
 * 해석할 수 없는 데이터일 때만 null을 반환하고, 그때는 호출 측이 새 데모 데이터로 시작합니다.
 */
import { normalizeTimestamp, todayISO } from "@/lib/date";
import type { Admission, CareLogData, Patient } from "@/types";

export const DATA_VERSION = 2;

type Json = Record<string, unknown>;

interface PatientV1 extends Patient {
  ward?: string;
  room?: string;
  admissionDate?: string;
}

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function normalizeFields<T>(items: unknown, fields: string[]): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isObject).map((item) => {
    const copy: Json = { ...item };
    for (const f of fields) {
      if (typeof copy[f] === "string") copy[f] = normalizeTimestamp(copy[f] as string);
    }
    return copy as unknown as T;
  });
}

function migrateV1toV2(v1: Json, today: string): CareLogData {
  const patientsV1 = (Array.isArray(v1.patients) ? v1.patients : []) as PatientV1[];
  const migratedAt = new Date().toISOString();

  const admissions: Admission[] = patientsV1
    .filter((p) => p.admissionDate)
    .map((p) => ({
      id: `AD-${p.id}-${p.admissionDate}`,
      patientId: p.id,
      ward: p.ward ?? "데모병동 7층",
      room: p.room ?? "701호",
      admittedOn: p.admissionDate!,
      // v1에는 퇴원일이 없었으므로, 통원 상태였던 환자는 마이그레이션 시점에 퇴원한 것으로 기록
      dischargedOn: p.careMode === "inpatient" ? undefined : today,
      source: "self_reported",
      createdAt: migratedAt,
      isDemo: true,
    }));

  // v1 입원 필드는 admissions로 옮겼으므로 환자 객체에서 제거
  const patients: Patient[] = patientsV1.map((p) => {
    const copy: Partial<PatientV1> = { ...p };
    delete copy.ward;
    delete copy.room;
    delete copy.admissionDate;
    return copy as Patient;
  });

  return {
    version: 2,
    seededAt: typeof v1.seededAt === "string" ? normalizeTimestamp(v1.seededAt) : migratedAt,
    users: (v1.users ?? []) as CareLogData["users"],
    patients,
    admissions,
    records: normalizeFields(v1.records, ["createdAt", "updatedAt"]),
    medications: (v1.medications ?? []) as CareLogData["medications"],
    visitQuestions: normalizeFields(v1.visitQuestions, ["createdAt"]),
    mealLogs: normalizeFields(v1.mealLogs, ["updatedAt"]),
    requests: normalizeFields(v1.requests, ["createdAt", "updatedAt"]),
    reviews: normalizeFields(v1.reviews, ["createdAt"]),
    accessGrants: normalizeFields(v1.accessGrants, ["approvedAt"]),
  };
}

export function migrateData(raw: unknown, today: string = todayISO()): CareLogData | null {
  if (!isObject(raw) || !Array.isArray(raw.patients) || !Array.isArray(raw.records)) return null;
  if (raw.version === DATA_VERSION) return raw as unknown as CareLogData;
  if (raw.version === 1) return migrateV1toV2(raw, today);
  return null;
}
