/**
 * 로그인 요청 제한 — 환경변수로 공개 체험 사이트(carelog-public)에서만 IP 한도를 완화
 *
 * CARELOG_LOGIN_RATE_LIMIT (10분, 같은 IP의 로그인 요청 수)
 *   - 없거나 잘못된 값: 기본 20 (기존 carelog 그대로 — 계정별 실패 제한도 켜지지 않음)
 *   - 21~1000: 공용 와이파이처럼 여러 사람이 같은 IP를 쓰는 경우를 위해 완화
 *     → 완화할 때는 계정별 비밀번호 실패 제한을 함께 켬 (무작위 대입 방어)
 *        · 같은 IP + 같은 계정: 10분에 15번 실패하면 그 IP에서 그 계정만 잠시 거부 (다른 방문자·다른 계정은 영향 없음)
 *        · 같은 계정(모든 IP 합계): 10분에 60번 실패하면 그 계정 잠시 거부
 *        · 성공한 로그인은 실패 횟수에 들어가지 않음, 10분 지나면 저절로 풀림
 * 서버 메모리 기준(인스턴스별) — DB 잠금이 아니므로 계정이 영구히 잠기지 않음
 */
import { createRateLimiter, type RateLimiter } from "./rate-limit";

export const DEFAULT_LOGIN_LIMIT = 20;
export const LOGIN_WINDOW_MS = 10 * 60_000;
export const ACCOUNT_FAIL_PER_IP = 15;
export const ACCOUNT_FAIL_TOTAL = 60;

/** 완화만 허용: 기본값보다 작거나 숫자가 아니면 기본값 */
export function readLoginLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > DEFAULT_LOGIN_LIMIT && n <= 1000 ? n : DEFAULT_LOGIN_LIMIT;
}

export interface LoginGuard {
  /** 이 IP에서 로그인 요청을 받아도 되는지 (세어 둠) */
  allowRequest(ip: string): boolean;
  /** 이 계정(이 IP 포함)이 실패가 많아 잠시 막혀 있는지 */
  accountBlocked(ip: string, account: string): boolean;
  /** 비밀번호 실패를 기록 */
  recordFailure(ip: string, account: string): void;
  readonly ipLimit: number;
  readonly accountLimits: boolean;
}

export function createLoginGuard(ipLimit: number, now: () => number = Date.now): LoginGuard {
  const ip: RateLimiter = createRateLimiter(ipLimit, LOGIN_WINDOW_MS, now);
  const relaxed = ipLimit > DEFAULT_LOGIN_LIMIT;
  const perIp = relaxed ? createRateLimiter(ACCOUNT_FAIL_PER_IP, LOGIN_WINDOW_MS, now) : null;
  const total = relaxed ? createRateLimiter(ACCOUNT_FAIL_TOTAL, LOGIN_WINDOW_MS, now) : null;
  const acct = (a: string) => a.trim().toLowerCase();
  return {
    ipLimit,
    accountLimits: relaxed,
    allowRequest: (addr) => ip.hit(addr),
    accountBlocked: (addr, a) => Boolean(perIp?.exceeded(`${addr}|${acct(a)}`) || total?.exceeded(acct(a))),
    recordFailure(addr, a) {
      perIp?.hit(`${addr}|${acct(a)}`);
      total?.hit(acct(a));
    },
  };
}
