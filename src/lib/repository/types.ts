import type {
  CareLogData,
  CareMode,
  HealthRecord,
  LifeRequest,
  MealLog,
  RequestStatus,
  StaffReview,
  VisitQuestion,
} from "@/types";

/** 건강기록 입력값 (id·타임스탬프는 저장소가 채움) */
export type HealthRecordInput = Omit<HealthRecord, "id" | "createdAt" | "updatedAt" | "isDemo">;
export type LifeRequestInput = Pick<LifeRequest, "patientId" | "category" | "detail" | "mealChange">;
export type MealLogInput = Omit<MealLog, "id" | "updatedAt">;
export type StaffReviewInput = Omit<StaffReview, "id" | "createdAt">;

/**
 * 데이터 접근 계층 인터페이스.
 *
 * 화면은 이 인터페이스만 사용합니다. 현재는 localStorage 구현(local-storage.ts)을 쓰고,
 * 향후 Supabase 구현(supabase.ts)을 같은 인터페이스로 만들어 교체하면 됩니다.
 *
 * - 쓰기 메서드는 모두 Promise를 반환합니다 (네트워크 DB 교체 대비).
 * - 읽기는 getSnapshot()/subscribe()로 React의 useSyncExternalStore와 연결됩니다.
 *   Supabase 구현에서는 쿼리 결과를 캐시에 담아 같은 방식으로 노출하면 됩니다.
 */
export interface CareLogRepository {
  /** 클라이언트에서 데이터 스냅샷 반환 (서버 렌더링 시 null) */
  getSnapshot(): CareLogData | null;
  subscribe(listener: () => void): () => void;

  upsertHealthRecord(input: HealthRecordInput): Promise<HealthRecord>;
  setCareMode(patientId: string, mode: CareMode): Promise<void>;

  addVisitQuestion(patientId: string, text: string): Promise<VisitQuestion>;
  toggleVisitQuestion(id: string): Promise<void>;
  deleteVisitQuestion(id: string): Promise<void>;

  upsertMealLog(input: MealLogInput): Promise<MealLog>;

  createRequest(input: LifeRequestInput): Promise<LifeRequest>;
  updateRequestStatus(id: string, status: RequestStatus, staffId: string): Promise<void>;

  addStaffReview(input: StaffReviewInput): Promise<StaffReview>;

  /** 데모 데이터 초기화 */
  resetDemoData(): Promise<void>;
}
