import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * DB 권한 테스트 (PGlite) — `npm run test:db`
 * supabase/migrations/*.sql 을 메모리 PostgreSQL에 적용하고 RLS·RPC를 검증합니다. Docker 불필요.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // PGlite(WASM)는 CPU를 많이 써서, 공유 서버에서는 파일을 순차 실행
    fileParallelism: false,
  },
});
