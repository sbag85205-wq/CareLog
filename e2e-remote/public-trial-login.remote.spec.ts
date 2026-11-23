/**
 * 공개 체험 사이트 로그인 한도 완화 (CARELOG_LOGIN_RATE_LIMIT) — 실제 DB, 임시 계정만
 * 이 파일만 따로, 완화 설정으로 띄운 서버에서 실행:
 *   CARELOG_LOGIN_RATE_LIMIT=300 E2E_REMOTE_SERVER=prod bash scripts/run-e2e.sh --config playwright.remote.config.ts e2e-remote/public-trial-login.remote.spec.ts
 * 계정별 실패 제한 규칙은 단위 테스트(src/server/patient-auth/login-guard.test.ts)에서 확인
 * ⚠️ Supabase Auth 자체에도 IP별 로그인 한도가 있어(서버 IP 기준) 너무 많이 시도하지 않음
 */
import { expect, test } from "@playwright/test";
import { cleanup, provisionPatient } from "./support";

test.afterAll(async () => {
  await cleanup();
});

test("완화 설정: 같은 IP(공용 와이파이)에서 기존 한도(20회)를 넘는 21번째 로그인도 성공", async ({ page, baseURL }) => {
  test.skip(!(Number(process.env.CARELOG_LOGIN_RATE_LIMIT) > 20), "CARELOG_LOGIN_RATE_LIMIT 를 20보다 크게 설정한 서버에서만");
  const v = await provisionPatient("공용 와이파이");
  for (let i = 0; i < 21; i++) {
    const r = await page.request.post("/api/patient-auth/login", {
      data: { loginId: v.loginId, password: v.password },
      headers: { Origin: baseURL!, "x-forwarded-for": "203.0.113.60" },
    });
    expect(r.status(), `방문자 ${i + 1}`).toBe(200);
  }
});
