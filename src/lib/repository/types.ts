import type {
  CareLogData,
  CareMode,
  Digestion,
  HealthRecord,
  LifeRequest,
  MealIntake,
  MealLog,
  MealSlot,
  RequestStatus,
  StaffReview,
  VisitQuestion,
} from "@/types";

/** 건강기록 입력값 (id·타임스탬프는 저장소가 채움) */
export type HealthRecordInput = Omit<HealthRecord, "id" | "createdAt" | "updatedAt" | "isDemo">;
export type LifeRequestInput = Pick<LifeRequest, "patientId" | "category" | "detail" | "mealChange">;
/**
 * 환자가 기록하는 식사 정보 — 넘긴 필드만 바뀝니다.
 * 식사 형태(mealType)는 환자가 직접 바꾸지 않고, 식사 변경 요청이 "처리 완료"될 때만 바뀝니다.
 */
export interface MealLogPatch {
  patientId: string;
  date: string;
  slot: MealSlot;
  intake?: MealIntake;
  digestion?: Digestion;
}
export type StaffReviewInput = Omit<StaffReview, "id" | "createdAt">;

/**
 * 데이터 접근 계층 인터페이스.
 *
 * 화면은 이 인터페이스만 사용합니다. 현재는 localStorage 구현(local-storage.ts)을 쓰고,
 * 향후 Supabase 구현을 같은 인터페이스로 만들어 교체합니다 (docs/supabase-migration-plan.md 5장).
 *
 * - 쓰기 메서드는 Promise를 반환하며 실패 시 CareLogError로 reject 됩니다. 호출 측은 반드시 오류를 처리하세요.
 * - 일부 쓰기(선택 버튼, 상태 변경 등)는 응답 전에 화면에 먼저 반영(낙관적 업데이트)되고, 실패하면 되돌려집니다.
 * - 읽기는 getSnapshot()/subscribe()로 React의 useSyncExternalStore와 연결됩니다.
 */
export interface CareLogRepository {
  /** 클라이언트에서 데이터 스냅샷 반환 (서버 렌더링 시 null) */
  getSnapshot(): CareLogData | null;
  subscribe(listener: () => void): () => void;

  upsertHealthRecord(input: HealthRecordInput): Promise<HealthRecord>;
  /** 환자 자기기록 모드 전환. 입원으로 바꾸면 새 입원 이력, 통원으로 바꾸면 진행 중인 입원에 퇴원일 기록 */
  setCareMode(patientId: string, mode: CareMode): Promise<void>;

  addVisitQuestion(patientId: string, text: string, prescriptionId?: string): Promise<VisitQuestion>;
  /** 질문 문장 수정 (수정 시각 기록) */
  updateVisitQuestion(id: string, text: string): Promise<void>;
  toggleVisitQuestion(id: string): Promise<void>;
  deleteVisitQuestion(id: string): Promise<void>;

  upsertMealLog(patch: MealLogPatch): Promise<MealLog>;

  createRequest(input: LifeRequestInput): Promise<LifeRequest>;
  /**
   * 요청 상태를 한 단계 진행합니다.
   * @param expected 화면에서 보고 있던 상태 — 실제 상태와 다르면(중복 클릭 등) 거부
   */
  updateRequestStatus(id: string, expected: RequestStatus, to: RequestStatus, staffId: string): Promise<void>;

  addStaffReview(input: StaffReviewInput): Promise<StaffReview>;

  /** 데모 데이터 초기화 (demo 전용 — DB 모드에서는 제공하지 않을 예정) */
  resetDemoData(): Promise<void>;
}
