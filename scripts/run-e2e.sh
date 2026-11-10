#!/usr/bin/env bash
# Playwright 사용자 흐름 테스트 실행 (가상 데이터만 사용)
#   npm run test:e2e                 # 전체
#   npm run test:e2e -- -g "재입원"   # 일부만
# 환경변수: E2E_PORT (기본 3334) — 공유 서버에서 사용 중인 포트와 겹치지 않게 지정
set -euo pipefail
cd "$(dirname "$0")/.."

# 브라우저는 홈 디렉터리 캐시가 아니라 프로젝트 node_modules 안에 설치
export PLAYWRIGHT_BROWSERS_PATH=0
if ! ls -d node_modules/playwright-core/.local-browsers/chromium_headless_shell-* >/dev/null 2>&1; then
  npx playwright install chromium --only-shell
fi

LIB_DIR="$PWD/.e2e-libs/usr/lib/x86_64-linux-gnu"
export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}"
SHELL_BIN=$(ls -d node_modules/playwright-core/.local-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1 || true)
if [ -n "$SHELL_BIN" ] && ldd "$SHELL_BIN" 2>/dev/null | grep -q "not found"; then
  bash scripts/e2e-fetch-libs.sh
fi

exec npx playwright test "$@"
