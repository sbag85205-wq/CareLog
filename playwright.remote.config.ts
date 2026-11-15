import { defineConfig, devices } from "@playwright/test";

/**
 * 원격(carelog-dev) 실제 연동 검증 — `npm run test:e2e:remote`
 *
 * - .env.local 값을 이 프로세스 메모리로만 읽음 (출력하지 않음)
 * - 앱 URL이 SUPABASE_PROJECT_REF(carelog-dev)와 다르면 실행하지 않음
 * - 검증용 가상 환자를 만들고 끝나면 삭제 (e2e-remote/*.spec.ts)
 * - 입력값이 남지 않도록 trace·스크린샷·영상 끔
 */
process.loadEnvFile(".env.local");
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
if (!/^[a-z]{20}$/.test(ref) || process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL 이 SUPABASE_PROJECT_REF(carelog-dev)와 일치하지 않아 원격 검증을 실행하지 않습니다.");
}
if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(".env.local 에 Publishable key / Secret key 가 필요합니다.");
}

const PORT = Number(process.env.E2E_REMOTE_PORT ?? 3335);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e-remote",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "remote", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: `npx next dev -p ${PORT} -H 127.0.0.1`,
    env: {
      ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>),
      CARELOG_NEXT_DIST_DIR: ".next-remote", // 사용자가 띄우는 개발 서버(.next)와 분리
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
