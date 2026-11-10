/**
 * 개발·테스트용 가상 네트워크 조건 (데모 저장소 전용)
 *
 * DB 전환 시 생길 지연·실패를 localStorage 저장소에서 미리 재현하기 위한 설정입니다.
 * - NEXT_PUBLIC_CARELOG_FAKE_LATENCY_MS : 모든 쓰기에 지연(ms) 추가 (기본 0)
 * - 개발 서버(NODE_ENV !== "production")에서는 브라우저 localStorage로 덮어쓸 수 있습니다.
 *     localStorage.setItem("carelog.dev.latencyMs", "800")
 *     localStorage.setItem("carelog.dev.failWrites", "1")   // 모든 쓰기 실패
 *   프로덕션 빌드에서는 localStorage 값을 무시합니다.
 */
export interface DevFlags {
  latencyMs: number;
  failWrites: boolean;
}

export const DEV_FLAG_KEYS = {
  latencyMs: "carelog.dev.latencyMs",
  failWrites: "carelog.dev.failWrites",
} as const;

const MAX_LATENCY_MS = 10_000;

function clampLatency(v: number): number {
  return Number.isFinite(v) ? Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(v))) : 0;
}

export function readDevFlags(): DevFlags {
  let latencyMs = clampLatency(Number(process.env.NEXT_PUBLIC_CARELOG_FAKE_LATENCY_MS ?? 0));
  let failWrites = false;
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    try {
      const l = window.localStorage.getItem(DEV_FLAG_KEYS.latencyMs);
      if (l !== null) latencyMs = clampLatency(Number(l));
      failWrites = window.localStorage.getItem(DEV_FLAG_KEYS.failWrites) === "1";
    } catch {
      // 저장소 접근 불가 → 기본값
    }
  }
  return { latencyMs, failWrites };
}
