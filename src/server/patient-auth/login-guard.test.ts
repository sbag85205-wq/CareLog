import { describe, expect, it } from "vitest";
import { ACCOUNT_FAIL_PER_IP, ACCOUNT_FAIL_TOTAL, createLoginGuard, DEFAULT_LOGIN_LIMIT, LOGIN_WINDOW_MS, readLoginLimit } from "./login-guard";

describe("로그인 제한 설정 (CARELOG_LOGIN_RATE_LIMIT)", () => {
  it("값이 없거나 잘못됐거나 기본보다 작으면 기존 20회 그대로 (완화만 가능)", () => {
    for (const v of [undefined, "", "abc", "0", "5", "20", "-1", "1.5", "1001"]) expect(readLoginLimit(v)).toBe(DEFAULT_LOGIN_LIMIT);
    expect(readLoginLimit("300")).toBe(300);
  });

  it("기본값(기존 carelog): IP당 20회, 계정별 실패 제한은 꺼져 있음 — 기존 동작과 같음", () => {
    const g = createLoginGuard(readLoginLimit(undefined));
    expect(g.accountLimits).toBe(false);
    for (let i = 0; i < 20; i++) expect(g.allowRequest("1.1.1.1")).toBe(true);
    expect(g.allowRequest("1.1.1.1")).toBe(false);
    expect(g.allowRequest("2.2.2.2")).toBe(true); // 다른 IP는 영향 없음
    for (let i = 0; i < 100; i++) g.recordFailure("1.1.1.1", "trial01");
    expect(g.accountBlocked("1.1.1.1", "trial01")).toBe(false);
  });
});

describe("공개 체험 사이트 (완화 + 계정별 실패 제한)", () => {
  it("공용 와이파이: 같은 IP에서 여러 명이 300번까지 로그인 요청 가능", () => {
    const g = createLoginGuard(300);
    expect(g.accountLimits).toBe(true);
    for (let i = 0; i < 300; i++) expect(g.allowRequest("203.0.113.5")).toBe(true);
    expect(g.allowRequest("203.0.113.5")).toBe(false);
  });

  it("같은 IP·같은 계정 15번 실패 → 그 IP의 그 계정만 잠시 거부, 다른 계정·다른 IP는 그대로", () => {
    const g = createLoginGuard(300);
    for (let i = 0; i < ACCOUNT_FAIL_PER_IP - 1; i++) g.recordFailure("203.0.113.5", "trial01");
    expect(g.accountBlocked("203.0.113.5", "trial01")).toBe(false);
    g.recordFailure("203.0.113.5", "TRIAL01"); // 대소문자 같은 계정으로
    expect(g.accountBlocked("203.0.113.5", "trial01")).toBe(true);
    expect(g.accountBlocked("203.0.113.5", "trial02")).toBe(false);
    expect(g.accountBlocked("198.51.100.9", "trial01")).toBe(false);
  });

  it("여러 IP에서 같은 계정을 합계 60번 실패 → 그 계정 잠시 거부 (분산 대입 방어)", () => {
    const g = createLoginGuard(300);
    for (let i = 0; i < ACCOUNT_FAIL_TOTAL; i++) g.recordFailure(`10.0.${Math.floor(i / 10)}.${i % 10}`, "patient01");
    expect(g.accountBlocked("10.9.9.9", "patient01")).toBe(true);
    expect(g.accountBlocked("10.9.9.9", "patient02")).toBe(false);
  });

  it("10분이 지나면 저절로 풀림 (영구 잠금 없음)", () => {
    let t = 0;
    const g = createLoginGuard(300, () => t);
    for (let i = 0; i < ACCOUNT_FAIL_PER_IP; i++) g.recordFailure("203.0.113.5", "trial01");
    expect(g.accountBlocked("203.0.113.5", "trial01")).toBe(true);
    t += LOGIN_WINDOW_MS + 1;
    expect(g.accountBlocked("203.0.113.5", "trial01")).toBe(false);
  });
});
