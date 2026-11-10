import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3334);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
