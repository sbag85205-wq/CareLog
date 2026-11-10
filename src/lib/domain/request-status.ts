/**
 * 생활 요청 상태 전이 규칙 — 접수 → 직원 확인 → 처리 완료 (한 방향, 한 단계씩)
 *
 * 화면·localStorage 저장소가 모두 이 함수를 사용합니다.
 * Supabase 전환 시 같은 규칙을 DB 함수 `advance_request_status()`에서 다시 강제해야 합니다
 * (클라이언트 검증만으로는 우회 가능). docs/supabase-migration-plan.md 4.4 참조.
 */
import { REQUEST_STATUS_LABEL } from "@/lib/labels";
import type { RequestStatus } from "@/types";

/** 각 상태에서 허용되는 다음 상태 (없으면 종료 상태) */
export const NEXT_REQUEST_STATUS: Record<RequestStatus, RequestStatus | null> = {
  received: "acknowledged",
  acknowledged: "completed",
  completed: null,
};

export function nextRequestStatus(current: RequestStatus): RequestStatus | null {
  return NEXT_REQUEST_STATUS[current];
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: "invalid_transition" | "stale_state"; message: string };

/**
 * @param current  저장소에 있는 실제 현재 상태
 * @param expected 화면이 보고 있던 상태 (버튼을 누른 시점)
 * @param to       바꾸려는 상태
 */
export function checkRequestTransition(
  current: RequestStatus,
  expected: RequestStatus,
  to: RequestStatus,
): TransitionCheck {
  if (NEXT_REQUEST_STATUS[expected] !== to) {
    return {
      ok: false,
      code: "invalid_transition",
      message: `'${REQUEST_STATUS_LABEL[expected]}' 상태에서 '${REQUEST_STATUS_LABEL[to]}'(으)로 바꿀 수 없습니다.`,
    };
  }
  if (current !== expected) {
    return {
      ok: false,
      code: "stale_state",
      message: `이미 '${REQUEST_STATUS_LABEL[current]}' 상태로 변경된 요청입니다. 화면을 확인해 주세요.`,
    };
  }
  return { ok: true };
}
