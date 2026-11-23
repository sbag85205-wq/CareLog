/**
 * FeelPill(가칭) 약 기록 — "그때 먹었던 약, 나한테 어땠더라?"
 *
 * 등록 묶음(Prescription) 1건 = 처방전 한 장 또는 일반약 구매·등록 한 번 (kind 로 구분)
 *   - 처방: 처방일·진료과·의료기관 + 그때 받은 약(RxItem)들
 *   - 일반약: 구매·등록일 + 제품(RxItem) — 등록했다고 '복용'으로 보지 않음 (복용은 복용 경험·복용 체크로 따로)
 * 복용 경험(RxNote) = 사용자가 직접 남긴 태그·메모 (등록 묶음 전체 또는 특정 약)
 *   - 원본 메모(memo)와 자동 정리(suggestedTags·summary)를 따로 저장 — 자동 정리는 원본을 덮어쓰지 않음
 * 복용 체크(RxIntake) = 사용자가 '먹었어요'라고 남긴 기록 (체크 없음 ≠ 안 먹음)
 * 선택 공유(RxShare) = 고른 기록 1건을 고른 사람에게, 고른 항목만, 정한 기간 동안
 *
 * 기존 약 목록(medications)·건강기록은 그대로 두고, 이 기록은 별도로 쌓습니다 (추가 방식).
 */

export type RecordKind = "prescription" | "otc";
export type RecordSource = "prescription" | "otc_box" | "receipt" | "search" | "manual";

export interface Prescription {
  id: string;
  patientId: string;
  /** 처방: 처방전·일반약 구분 (예전 데이터는 처방) */
  kind: RecordKind;
  /** 어떻게 등록했는지 (처방전 사진·일반약 상자·약국 영수증·직접 검색) */
  source: RecordSource;
  /** 처방일 또는 일반약 구매·등록일 (YYYY-MM-DD, 사용자가 확인한 날짜) */
  prescribedOn: string;
  /** 진료과 (처방만, 불명확하면 빈 값) */
  department: string;
  /** 의료기관 또는 약국 이름 (선택) */
  clinic: string;
  /** 처방전·복약 안내에서 가져온 공통 주의사항 */
  guidance: string;
  /** ★ 보관 */
  starred: boolean;
  /** (이전 Preview) 보호자 공유 표시 — 새 버전은 선택 공유(RxShare)를 사용, 값은 보존 */
  visibleToGuardian: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 전문/일반 의약품 (식약처 제품 정보 기준, 모르면 빈 값) */
export type DrugClass = "" | "otc" | "rx";
/** 약 종류 분류 근거 */
export type CategorySource = "mfds" | "ingredient" | "user" | "none";
export type IntakeSlot = "morning" | "noon" | "evening" | "bedtime";

export interface RxItem {
  id: string;
  prescriptionId: string;
  patientId: string;
  /** 제품명 */
  name: string;
  /** 함량 (예: 500mg) */
  strength: string;
  /** 성분 (식약처 제품 정보의 주성분) */
  ingredients: string;
  /** 제약회사 */
  company: string;
  drugClass: DrugClass;
  /** 식약처 약효 분류 원문 (예: "114 해열·진통·소염제") */
  mfdsClass: string;
  /** 사용자용 약 종류 (여러 개 가능, categories.ts) */
  categories: string[];
  categorySource: CategorySource;
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
  /** 식약처 품목기준코드 — 같은 제품인지 판단하는 유일한 기준 (이름이 비슷해도 합치지 않음) */
  externalItemSeq?: string;
  /** 보험코드 (처방전에 명확히 적힌 경우) */
  ediCode?: string;
  /** 지금 복용 중 (사용자가 표시) */
  active: boolean;
  /** ★ 보관한 약 */
  starred: boolean;
  /** 반복 복용 일정 (정기 복용 약) — 비어 있으면 '필요할 때' */
  scheduleSlots: IntakeSlot[];
  sort: number;
}

export interface RxNote {
  id: string;
  prescriptionId: string;
  patientId: string;
  /** null = 등록 묶음 전체 (함께 먹은 약 모두 — 어느 약 때문인지 모를 때) */
  itemId: string | null;
  /** 복용한 날 (사용자가 고름, 모르면 null) */
  takenOn: string | null;
  /** 사용자가 확인한 태그 */
  tags: string[];
  /** 사용자가 쓴 원본 메모 — 자동 정리가 덮어쓰지 않음 */
  memo: string;
  /** 자동 제안 태그 (제안 당시 원본, 사용자가 고친 결과는 tags) */
  suggestedTags: string[];
  /** 자동 정리 요약 (사용자가 고칠 수 있음) */
  summary: string;
  /** 자동 정리 방식: 규칙 기반 · 외부 AI · 없음 */
  summarySource: "" | "rule" | "ai";
  createdAt: string;
  updatedAt: string;
}

export interface RxIntake {
  id: string;
  patientId: string;
  itemId: string;
  takenOn: string;
  /** 정해진 시간대 또는 필요할 때(prn) */
  slot: IntakeSlot | "prn";
  createdAt: string;
}

/** 공유할 수 있는 항목 — 제품명·등록일은 항상 보임 */
export type ShareField = "ingredients" | "strength" | "howto" | "experience" | "department";
export type Relation = "family" | "partner" | "friend" | "guardian";

export interface RxShare {
  id: string;
  patientId: string;
  prescriptionId: string;
  /** 공유받는 사람 (승인된 공유 관계의 사용자) */
  granteeId: string;
  fields: ShareField[];
  /** 공유 기간 끝 (null = 철회할 때까지) */
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** 공유받은 사람에게 보이는 기록 한 건 — 허용한 항목만 들어 있음 (없는 항목은 아예 없음) */
export interface SharedRecord {
  shareId: string;
  patientId: string;
  kind: RecordKind;
  date: string;
  fields: ShareField[];
  expiresAt: string | null;
  department?: string;
  clinic?: string;
  items: {
    name: string;
    ingredients?: string;
    strength?: string;
    howto?: string;
    categories: string[];
  }[];
  notes?: { target: string; takenOn: string | null; tags: string[]; memo: string; createdAt: string }[];
}

export type RxItemInput = Omit<
  RxItem,
  | "id"
  | "prescriptionId"
  | "patientId"
  | "sort"
  | "starred"
  | "scheduleSlots"
  | "ingredients"
  | "company"
  | "drugClass"
  | "mfdsClass"
  | "categories"
  | "categorySource"
> &
  Partial<Pick<RxItem, "ingredients" | "company" | "drugClass" | "mfdsClass" | "categories" | "categorySource" | "scheduleSlots">>;

export interface NewPrescriptionInput {
  /** 같은 등록을 다시 보내도 한 건만 생기도록 하는 요청 ID (화면에서 1회 생성) */
  requestId: string;
  patientId: string;
  kind?: RecordKind;
  source?: RecordSource;
  prescribedOn: string;
  department: string;
  clinic: string;
  guidance: string;
  items: RxItemInput[];
}

export type NoteInput = Pick<RxNote, "prescriptionId" | "patientId" | "itemId" | "tags" | "memo"> &
  Partial<Pick<RxNote, "takenOn" | "suggestedTags" | "summary" | "summarySource">>;
export type NotePatch = Pick<RxNote, "itemId" | "tags" | "memo"> & Partial<Pick<RxNote, "takenOn" | "summary" | "suggestedTags" | "summarySource">>;

export interface RxSnapshot {
  prescriptions: Prescription[];
  items: RxItem[];
  notes: RxNote[];
  intakes: RxIntake[];
  shares: RxShare[];
  /** 공유 관계별 관계 이름 (granteeId → 가족·연인·친구·보호자) */
  relations: Record<string, Relation>;
  /** 내가 공유받은 기록 (공유받는 사람 화면) */
  shared: SharedRecord[];
  /** DB에 약 기록 구조가 아직 없으면 false (기존 기능은 계속 동작) */
  available: boolean;
  message?: string;
}

export const emptyRx = (over: Partial<RxSnapshot> = {}): RxSnapshot => ({
  prescriptions: [],
  items: [],
  notes: [],
  intakes: [],
  shares: [],
  relations: {},
  shared: [],
  available: true,
  ...over,
});

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

/* ───────────── 복용 경험 태그 ───────────── */

export type TagGroup = "good" | "after" | "process" | "note";

/** 기타 태그는 묶음마다 이름이 달라야 검색·통계가 섞이지 않음 (화면에는 "기타"로 표시) */
export const EXPERIENCE_TAGS = {
  good: ["증상 완화를 느꼈어요", "복용하기 편했어요", "불편함이 없었어요", "기타 좋은 점"],
  after: ["속쓰림", "졸림", "메스꺼움", "어지러움", "두통", "기타 불편함"],
  process: ["알약이 너무 커요", "맛이 불편해요", "복용 횟수가 번거로워요", "삼키기 어려워요", "기타 복용 불편"],
  note: ["원인 미확인"],
} as const satisfies Record<TagGroup, readonly string[]>;

export const TAG_GROUP_LABEL: Record<TagGroup, string> = {
  good: "도움이 된 점",
  after: "복용 후 느낀 불편함",
  process: "복용 과정의 불편함",
  note: "메모 표시",
};

/** 이전 Preview 에서 쓰던 태그 — 그대로 보이고 검색되며, 묶음만 새 기준으로 */
const LEGACY_TAG_GROUP: Record<string, TagGroup> = {
  "증상이 줄었어요": "good",
  "효과가 빨리 나타났어요": "good",
  "입이 말랐어요": "after",
  "알약이 커서 삼키기 어려웠어요": "process",
};

export const ALL_TAGS: string[] = [...EXPERIENCE_TAGS.good, ...EXPERIENCE_TAGS.after, ...EXPERIENCE_TAGS.process, ...EXPERIENCE_TAGS.note];

export function tagGroup(tag: string): TagGroup | null {
  for (const g of Object.keys(EXPERIENCE_TAGS) as TagGroup[]) if ((EXPERIENCE_TAGS[g] as readonly string[]).includes(tag)) return g;
  return LEGACY_TAG_GROUP[tag] ?? null;
}

/** 화면 표시 이름 ("기타 불편함" → "기타") */
export const tagLabel = (tag: string) => (tag.startsWith("기타 ") ? "기타" : tag);
export const isDiscomfortTag = (tag: string) => {
  const g = tagGroup(tag);
  return g === "after" || g === "process";
};

/* ───────────── 표시 ───────────── */

/** "2026/9/1 처방 · 이비인후과 · 약 3개" / "2026/9/1 일반약 · 약국 · 1개" */
export function prescriptionLabel(p: Prescription, itemCount: number): string {
  const [y, m, d] = p.prescribedOn.split("-").map(Number);
  if (p.kind === "otc") return [`${y}/${m}/${d} 일반약`, p.clinic || SOURCE_LABEL[p.source], `제품 ${itemCount}개`].join(" · ");
  return [`${y}/${m}/${d} 처방`, p.department || "진료과 미입력", `약 ${itemCount}개`].join(" · ");
}

export const SOURCE_LABEL: Record<RecordSource, string> = {
  prescription: "처방전",
  otc_box: "일반약 상자",
  receipt: "약국 영수증",
  search: "직접 검색",
  manual: "직접 입력",
};

export const KIND_LABEL: Record<RecordKind, string> = { prescription: "처방", otc: "일반약" };
export const SLOT_LABEL: Record<IntakeSlot | "prn", string> = { morning: "아침", noon: "점심", evening: "저녁", bedtime: "자기 전", prn: "필요할 때" };
export const SLOTS: IntakeSlot[] = ["morning", "noon", "evening", "bedtime"];
export const RELATION_LABEL: Record<Relation, string> = { family: "가족", partner: "연인", friend: "친구", guardian: "보호자" };
export const SHARE_FIELD_LABEL: Record<ShareField, string> = {
  ingredients: "성분",
  strength: "함량",
  howto: "복용 방법·기간",
  experience: "복용 경험 (태그·메모)",
  department: "진료과·병원 (처방)",
};
/** 공유 기본값: 제품명 + 복용 경험만 (처방 진료과·성분 등은 직접 켜야 보임) */
export const DEFAULT_SHARE_FIELDS: ShareField[] = ["experience"];

/** 등록일 최신순 (같은 날이면 나중에 등록한 것 먼저) */
export function sortPrescriptions(list: Prescription[]): Prescription[] {
  return [...list].sort((a, b) => b.prescribedOn.localeCompare(a.prescribedOn) || b.createdAt.localeCompare(a.createdAt));
}

/* ───────────── 찾기 (AI 호출 없이 저장된 태그·분류만 사용) ───────────── */

export type UseState = "all" | "current" | "past";

export interface RxFilter {
  department?: string;
  starredOnly?: boolean;
  /** 이 태그가 모두 들어간 복용 경험이 있는 기록 */
  tags?: string[];
  /** 약 종류 (categories.ts id) */
  category?: string;
  /** "2026-09" — 그 달에 등록한 기록 */
  month?: string;
  /** 제품명·성분 일부 */
  query?: string;
  kind?: RecordKind;
  use?: UseState;
}

const normQ = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function itemMatches(i: RxItem, f: RxFilter, notesForItem: () => RxNote[]): boolean {
  if (f.category && !i.categories.includes(f.category)) return false;
  if (f.query && !normQ(`${i.name}${i.ingredients}`).includes(normQ(f.query))) return false;
  if (f.use === "current" && !i.active) return false;
  if (f.use === "past" && i.active) return false;
  if (f.tags?.length) {
    const has = new Set(notesForItem().flatMap((n) => n.tags));
    if (!f.tags.every((t) => has.has(t))) return false;
  }
  return true;
}

/** 약 한 개 + 그 약이 속한 등록 묶음 */
export interface ItemRow {
  item: RxItem;
  prescription: Prescription;
}

/** 이 약에 해당하는 복용 경험: 그 약에 남긴 것 + 같은 묶음 전체에 남긴 것 */
export const notesForItem = (s: Pick<RxSnapshot, "notes">, item: RxItem) =>
  s.notes.filter((n) => n.prescriptionId === item.prescriptionId && (n.itemId === item.id || n.itemId === null));

/** 약 단위 찾기 — 날짜·진료과·약 종류·복용 경험 태그·★·제품명을 함께 */
export function filterItems(s: Pick<RxSnapshot, "prescriptions" | "items" | "notes">, f: RxFilter): ItemRow[] {
  const byId = new Map(s.prescriptions.map((p) => [p.id, p]));
  return s.items
    .filter((i) => byId.has(i.prescriptionId))
    .map((item) => ({ item, prescription: byId.get(item.prescriptionId)! }))
    .filter(({ item, prescription: p }) => {
      if (f.department && p.department !== f.department) return false;
      if (f.kind && p.kind !== f.kind) return false;
      if (f.month && !p.prescribedOn.startsWith(f.month)) return false;
      if (f.starredOnly && !(item.starred || p.starred)) return false;
      return itemMatches(item, f, () => notesForItem(s, item));
    })
    .sort(
      (a, b) =>
        b.prescription.prescribedOn.localeCompare(a.prescription.prescribedOn) ||
        b.prescription.createdAt.localeCompare(a.prescription.createdAt) ||
        a.item.sort - b.item.sort,
    );
}

/** 등록 묶음(처방·일반약) 단위 찾기 — 묶음 안의 약 하나라도 조건에 맞으면 */
export function filterPrescriptions(s: Pick<RxSnapshot, "prescriptions" | "notes"> & Partial<Pick<RxSnapshot, "items">>, f: RxFilter): Prescription[] {
  const tags = f.tags ?? [];
  const itemLevel = Boolean(f.category || f.query || (f.use && f.use !== "all"));
  return sortPrescriptions(s.prescriptions).filter((p) => {
    if (f.department && p.department !== f.department) return false;
    if (f.kind && p.kind !== f.kind) return false;
    if (f.month && !p.prescribedOn.startsWith(f.month)) return false;
    const items = (s.items ?? []).filter((i) => i.prescriptionId === p.id);
    if (f.starredOnly && !p.starred && !items.some((i) => i.starred)) return false;
    if (tags.length) {
      const has = new Set(s.notes.filter((n) => n.prescriptionId === p.id).flatMap((n) => n.tags));
      if (!tags.every((t) => has.has(t))) return false;
    }
    if (itemLevel && !items.some((i) => itemMatches(i, { ...f, tags: [] }, () => []))) return false;
    return true;
  });
}

/** 이력에 실제로 쓰인 진료과·태그·달 (필터 선택지) */
export function usedDepartments(s: Pick<RxSnapshot, "prescriptions">): string[] {
  const set = new Set(s.prescriptions.map((p) => p.department).filter(Boolean));
  return [...DEPARTMENTS.filter((d) => set.has(d)), ...[...set].filter((d) => !(DEPARTMENTS as readonly string[]).includes(d)).sort()];
}

export function usedTags(s: Pick<RxSnapshot, "notes">, prescriptionIds?: Set<string>): string[] {
  const set = new Set(s.notes.filter((n) => !prescriptionIds || prescriptionIds.has(n.prescriptionId)).flatMap((n) => n.tags));
  return [...ALL_TAGS.filter((t) => set.has(t)), ...[...set].filter((t) => !ALL_TAGS.includes(t)).sort()];
}

export function usedMonths(s: Pick<RxSnapshot, "prescriptions">): string[] {
  return [...new Set(s.prescriptions.map((p) => p.prescribedOn.slice(0, 7)))].sort().reverse();
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${y}년 ${m}월`;
};

export const itemsOf = (s: Pick<RxSnapshot, "items">, prescriptionId: string) =>
  s.items.filter((i) => i.prescriptionId === prescriptionId).sort((a, b) => a.sort - b.sort);

export const notesOf = (s: Pick<RxSnapshot, "notes">, prescriptionId: string) =>
  s.notes.filter((n) => n.prescriptionId === prescriptionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** 지금 복용 중 — 최신 등록의 약이 먼저 */
export function activeItems(s: Pick<RxSnapshot, "items" | "prescriptions">): ItemRow[] {
  const byId = new Map(s.prescriptions.map((p) => [p.id, p]));
  return s.items
    .filter((i) => i.active && byId.has(i.prescriptionId))
    .map((item) => ({ item, prescription: byId.get(item.prescriptionId)! }))
    .sort((a, b) => b.prescription.prescribedOn.localeCompare(a.prescription.prescribedOn) || a.item.sort - b.item.sort);
}

/* ───────────── 같은 제품 묶기 ───────────── */

/**
 * 같은 제품 판단 기준: 식약처 품목기준코드가 같을 때만.
 * 이름이 같거나 비슷해도, 함량이 같아도 코드가 없으면 합치지 않음 (다른 제품·다른 함량을 섞지 않기 위해)
 */
export const productKey = (i: Pick<RxItem, "externalItemSeq" | "id">) => (i.externalItemSeq ? `seq:${i.externalItemSeq}` : `item:${i.id}`);

/** 이 약과 같은 제품으로 확인된 모든 등록 (최신순) */
export function sameProduct(s: Pick<RxSnapshot, "items" | "prescriptions">, item: RxItem): ItemRow[] {
  const key = productKey(item);
  const byId = new Map(s.prescriptions.map((p) => [p.id, p]));
  return s.items
    .filter((i) => productKey(i) === key && byId.has(i.prescriptionId))
    .map((i) => ({ item: i, prescription: byId.get(i.prescriptionId)! }))
    .sort((a, b) => b.prescription.prescribedOn.localeCompare(a.prescription.prescribedOn));
}

/** 제품별 복용 경험 (날짜별 누적) — 그 약에 직접 남긴 것 + 함께 먹은 약 전체에 남긴 것(구분 표시) */
export function productTimeline(s: Pick<RxSnapshot, "items" | "prescriptions" | "notes">, item: RxItem) {
  return sameProduct(s, item)
    .flatMap(({ item: it, prescription }) => notesForItem(s, it).map((note) => ({ note, item: it, prescription, wholeRecord: note.itemId === null })))
    .sort((a, b) => noteDate(b.note).localeCompare(noteDate(a.note)) || b.note.createdAt.localeCompare(a.note.createdAt));
}

/** 경험 날짜: 복용한 날(없으면 작성일) */
export const noteDate = (n: Pick<RxNote, "takenOn" | "createdAt">) => n.takenOn ?? n.createdAt.slice(0, 10);

/* ───────────── 날짜 ───────────── */

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

/** 진료용 표기 "2026.09.01" */
export const dotDate = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

/**
 * 진료 때 보여 줄 경험 한 문장 — 사용자의 기록임을 밝히고 원인을 단정하지 않음
 * 예: "2026.09.01 처방받은 약들을 복용한 날 속쓰림을 경험했다고 기록함. 원인 약물은 확인되지 않음."
 */
export function experienceSentence(p: Prescription, n: RxNote, itemName?: string): string {
  const subject = itemName
    ? `${itemName}${josa(itemName, "을", "를")}`
    : p.kind === "otc"
      ? `${dotDate(p.prescribedOn)} 등록한 일반약을`
      : `${dotDate(p.prescribedOn)} 처방받은 약들을`;
  const day = n.takenOn ? `(${dotDate(n.takenOn)})` : itemName ? `(${dotDate(p.prescribedOn)} 등록분)` : "";
  const head = `${subject} 복용한 날${day}`;
  const bad = n.tags.filter(isDiscomfortTag).map(tagLabel);
  const good = n.tags.filter((t) => tagGroup(t) === "good").map(tagLabel);
  const parts: string[] = [];
  if (bad.length) {
    const w = bad.join("·");
    parts.push(`${head} ${w}${josa(w, "을", "를")} 경험했다고 기록함.`);
  }
  if (good.length) parts.push(`${bad.length ? "" : `${head} `}'${good.join("·")}'라고 기록함.`);
  if (!parts.length) parts.push(`${head}에 대한 메모를 남김.`);
  if (bad.length) parts.push(itemName ? "약과의 관련성은 확인되지 않음." : "원인 약물은 확인되지 않음.");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** 방법·수단 조사: 받침 없음·ㄹ받침 → '로', 그 밖의 받침 → '으로' (처방전으로 · 일반약 상자로 · 직접 입력으로) */
export function euro(word: string): string {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "로";
  const fin = code % 28;
  return fin === 0 || fin === 8 ? "로" : "으로";
}

/** 받침에 따라 을/를 등 (한글이 아니면 뒤 형태) */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return /[0-9LMNlmn]$/.test(ch) ? withFinal : withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}

/** 한 환자의 기록만 (공유받은 사람이 여러 명을 볼 때) */
export function forPatient(s: RxSnapshot, patientId: string): RxSnapshot {
  return {
    ...s,
    prescriptions: s.prescriptions.filter((p) => p.patientId === patientId),
    items: s.items.filter((i) => i.patientId === patientId),
    notes: s.notes.filter((n) => n.patientId === patientId),
    intakes: s.intakes.filter((x) => x.patientId === patientId),
    shares: s.shares.filter((x) => x.patientId === patientId),
    shared: s.shared.filter((x) => x.patientId === patientId),
  };
}

/** 활성 공유인가 (철회 안 됨 · 기간 안) */
export const shareActive = (sh: Pick<RxShare, "revokedAt" | "expiresAt">, nowIso: string) => !sh.revokedAt && (!sh.expiresAt || sh.expiresAt > nowIso);

/** 복용 방법 한 줄: 1회 1정 · 하루 3회 · 식후 30분 */
export function howToTake(i: Pick<RxItem, "dosage" | "frequency" | "timing">): string {
  return [i.dosage, i.frequency, i.timing].filter(Boolean).join(" · ") || "복용 방법 미입력";
}

/**
 * 공유받는 사람에게 보낼 기록 — 허용한 항목만 담음 (DB 함수 shared_records_for_me 와 같은 규칙)
 * 공개 데모 저장소와 테스트에서 사용
 */
export function buildSharedRecord(s: Pick<RxSnapshot, "prescriptions" | "items" | "notes">, sh: RxShare): SharedRecord | null {
  const p = s.prescriptions.find((x) => x.id === sh.prescriptionId && x.patientId === sh.patientId);
  if (!p) return null;
  const items = itemsOf(s, p.id);
  const f = new Set(sh.fields);
  return {
    shareId: sh.id,
    patientId: p.patientId,
    kind: p.kind,
    date: p.prescribedOn,
    fields: sh.fields,
    expiresAt: sh.expiresAt,
    ...(f.has("department") && { department: p.department, clinic: p.clinic }),
    items: items.map((i) => ({
      name: i.name,
      categories: i.categories,
      ...(f.has("ingredients") && { ingredients: i.ingredients }),
      ...(f.has("strength") && { strength: i.strength }),
      ...(f.has("howto") && { howto: [i.dosage, i.frequency, i.timing, i.duration].filter(Boolean).join(" · ") }),
    })),
    ...(f.has("experience") && {
      notes: notesOf(s, p.id).map((n) => ({
        target: items.find((i) => i.id === n.itemId)?.name ?? (p.kind === "otc" ? "이 등록 전체" : "처방 전체"),
        takenOn: n.takenOn,
        tags: n.tags,
        memo: n.memo,
        createdAt: n.createdAt,
      })),
    }),
  };
}
