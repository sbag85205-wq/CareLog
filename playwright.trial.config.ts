import { defineConfig, devices } from "@playwright/test";
import { E2E_FAKE_SUPABASE_URL } from "./playwright.config";

/**
 * 공개 체험 사이트 화면 (로컬, 가짜 Supabase · 네트워크는 테스트에서 가로챔)
 *   bash scripts/run-e2e.sh --config playwright.trial.config.ts
 * NEXT_PUBLIC_CARELOG_TRIAL_NOTICE=1 로 띄움 — 기본 E2E(체험 표시 없음)와 서버를 나눔
 */
const PORT = Number(process.env.E2E_TRIAL_PORT ?? 3336);
export default defineConfig({
  testDir: "e2e-trial",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "ko-KR", timezoneId: "Asia/Seoul", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", grepInvert: /\[PC\]/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", grep: /\[PC\]/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT} -H 127.0.0.1`,
    env: {
      ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>),
      NEXT_PUBLIC_SUPABASE_URL: E2E_FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-fake-publishable-key-not-real-0000",
      SUPABASE_SECRET_KEY: "e2e-fake-secret-key-not-real-000000000",
      SUPABASE_ACCESS_TOKEN: "",
      NEXT_PUBLIC_CARELOG_TRIAL_NOTICE: "1",
      CARELOG_NEXT_DIST_DIR: ".next-e2e-trial", // 기본 E2E(.next-e2e)와 캐시를 나눔 — 체험 표시 값이 섞이지 않게
    },
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
