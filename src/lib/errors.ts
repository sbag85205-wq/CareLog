/** 데이터 계층에서 발생하는 사용자 안내용 오류 */
export type CareLogErrorCode =
  | "invalid_transition" // 허용되지 않는 상태 변경 (예: 처리 완료 → 접수)
  | "stale_state" // 다른 사람이 먼저 변경함 / 중복 클릭
  | "not_found"
  | "invalid_input"
  | "write_failed" // 저장 실패 (네트워크 등)
  | "cancelled" // 데모 초기화 등으로 취소됨
  | "forbidden" // 권한 없음 (DB 모드: RLS 거부)
  | "not_supported"; // DB 모드에서 아직 연결하지 않은 기능

export class CareLogError extends Error {
  constructor(
    public readonly code: CareLogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CareLogError";
  }
}

export function toUserMessage(e: unknown): string {
  if (e instanceof CareLogError) return e.message;
  return "알 수 없는 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
