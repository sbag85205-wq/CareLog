/**
 * 요청 횟수 제한 (IP 등 키 단위, 고정 시간창, 메모리)
 *
 * DB의 코드별 잠금(5회 실패 → 15분)과 함께 쓰는 1차 방어선입니다.
 * 존재하지 않는 코드로 무작위 대입하는 경우처럼 코드별 잠금이 걸리지 않는 시도를 막습니다.
 * ⚠️ 서버 인스턴스 1개 기준 (재시작 시 초기화). 여러 인스턴스 배포 시에는 공유 저장소로 교체 필요.
 */
export interface RateLimiter {
  /** 허용되면 true, 한도를 넘으면 false */
  hit(key: string): boolean;
  /** 세지 않고 확인만: 이미 한도에 도달했으면 true */
  exceeded(key: string): boolean;
}

export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const t = now();
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      }
      const b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      b.count += 1;
      return b.count <= max;
    },
    exceeded(key) {
      const b = buckets.get(key);
      return Boolean(b && b.resetAt > now() && b.count >= max);
    },
  };
}

/** 응답 시간을 일정 이상으로 맞춰, 처리 경로(코드 존재 여부 등)에 따른 시간 차이를 줄임 */
export async function withMinDuration<T>(ms: number, task: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await task();
  } finally {
    const left = ms - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }
}
