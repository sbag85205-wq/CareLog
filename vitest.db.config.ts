import { defineConfig } from "vitest/config";

/**
 * DB 권한 테스트 (PGlite) — `npm run test:db`
 * supabase/migrations/*.sql 을 메모리 PostgreSQL에 적용하고 RLS·RPC를 검증합니다. Docker 불필요.
 */
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
