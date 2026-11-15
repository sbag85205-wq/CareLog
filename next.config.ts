import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E는 별도 빌드 폴더 사용 → 사용자가 띄운 개발 서버(.next/dev/lock)와 충돌하지 않음
  distDir: process.env.CARELOG_NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // 홈 디렉터리의 다른 lockfile을 루트로 오인하지 않도록 프로젝트 폴더로 고정
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
