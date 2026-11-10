#!/usr/bin/env bash
# root 권한 없이 Chromium(headless shell)에 필요한 라이브러리를 .e2e-libs/ 에 풀어 둡니다.
# Ubuntu 24.04(noble) 기준 패키지명. 시스템에는 아무것도 설치하지 않습니다.
# 시스템 라이브러리가 이미 있는 환경(일반 PC, CI 이미지)에서는 실행되지 않습니다.
set -euo pipefail
cd "$(dirname "$0")/.."

PKGS=(libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1 libasound2t64 libatspi2.0-0t64)
if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get이 없어 Chromium 라이브러리를 자동으로 받을 수 없습니다. 'npx playwright install-deps chromium'을 참고하세요." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Chromium 실행용 라이브러리 다운로드: ${PKGS[*]}"
(cd "$TMP" && apt-get download "${PKGS[@]}" >/dev/null)
mkdir -p .e2e-libs
for deb in "$TMP"/*.deb; do dpkg -x "$deb" .e2e-libs; done
echo "완료: .e2e-libs/"
