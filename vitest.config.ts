import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // 한국 시간 처리 검증: 테스트 머신 시간대와 무관하게 동작해야 하므로 UTC로 고정해 실행
    env: { TZ: "UTC" },
  },
});
