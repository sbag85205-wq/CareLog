#!/usr/bin/env bash
# ============================================================================
# CareLog — 원격(개발용) Supabase 안전 래퍼 (Supabase CLI 3.1.0 기준)
#
#   bash scripts/supabase-remote.sh <명령>
#
#   check-env       .env.local 권한·형식, CLI 버전 확인 (원격 접속 없음)
#   project         Management API로 이 REF 한 개만 조회 → 이름 carelog-dev·리전 ap-northeast-2 확인
#                   (계정의 다른 프로젝트 목록은 조회하지 않음)
#   link            project 확인 후 supabase link (토큰 인증, 비밀번호 인자 없음)
#   status          원격 migration 이력 (migration list --remote)
#   preflight       적용 전 읽기 전용 점검 (supabase/verify/00_preflight_readonly.sql)
#   dry-run         db push --remote --dry-run (실제 적용 안 함)
#   verify-catalog  적용 후 읽기 전용 점검 (supabase/verify/10_post_apply_catalog_readonly.sql)
#   advisors        Supabase 보안 점검 (db advisors --remote --type security, 읽기 전용)
#   auth-config     Auth 설정 중 이메일 확인 관련 값만 읽기 전용 조회 (전체 설정은 출력하지 않음)
#
# 의도적으로 제공하지 않는 명령: 실제 적용(db push), db reset, db query 쓰기
#   → 원격 적용은 별도 승인 후 사람이 직접 실행 (supabase/README.md 4단계)
#
# 비밀값 보호
#   * 토큰·비밀번호를 명령줄 인자로 넘기지 않음 (공유 서버에서 ps로 다른 사용자에게 보임)
#   * .env.local 은 source 하지 않고 허용된 키 2개만 읽음, 값은 출력하지 않음
#   * CLI 출력에 토큰·접속 문자열 비밀번호가 섞여 나오면 *** 로 가림
#   * 프로젝트 REF도 출력에서 <REF> 로 가림 (보고서·로그에 노출하지 않음)
# ============================================================================
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."

readonly ENV_FILE=".env.local"
readonly REQUIRED_CLI_VERSION="3.1.0"
readonly EXPECTED_PROJECT_NAME="${CARELOG_EXPECTED_PROJECT_NAME:-carelog-dev}"
readonly EXPECTED_REGION="${CARELOG_EXPECTED_REGION:-ap-northeast-2}"
readonly MGMT_API="https://api.supabase.com/v1"

die() { echo "중단: $*" >&2; exit 1; }
info() { echo "▶ $*"; }

# CLI 출력에서 비밀값 가리기 (토큰은 환경변수로 전달 — 명령줄에 노출되지 않음)
mask() {
  perl -pe 'BEGIN { $t = $ENV{SUPABASE_ACCESS_TOKEN} // ""; $r = $ENV{SUPABASE_PROJECT_REF} // "" }
            s/\Q$t\E/***/g if length $t;
            s/\Q$r\E/<REF>/g if length $r;
            s#(postgres(?:ql)?://[^:/\s]+:)[^@\s]+@#${1}***@#g;
            s/(sbp_)[A-Za-z0-9]+/${1}***/g;'
}

supa() { npx --no-install supabase "$@" 2>&1 | mask; }

load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE 이 없습니다. supabase/README.md 의 '0. 사용자가 준비할 것'을 먼저 진행하세요."
  [ ! -L "$ENV_FILE" ] || die "$ENV_FILE 이 심볼릭 링크입니다."
  local perm owner
  perm=$(stat -c %a "$ENV_FILE"); owner=$(stat -c %U "$ENV_FILE")
  [ "$owner" = "$(id -un)" ] || die "$ENV_FILE 소유자가 현재 사용자가 아닙니다 ($owner)."
  [ "$perm" = "600" ] || [ "$perm" = "400" ] || die "$ENV_FILE 권한이 $perm 입니다. 'chmod 600 $ENV_FILE' 후 다시 실행하세요."

  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      SUPABASE_ACCESS_TOKEN=*|SUPABASE_PROJECT_REF=*)
        key="${line%%=*}"; val="${line#*=}"
        val="${val#\"}"; val="${val%\"}"; val="${val#\'}"; val="${val%\'}"
        export "$key=$val" ;;
    esac
  done < "$ENV_FILE"

  [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "SUPABASE_ACCESS_TOKEN 이 비어 있습니다."
  [[ "${SUPABASE_ACCESS_TOKEN}" == sbp_* ]] || die "SUPABASE_ACCESS_TOKEN 형식이 개인 액세스 토큰(sbp_…)이 아닙니다."
  [[ "${SUPABASE_PROJECT_REF:-}" =~ ^[a-z]{20}$ ]] || die "SUPABASE_PROJECT_REF 형식을 확인하세요 (영문 소문자 20자)."
  # DB 비밀번호는 이 래퍼에서 사용하지 않음 (토큰 인증). 환경에 있더라도 하위 명령에 넘기지 않음
  unset SUPABASE_DB_PASSWORD PGPASSWORD || true
}

check_cli() {
  local v
  v=$(npx --no-install supabase --version 2>/dev/null | tr -d '[:space:]') || die "Supabase CLI를 찾을 수 없습니다 (npm install)."
  [ "$v" = "$REQUIRED_CLI_VERSION" ] || die "Supabase CLI $v — 이 절차는 $REQUIRED_CLI_VERSION 기준으로 검증되었습니다. package.json 버전을 확인하세요."
}

check_migrations() {
  local f count=0
  for f in supabase/migrations/*; do
    [[ "$(basename "$f")" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || die "migrations 폴더에 규칙에 맞지 않는 파일: $f"
    [ -s "$f" ] || die "빈 migration 파일: $f"
    count=$((count + 1))
  done
  info "migration 파일 ${count}개 확인 (비어 있는 파일·테스트 파일 없음)"
}

# Management API GET /v1/projects/{ref} — 토큰은 환경변수로만 node에 전달 (명령줄 노출 없음)
mgmt_get() {
  CARELOG_API_PATH="$1" CARELOG_MGMT_API="$MGMT_API" node -e '
    const url = `${process.env.CARELOG_MGMT_API}${process.env.CARELOG_API_PATH.replace("{ref}", process.env.SUPABASE_PROJECT_REF)}`;
    fetch(url, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, Accept: "application/json" } })
      .then(async (r) => {
        const body = await r.text();
        if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(r.status === 401 || r.status === 403 ? 3 : r.status === 404 ? 4 : 5); }
        process.stdout.write(body);
      })
      .catch((e) => { console.error(`네트워크 오류: ${e.cause?.code ?? e.message}`); process.exit(6); });'
}

verify_project() {
  info "대상 프로젝트 확인 (기대: ${EXPECTED_PROJECT_NAME}, ${EXPECTED_REGION})"
  local json rc=0
  json=$(mgmt_get "/projects/{ref}" 2> >(mask >&2)) || rc=$?
  case $rc in
    0) ;;
    3) die "인증 실패 또는 권한 부족 (HTTP 401/403) — 토큰이 유효한지, 만료되지 않았는지 확인하세요." ;;
    4) die "REF에 해당하는 프로젝트가 없습니다 (HTTP 404) — .env.local 의 SUPABASE_PROJECT_REF 를 확인하세요." ;;
    *) die "프로젝트 정보 조회 실패 (코드 $rc)" ;;
  esac
  printf '%s' "$json" | EXP_NAME="$EXPECTED_PROJECT_NAME" EXP_REGION="$EXPECTED_REGION" node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      let p; try { p = JSON.parse(s); } catch { console.error("응답 해석 실패"); process.exit(2); }
      const ok = p.name === process.env.EXP_NAME && p.region === process.env.EXP_REGION;
      console.log(`▶ 프로젝트 이름: ${p.name} / 리전: ${p.region} / 상태: ${p.status ?? "?"} / Postgres: ${p.database?.version ?? "?"}`);
      if (p.name !== process.env.EXP_NAME) console.error(`중단: 프로젝트 이름이 ${process.env.EXP_NAME} 이 아닙니다.`);
      if (p.region !== process.env.EXP_REGION) console.error(`중단: 리전이 ${process.env.EXP_REGION} 이 아닙니다.`);
      if (p.status && p.status !== "ACTIVE_HEALTHY") console.error(`주의: 프로젝트 상태가 ${p.status} 입니다.`);
      process.exit(ok ? 0 : 1);
    });' | mask || die "대상 프로젝트가 기대값과 다릅니다. 다른 프로젝트일 수 있으므로 진행하지 않습니다."
  info "확인됨: ${EXPECTED_PROJECT_NAME} (${EXPECTED_REGION})"
}

assert_linked() {
  local linked=""
  [ -f supabase/.temp/project-ref ] && linked=$(tr -d '[:space:]' < supabase/.temp/project-ref)
  if [ -z "$linked" ]; then die "아직 연결되지 않았습니다. 먼저 'link'를 실행하세요."; fi
  [ "$linked" = "$SUPABASE_PROJECT_REF" ] || die "연결된 프로젝트가 .env.local 의 REF와 다릅니다. 'link'를 다시 실행하세요."
}

cmd="${1:-}"
case "$cmd" in
  check-env)
    load_env; check_cli; check_migrations
    info "토큰: 설정됨 (값 숨김) · REF: 형식 확인됨 (값 숨김) · CLI: ${REQUIRED_CLI_VERSION} · .env.local 권한: $(stat -c %a "$ENV_FILE")" ;;
  project)
    load_env; check_cli; verify_project ;;
  link)
    load_env; check_cli; verify_project
    info "supabase link (토큰 인증, 대화형 입력 없음)"
    supa link --project-ref "$SUPABASE_PROJECT_REF" < /dev/null
    assert_linked; info "연결 완료" ;;
  status)
    load_env; check_cli; assert_linked
    supa migration list --remote ;;
  preflight)
    load_env; check_cli; assert_linked
    info "적용 전 읽기 전용 점검 — ok 열이 모두 true 여야 합니다"
    supa db query --remote --read-only -f supabase/verify/00_preflight_readonly.sql ;;
  dry-run)
    load_env; check_cli; assert_linked; check_migrations
    info "DRY RUN — 원격 DB에 적용하지 않습니다"
    supa db push --remote --dry-run < /dev/null ;;
  verify-catalog)
    load_env; check_cli; assert_linked
    supa db query --remote --read-only -f supabase/verify/10_post_apply_catalog_readonly.sql ;;
  advisors)
    load_env; check_cli; assert_linked
    supa db advisors --remote --type security --level info ;;
  auth-config)
    load_env; check_cli; verify_project
    info "Auth 설정 읽기 전용 조회 (이메일 확인 관련 값만 표시)"
    rc=0; json=$(mgmt_get "/projects/{ref}/config/auth" 2> >(mask >&2)) || rc=$?
    case $rc in
      0) ;;
      3) die "이 토큰으로는 Auth 설정을 읽을 권한이 없습니다 (HTTP 401/403). 대시보드에서 직접 확인하세요." ;;
      *) die "Auth 설정 조회 실패 (코드 $rc)" ;;
    esac
    printf '%s' "$json" | node -e '
      let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
        const a = JSON.parse(s);
        const pick = (k) => (k in a ? a[k] : "(응답에 없음)");
        console.log(`  external_email_enabled (이메일 가입 사용) : ${pick("external_email_enabled")}`);
        console.log(`  mailer_autoconfirm     (true = 이메일 확인 생략) : ${pick("mailer_autoconfirm")}`);
        console.log(`  disable_signup         (true = 가입 차단) : ${pick("disable_signup")}`);
        console.log(a.mailer_autoconfirm === false ? "▶ 이메일 확인 필수: 켜짐 (결정 5 충족)" : "▶ 이메일 확인 필수: 꺼져 있거나 확인 불가 — 대시보드에서 Confirm email 을 켜세요");
      });' | mask ;;
  *)
    sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'
    [ -z "$cmd" ] || die "알 수 없는 명령: $cmd" ;;
esac
