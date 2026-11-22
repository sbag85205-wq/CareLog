import type {
  AccessScope,
  CareMode,
  Digestion,
  MealIntake,
  MealSlot,
  MealType,
  RequestCategory,
  RequestStatus,
  Role,
  TriageFlag,
} from "@/types";

export const ROLE_LABEL: Record<Role, string> = {
  patient: "환자",
  staff: "간호사·의료진",
  guardian: "보호자",
};

export const MODE_LABEL: Record<CareMode, string> = {
  outpatient: "통원",
  inpatient: "입원",
};

export const DIGESTION_LABEL: Record<Digestion, string> = {
  good: "좋음",
  normal: "보통",
  bloated: "더부룩함",
  heartburn: "속쓰림",
  nausea: "메스꺼움",
  bowel: "설사·변비",
};

export const MEAL_INTAKE_OPTIONS: { value: MealIntake; label: string }[] = [
  { value: 0, label: "안 먹음" },
  { value: 25, label: "조금" },
  { value: 50, label: "절반" },
  { value: 75, label: "대부분" },
  { value: 100, label: "전부" },
];

export const MEAL_INTAKE_LABEL: Record<MealIntake, string> = Object.fromEntries(
  MEAL_INTAKE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<MealIntake, string>;

export const SYMPTOM_OPTIONS = [
  "두통",
  "어지러움",
  "메스꺼움",
  "기침",
  "숨참",
  "부종",
  "변비",
  "설사",
  "식욕 저하",
  "불면",
  "가려움",
  "관절 통증",
];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
};

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  regular: "일반식",
  porridge: "죽",
  soft: "연식(부드러운 식사)",
  liquid: "유동식",
};

export const REQUEST_CATEGORY_LABEL: Record<RequestCategory, string> = {
  water: "물 요청",
  bedding: "침구 교체",
  meal_change: "식사 변경",
  other: "기타 요청",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  received: "접수",
  acknowledged: "직원 확인",
  completed: "처리 완료",
};

export const REQUEST_STATUS_ORDER: RequestStatus[] = ["received", "acknowledged", "completed"];

export const TRIAGE_LABEL: Record<TriageFlag, string> = {
  review: "검토 대상",
  insufficient: "기록 부족",
  change: "변화 확인",
  stable: "특이사항 없음",
};

export const SCOPE_LABEL: Record<AccessScope, string> = {
  records: "건강기록",
  medications: "약 정보",
  meals: "입원 식사",
  requests: "생활 요청",
};

export const CONDITION_FACE = ["", "매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"];
export const FATIGUE_LABEL = ["", "거의 없음", "조금", "보통", "많음", "매우 많음"];
export const SLEEP_LABEL = ["", "매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"];

/** 병실 표시: "302" → "302호", 이미 "703호"면 그대로 */
export function roomLabel(room: string): string {
  return /호$/.test(room.trim()) ? room.trim() : `${room.trim()}호`;
}
