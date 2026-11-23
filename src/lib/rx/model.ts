/**
 * 처방 이력 — "지난 처방과 약을 먹고 느낀 점을 기록해, 다음 진료에서 바로 보여주는 앱"
 *
 * 처방(Prescription) 1건 = 처방일·진료과 + 그때 확인해 저장한 약(RxItem)들
 * 복용 경험(RxNote) = 환자 본인이 남긴 태그·메모 (처방 전체 또는 특정 약)
 * 기존 약 목록(medications)·건강기록은 그대로 두고, 처방 이력은 별도로 쌓습니다 (추가 방식).
 */

export interface Prescription {
  id: string;
  patientId: string;
  /** 처방일 (YYYY-MM-DD, 환자가 확인한 날짜) */
  prescribedOn: string;
  /** 진료과 (불명확하면 빈 값) */
  department: string;
  /** 의료기관 이름 (선택) */
  clinic: string;
  /** 처방전·복약 안내에서 가져온 공통 주의사항 */
  guidance: string;
  /** ★ 보관한 처방 */
  starred: boolean;
  /** 보호자 공유 (보호자의 '약 정보' 공유 범위가 있을 때만 보임) */
  visibleToGuardian: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RxItem {
  id: string;
  prescriptionId: string;
  patientId: string;
  name: string;
  strength: string;
  /** 1회 복용량 (예: 1회 1정) */
  dosage: string;
  /** 횟수 (예: 하루 3회) */
  frequency: string;
  /** 시점 (예: 식후 30분) */
  timing: string;
  /** 기간 (예: 5일분) */
  duration: string;
  /** 처방전·복약 안내에서 가져온 주의사항 */
  cautionRx: string;
  /** 식약처 제품 정보의 주의사항 (요약) */
  cautionMfds: string;
  externalItemSeq?: string;
  /** 지금 복용 중 */
  active: boolean;
  sort: number;
}

export interface RxNote {
  id: string;
  prescriptionId: string;
  patientId: string;
  /** null = 처방 전체 (함께 먹은 약 모두) */
  itemId: string | null;
  tags: string[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type RxItemInput = Omit<RxItem, "id" | "prescriptionId" | "patientId" | "sort">;

export interface NewPrescriptionInput {
  /** 같은 등록을 다시 보내도 한 건만 생기도록 하는 요청 ID (화면에서 1회 생성) */
  requestId: string;
  patientId: string;
  prescribedOn: string;
  department: string;
  clinic: string;
  guidance: string;
  items: RxItemInput[];
}

export interface RxSnapshot {
  prescriptions: Prescription[];
  items: RxItem[];
  notes: RxNote[];
  /** DB에 처방 이력 구조가 아직 없으면 false (기존 기능은 계속 동작) */
  available: boolean;
  message?: string;
}

/** 진료과 (선택지) — 처방전에 명확히 적혀 있으면 미리 채움 */
export const DEPARTMENTS = [
  "내과",
  "이비인후과",
  "정형외과",
  "피부과",
  "소아청소년과",
  "안과",
  "가정의학과",
  "신경과",
  "외과",
  "비뇨의학과",
  "산부인과",
  "정신건강의학과",
  "재활의학과",
  "치과",
] as const;

/** 복용 경험 태그 — 도움이 된 점과 불편했던 점을 한 처방에 함께 기록 */
export const EXPERIENCE_TAGS = {
  good: ["증상이 줄었어요", "복용하기 편했어요", "효과가 빨리 나타났어요"],
  bad: ["속쓰림", "졸림", "메스꺼움", "어지러움", "입이 말랐어요", "알약이 커서 삼키기 어려웠어요"],
} as const;

export const ALL_TAGS: string[] = [...EXPERIENCE_TAGS.good, ...EXPERIENCE_TAGS.bad];

/** "2026/9/1 처방 · 이비인후과 · 약 3개" */
export function prescriptionLabel(p: Prescription, itemCount: number): string {
  const [y, m, d] = p.prescribedOn.split("-").map(Number);
  return [`${y}/${m}/${d} 처방`, p.department || "진료과 미입력", `약 ${itemCount}개`].join(" · ");
}

/** 처방일 최신순 (같은 날이면 나중에 등록한 것 먼저) */
export function sortPrescriptions(list: Prescription[]): Prescription[] {
  return [...list].sort((a, b) => b.prescribedOn.localeCompare(a.prescribedOn) || b.createdAt.localeCompare(a.createdAt));
}

export interface RxFilter {
  department?: string;
  starredOnly?: boolean;
  /** 이 태그가 모두 들어간 복용 경험이 있는 처방 */
  tags?: string[];
}

export function filterPrescriptions(s: Pick<RxSnapshot, "prescriptions" | "notes">, f: RxFilter): Prescription[] {
  const tags = f.tags ?? [];
  return sortPrescriptions(s.prescriptions).filter((p) => {
    if (f.department && p.department !== f.department) return false;
    if (f.starredOnly && !p.starred) return false;
    if (tags.length) {
      const has = new Set(s.notes.filter((n) => n.prescriptionId === p.id).flatMap((n) => n.tags));
      if (!tags.every((t) => has.has(t))) return false;
    }
    return true;
  });
}

/** 이력에 실제로 쓰인 진료과·태그 (필터 선택지) */
export function usedDepartments(s: Pick<RxSnapshot, "prescriptions">): string[] {
  const set = new Set(s.prescriptions.map((p) => p.department).filter(Boolean));
  return [...DEPARTMENTS.filter((d) => set.has(d)), ...[...set].filter((d) => !(DEPARTMENTS as readonly string[]).includes(d)).sort()];
}

export function usedTags(s: Pick<RxSnapshot, "notes">, prescriptionIds?: Set<string>): string[] {
  const set = new Set(s.notes.filter((n) => !prescriptionIds || prescriptionIds.has(n.prescriptionId)).flatMap((n) => n.tags));
  return [...ALL_TAGS.filter((t) => set.has(t)), ...[...set].filter((t) => !ALL_TAGS.includes(t)).sort()];
}

export const itemsOf = (s: Pick<RxSnapshot, "items">, prescriptionId: string) =>
  s.items.filter((i) => i.prescriptionId === prescriptionId).sort((a, b) => a.sort - b.sort);

export const notesOf = (s: Pick<RxSnapshot, "notes">, prescriptionId: string) =>
  s.notes.filter((n) => n.prescriptionId === prescriptionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** 지금 복용 중 — 최신 처방의 약이 먼저 */
export function activeItems(s: Pick<RxSnapshot, "items" | "prescriptions">): { item: RxItem; prescription: Prescription }[] {
  const byId = new Map(s.prescriptions.map((p) => [p.id, p]));
  return s.items
    .filter((i) => i.active && byId.has(i.prescriptionId))
    .map((item) => ({ item, prescription: byId.get(item.prescriptionId)! }))
    .sort((a, b) => b.prescription.prescribedOn.localeCompare(a.prescription.prescribedOn) || a.item.sort - b.item.sort);
}

/** "5일분" + 처방일 → 마지막 복용일 (알 수 없으면 null) */
export function endDate(prescribedOn: string, duration: string): string | null {
  const m = duration.match(/(\d+)\s*일/);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(prescribedOn)) return null;
  const d = new Date(`${prescribedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(m[1]) - 1);
  return d.toISOString().slice(0, 10);
}

/** 화면 표시용 날짜 "2026/9/1" */
export function slashDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}/${m}/${d}`;
}

/** 한 환자의 처방만 (보호자가 여러 환자를 볼 때) */
export function forPatient(s: RxSnapshot, patientId: string): RxSnapshot {
  return {
    ...s,
    prescriptions: s.prescriptions.filter((p) => p.patientId === patientId),
    items: s.items.filter((i) => i.patientId === patientId),
    notes: s.notes.filter((n) => n.patientId === patientId),
  };
}
