import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3334);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** 존재하지 않는 가짜 프로젝트 주소 (E2E 전용) */
export const E2E_FAKE_SUPABASE_URL = "https://e2efakeprojectrefxyz.supabase.co";

/**
 * 사용자 흐름 테스트 — `npm run test:e2e` (scripts/run-e2e.sh)로 실행하세요.
 * 개발 서버를 직접 띄우고 끝나면 종료합니다. 이미 사용 중인 포트면 실패하므로 E2E_PORT로 바꾸세요.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // 공유 서버 부하를 줄이고 개발 서버 하나를 순서대로 사용
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // 제목에 [PC]가 붙은 테스트는 PC 화면에서만, 나머지는 모바일 화면에서 실행
  projects: [
    { name: "mobile", grepInvert: /\[PC\]/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", grep: /\[PC\]/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT} -H 127.0.0.1`,
    // E2E는 실제 Supabase에 절대 접속하지 않도록 가짜 설정으로 덮어씀 (프로세스 환경변수가 .env.local보다 우선)
    env: {
      ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>),
      NEXT_PUBLIC_SUPABASE_URL: E2E_FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-fake-publishable-key-not-real-0000",
      SUPABASE_SECRET_KEY: "e2e-fake-secret-key-not-real-000000000",
      SUPABASE_ACCESS_TOKEN: "",
      CARELOG_NEXT_DIST_DIR: ".next-e2e",
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
