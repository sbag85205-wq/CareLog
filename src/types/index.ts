/**
 * CareLog 도메인 타입 정의
 *
 * - 화면(컴포넌트)과 데이터 저장소(localStorage / 향후 Supabase)가 모두 이 타입을 공유합니다.
 * - 필드명은 향후 PostgreSQL 테이블 컬럼(snake_case)으로 1:1 매핑할 수 있도록 단순하게 유지합니다.
 * - 모든 레코드에는 isDemo 플래그가 있어 가상 데이터임을 명시합니다.
 */

/** 사용자 역할 (프로토타입에서는 상단 메뉴로 전환하는 데모 역할) */
export type Role = "patient" | "staff" | "guardian";

/** 환자 이용 모드 */
export type CareMode = "outpatient" | "inpatient";

/** 1~5 척도 */
export type Scale5 = 1 | 2 | 3 | 4 | 5;

/** 식사 섭취량 (%) */
export type MealIntake = 0 | 25 | 50 | 75 | 100;

/** 소화 상태 */
export type Digestion = "good" | "normal" | "bloated" | "heartburn" | "nausea" | "bowel";

/** 데모 사용자 계정 (실제 인증 아님) */
export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  /** 보호자의 경우 관계 (예: 자녀) */
  relation?: string;
  isDemo: true;
}

export interface Patient {
  id: string;
  /** 반드시 가상 이름 */
  name: string;
  birthYear: number;
  gender: "M" | "F";
  department: string;
  /**
   * 현재 이용 모드 — **환자 자기기록 모드**이며 병원의 공식 입원 확인이 아닙니다.
   * 입원 정보(병동·병실·입원일)는 Admission 이력에 있습니다.
   */
  careMode: CareMode;
  /** 다음 진료일 (YYYY-MM-DD) */
  nextVisitDate?: string;
  /** 담당 의료진 사용자 ID */
  assignedStaffIds: string[];
  /** 앱 내장 데모 시드 여부 (DB 모드의 가상 환자는 false) */
  isDemo: boolean;
}

/** 입원 기록 출처: 환자 자기기록 / (향후) 병원 확인 */
export type AdmissionSource = "self_reported" | "hospital_confirmed";

/**
 * 입원 이력 (향후 admissions 테이블).
 * 재입원은 항상 새 행이며, 과거 행은 삭제·수정하지 않고 퇴원일만 기록합니다.
 */
export interface Admission {
  id: string;
  patientId: string;
  ward: string;
  room: string;
  /** 입원일 (한국 날짜) */
  admittedOn: string;
  /** 퇴원일 (한국 날짜). 없으면 진행 중인 입원 */
  dischargedOn?: string;
  source: AdmissionSource;
  /** UTC ISO 8601 */
  createdAt: string;
  isDemo: boolean;
}

/** 하루 단위 건강기록. 통원/입원 모드와 무관하게 같은 환자 ID에 누적됩니다. */
export interface HealthRecord {
  id: string;
  patientId: string;
  /** 기록 날짜 (YYYY-MM-DD) — 환자·날짜당 1건 */
  date: string;
  condition: Scale5;
  /** 통증 0~10 */
  pain: number;
  fatigue: Scale5;
  sleep: Scale5;
  mealIntake: MealIntake;
  digestion: Digestion;
  symptoms: string[];
  memo: string;
  /** 기록 당시 이용 모드 (통원 → 입원 연속 조회용) */
  recordedIn: CareMode;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

/** 약품 정보 출처 — 향후 식약처 공공데이터 API 연동 시 "mfds" 사용 */
export type MedicationSource = "mock" | "mfds" | "manual";

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  purpose: string;
  dosage: string;
  schedule: string;
  caution: string;
  source: MedicationSource;
  /** 식약처 의약품 품목기준코드(itemSeq) — 실제 API 연동 시 사용 */
  externalItemSeq?: string;
  /** 보호자에게 공개 여부 */
  visibleToGuardian: boolean;
  /** DB 모드에서 마지막 수정 시각 (UTC ISO) */
  updatedAt?: string;
  isDemo: boolean;
}

export interface VisitQuestion {
  id: string;
  patientId: string;
  text: string;
  done: boolean;
  /** 담당 의료진에게 공유 (DB 모드, 기본 false) */
  sharedWithStaff?: boolean;
  createdAt: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealType = "regular" | "porridge" | "soft" | "liquid";

/** 입원 중 식사 기록 (환자·날짜·끼니당 1건) */
export interface MealLog {
  id: string;
  patientId: string;
  date: string;
  slot: MealSlot;
  mealType: MealType;
  intake?: MealIntake;
  digestion?: Digestion;
  updatedAt: string;
}

export type RequestCategory = "water" | "bedding" | "meal_change" | "other";
/** 접수 → 직원 확인 → 처리 완료 */
export type RequestStatus = "received" | "acknowledged" | "completed";

export interface LifeRequest {
  id: string;
  patientId: string;
  category: RequestCategory;
  detail: string;
  status: RequestStatus;
  /** 식사 변경 요청일 경우 대상 끼니와 희망 형태 */
  mealChange?: { date: string; slot: MealSlot; toType: MealType };
  createdAt: string;
  updatedAt: string;
  handledBy?: string;
  isDemo: boolean;
}

/** 의료진 후속 조치 (시연용) */
export type ReviewAction = "checked" | "consult_needed";

export interface StaffReview {
  id: string;
  patientId: string;
  staffId: string;
  action: ReviewAction;
  note: string;
  createdAt: string;
}

/** 접근 권한 범위 — 향후 Supabase RLS 정책으로 옮길 대상 */
export type AccessScope = "records" | "medications" | "meals" | "requests";

export interface AccessGrant {
  id: string;
  patientId: string;
  granteeUserId: string;
  role: Role;
  scopes: AccessScope[];
  approvedAt: string;
  /** 공유 철회 시각 (데모) */
  revokedAt?: string;
}

/**
 * 전체 데이터 스냅샷 (프로토타입 저장 단위)
 * - 모든 `*At` 필드(createdAt, updatedAt, approvedAt, seededAt)는 UTC ISO 8601 ("...Z")
 * - `date`, `admittedOn` 등 날짜 필드는 한국(Asia/Seoul) 기준 YYYY-MM-DD
 * - version 변경 이력은 src/lib/repository/migrate.ts 참조
 */
export interface CareLogData {
  version: number;
  seededAt: string;
  users: DemoUser[];
  patients: Patient[];
  admissions: Admission[];
  records: HealthRecord[];
  medications: Medication[];
  visitQuestions: VisitQuestion[];
  mealLogs: MealLog[];
  requests: LifeRequest[];
  reviews: StaffReview[];
  accessGrants: AccessGrant[];
}

/** 프로토타입 시연용 분류 (의료적 위험 판정 아님) */
export type TriageFlag = "review" | "insufficient" | "change" | "stable";

export interface PatientSummary {
  patient: Patient;
  /** 진행 중인 입원 (없으면 undefined) */
  admission?: Admission;
  recordDays30: number;
  avgCondition30: number | null;
  avgCondition7: number | null;
  avgConditionPrev: number | null;
  lastRecordDate: string | null;
  flags: TriageFlag[];
  openRequests: number;
  lastReview?: StaffReview;
}
