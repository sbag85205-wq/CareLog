# CareLog Supabase — DB migration 운영 가이드

> ⚠️ **개발용 클라우드 프로젝트에만, 가상 데이터로만** 사용합니다. 운영 프로젝트·실제 환자정보 사용 금지.
> API 키·DB 비밀번호·개인 액세스 토큰은 Git에 저장하지 않습니다 (`.env.local`은 Git 제외).

설계 근거: [docs/supabase-migration-plan.md](../docs/supabase-migration-plan.md)

## 구성

```text
supabase/
├── config.toml                 # supabase init 생성. [auth.email] enable_confirmations = true (결정 5)
├── migrations/                 # 적용 순서 = 파일명 순서
│   ├── 20261111040236_foundation.sql      1/6 private 스키마, 열거형, profiles, 가입 트리거, 역할 변경 차단
│   ├── 20261111040237_core_tables.sql     2/6 patients, admissions, staff_assignments, guardian_invitations, access_grants
│   ├── 20261111040238_access_helpers.sql  3/6 권한 판별 함수 (is_patient_self, is_assigned_staff, guardian_has …)
│   ├── 20261111040239_record_tables.sql   4/6 health_records, medications, drug_info_cache, visit_questions,
│   │                                           meal_menus, meal_logs, life_requests, staff_reviews, staff_review_notes
│   ├── 20261111040240_rls_policies.sql    5/6 GRANT(컬럼 단위 포함) + RLS 정책
│   ├── 20261111040241_rpc_functions.sql   6/6 RPC + 함수 실행 권한 정리 (원격 적용 완료 2026-11-15)
│   ├── 20261115113717_patient_code_login.sql  7 환자 코드 로그인 (3단계) — 원격 적용 완료 2026-11-15
│   ├── 20261118090000_patient_self_care.sql   8 환자 본인 내 약·다음 진료일 정책 (4단계) — 원격 적용 완료 2026-11-18
│   └── 20261120100000_admin_patient_accounts.sql  9 관리자 발급 아이디 로그인: 비활성화·관리자 목록 — 원격 적용 완료 2026-11-20
└── tests/
    ├── rls.test.ts             # 권한 테스트 63개 (npm run test:db)
    ├── patient-login.test.ts   # 3단계 환자 코드 로그인 흐름 15개 (서버 로직 + migration 7)
    ├── verify-scripts.test.ts  # 원격 검증 SQL을 PGlite로 미리 실행 (7개)
    └── support/                # PGlite 테스트 도구, Supabase 환경 재현 shim (테스트 전용)
verify/                         # 원격 검증 SQL (migration 아님 — db push 대상 아님)
├── 00_preflight_readonly.sql           적용 전, 읽기 전용
├── 10_post_apply_catalog_readonly.sql  적용 후, 읽기 전용
└── 20_post_apply_rls_smoke.sql         적용 후, 가상 계정 스모크 테스트 (마지막에 ROLLBACK)
```

## 로컬 검증 (Docker 불필요)

```bash
npm run test:db   # PGlite(WASM PostgreSQL)에 shim + migrations 적용 후 RLS·RPC·권한 상승 테스트
```

- PGlite는 PostgreSQL 18, Supabase 클라우드는 17입니다. 버전 차이로 생길 수 있는 문제는 원격 dry-run과
  원격 적용 후 검증에서 한 번 더 확인합니다 (아래 5단계).
- `tests/support/supabase-shim.sql`은 테스트 전용입니다. **원격 DB에 적용하지 마세요.**

## Supabase CLI (Docker 없이)

- 버전: `supabase` **3.1.0 고정** (devDependency, `npx --no-install supabase …`). Node.js 22.23에서 동작 확인.
- Docker가 필요 **없는** 명령 (원격 DB에 직접 연결): `migration new`, `migration list --remote`,
  `db push --remote [--dry-run]`, `db lint --remote`, `link`
- Docker가 **필요한** 명령 (이 서버에서 사용 불가): `supabase start`, `db reset`(로컬), `db diff`(shadow DB), 로컬 `test db`
- 확인 방법: 닫힌 포트로 `db push --dry-run --remote=<url>`을 실행하면 Docker 오류가 아니라
  `DbConnectError`(접속 실패)가 납니다 → Docker 없이 원격 접속을 시도함을 확인 (2026-11-11).

## 원격(개발용 클라우드) 연결 절차 — 이번 단계는 dry-run까지

모든 원격 작업은 안전 래퍼 `scripts/supabase-remote.sh`로 실행합니다.

- 래퍼는 CLI 3.1.0인지, `.env.local` 권한(600), 프로젝트 이름(`carelog-dev`), 연결된 REF를 매번 확인합니다.
- **실제 적용(`db push`)과 `db reset` 명령은 래퍼에 들어 있지 않습니다.**

### 0. 사용자가 준비할 것 (Git에 저장 금지)

1. Supabase 대시보드에서 개발용 프로젝트 **`carelog-dev`** 생성 (리전 Seoul `ap-northeast-2` 권장)
   - 이름이 다르면 래퍼가 중단합니다. 다른 이름을 쓰려면 `CARELOG_EXPECTED_PROJECT_NAME`을 지정하세요.
   - 생성할 때 정한 DB 비밀번호는 비밀번호 관리자에만 보관합니다. 이 절차에서는 사용하지 않습니다.
2. 대시보드 **Authentication → Sign In / Providers → Email → Confirm email 켜기**
   - `config.toml`은 로컬 설정이라 클라우드에 자동 반영되지 않습니다.
3. 개인 액세스 토큰 발급: Account → Access Tokens. 이름 예: `carelog-dev-cli`, 만료일을 짧게 설정
   - **대상 프로젝트를 `carelog-dev` 하나로 제한**하세요 (다른 프로젝트에 영향을 줄 수 없도록)
   - 필요한 권한 (CLI 3.1.0 `--help` 기준, 2026-11-13 확인):

     | 권한 | 사용하는 단계 |
     | --- | --- |
     | `projects_read`, `project_admin_read` | project, link |
     | `branching_production_read` | link 이후 원격 명령 전반 (기본 브랜치) |
     | `database_pooling_config_read` | **IPv4 접속에 필수** — 이 서버에는 IPv6 경로가 없어 pooler(Supavisor)로만 접속 가능 |
     | `database_read` | preflight, verify-catalog (`db query --read-only`) |
     | `database_write` | status, dry-run — 비밀번호 없이 실행할 때 CLI가 임시 접속 계정을 만들기 위해 필요 |
     | `advisors_read` | advisors |
     | Auth 설정 읽기 권한 (선택) | auth-config — 없으면 대시보드에서 직접 확인 |

   - `database_write`는 DB 쓰기가 가능한 권한이므로, 프로젝트 제한과 짧은 만료일을 꼭 함께 설정합니다.
4. **편집기로** `~/CareLog/.env.local`을 만들고 권한을 600으로 설정

```bash
# ~/CareLog/.env.local  (Git 제외 · echo나 명령줄로 만들지 말고 편집기로 작성)
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_PROJECT_REF=abcdefghijklmnopqrst
```

```bash
chmod 600 .env.local
```

> **공유 서버 주의:** 이 서버에서는 다른 사용자도 `ps`로 실행 중인 명령줄을 볼 수 있습니다.
>
> - `echo "SUPABASE_ACCESS_TOKEN=..." > .env.local`, `-p <비밀번호>`처럼 비밀값이 명령줄에 들어가는 방식은 쓰지 않습니다.
> - 래퍼는 `.env.local`을 `source`하지 않고 허용된 키 2개만 읽습니다. 값은 출력하지 않습니다.
> - CLI 출력에 토큰이나 접속 문자열의 비밀번호가 섞이면 `***`로 가립니다.
> - `--debug` 옵션은 쓰지 마세요. 요청 정보가 로그에 남을 수 있습니다.

### 1. 환경 확인 → 프로젝트 확인 → 연결

```bash
bash scripts/supabase-remote.sh check-env   # 원격 접속 없음: 파일 권한·형식, CLI 3.1.0, migration 6개
bash scripts/supabase-remote.sh project     # 이 REF 한 개만 조회 → 이름 carelog-dev·리전 ap-northeast-2 (다르면 중단)
bash scripts/supabase-remote.sh link        # 토큰 인증 · 비밀번호 인자 없음 · 대화형 입력 없음
```

`supabase/.temp/`(연결 정보)는 `supabase/.gitignore`로 Git에서 제외되어 있습니다.

> `link` 후 `status`에서 `DbConfigIpv6Error`가 나면 토큰에 `database_pooling_config_read`가 없는 것입니다.
> link가 IPv4용 pooler 정보를 받지 못한 상태이므로, 권한을 추가한 토큰으로 바꾼 뒤 `link`를 다시 실행합니다.

### 2. 원격 상태 확인 (읽기 전용)

```bash
bash scripts/supabase-remote.sh status      # 새 프로젝트: 원격 이력 없음, 로컬 6개만 표시돼야 함
bash scripts/supabase-remote.sh preflight   # verify/00_preflight_readonly.sql — ok 열이 모두 true
```

`preflight` 점검 항목:

- Postgres 버전
- Supabase 역할 4개
- 적용 계정이 `auth.users`에 트리거를 만들 수 있는지
- `auth.users` 필수 컬럼과 `auth.uid()`
- CareLog 객체와 이름이 겹치지 않는지 (새 프로젝트인지)

### 3. dry-run (실제 적용 안 함)

```bash
bash scripts/supabase-remote.sh dry-run
```

- 출력에 `migrations/`의 6개 파일만 이름 순서대로 나오는지 확인합니다.
- `tests/`, `verify/` 파일이 목록에 있으면 **중단**합니다. 이 파일들은 migration이 아닙니다.
- dry-run 결과를 공유하고 **적용 승인**을 받습니다.

### 4. 적용 (별도 승인 후 — 래퍼에 없음, 사람이 직접 실행)

```bash
set -a; . ./.env.local; set +a     # 토큰을 환경변수로만 전달
npx --no-install supabase db push --remote
```

### 5. 적용 후 검증 — 실제 Supabase에서 다시 확인

| 순서 | 방법 | 확인 내용 |
| --- | --- | --- |
| 1 | `bash scripts/supabase-remote.sh status` | 원격 이력에 6개 모두 적용 |
| 2 | `bash scripts/supabase-remote.sh verify-catalog` | 16개 테이블 RLS, 정책 33개(migration 5의 28개 + 8의 4개 + 9의 1개), anon 권한 0, 역할·요청 상태·초대 토큰 컬럼 권한, definer `search_path`, 함수 실행 권한, 가입 트리거 |
| 3 | 대시보드 **SQL Editor**에 `verify/20_post_apply_rls_smoke.sql` 전체 붙여넣기 → 실행 | 가상 계정 5개로 가입 트리거·권한 상승 차단·RLS·RPC(상태 전이·stale)·보호자 범위·검토 메모 비공개·anon 차단 → 마지막 행 `PASS` |
| 4 | `bash scripts/supabase-remote.sh advisors` | Supabase 보안 점검 경고 |
| 5 | `bash scripts/supabase-remote.sh auth-config` | 이메일 확인 필수(`mailer_autoconfirm = false`) 여부 |

20번 스모크 테스트는 전체가 하나의 트랜잭션이고 마지막에 `ROLLBACK`합니다.

- 가상 계정과 기록이 DB에 남지 않습니다. 실패하면 `FAIL: …` 메시지와 함께 중단되고, 이때도 아무것도 남지 않습니다.
- 쓰기 SQL을 실행하므로 래퍼의 읽기 전용 명령에 넣지 않았습니다. 적용을 승인받은 뒤 SQL Editor에서만 실행합니다.
- 로컬에서는 `npm run test:db`가 세 검증 SQL을 모두 PGlite로 미리 실행해 봅니다.
  - `00`: 새 DB에서는 통과, 적용된 DB에서는 충돌 감지
  - `10`: 모두 통과
  - `20`: PASS, 데이터 0건, 일부러 낸 구멍은 FAIL로 탐지

### 6. 의료진 권한 부여 (관리자만)

가상 의료진 계정으로 가입하고 이메일 확인을 마친 뒤, 대시보드 SQL Editor(관리자 권한)에서 실행합니다.

```sql
select private.admin_set_role('<가상 의료진 user id>', 'staff');
insert into public.staff_assignments (patient_id, staff_id) values ('<환자 UUID>', '<의료진 user id>');
```

일반 가입자는 가입 정보나 API로 역할을 바꿀 수 없습니다. 테스트 "4. 권한 상승 시도 차단"에서 확인했습니다.

## 버전 차이 위험과 대응

| 구분 | 차이 | 위험 | 대응 |
| --- | --- | --- | --- |
| Supabase CLI | 3.1.0 고정 (`package.json` 정확한 버전) | 인터넷 자료 대부분은 v1/v2 기준 (`--linked`, `link -p`, `--db-url`). 3.x는 `--remote`, `link`에 비밀번호 인자 없음 | 래퍼가 CLI 버전을 확인하고, 다르면 중단. 이 문서는 3.1.0의 `--help`로 확인한 옵션만 사용 |
| Supabase CLI | `db reset --remote` 존재 | 원격 DB 전체 초기화 위험 | 래퍼에 넣지 않음. 직접 실행 금지 |
| PostgreSQL | 테스트 PGlite 0.5.16 = PG 18.6 / Supabase 클라우드 = PG 17 (프로젝트 생성 시 확인) | 18에만 있는 문법을 썼다면 원격에서 실패 | 사용한 문법은 PG 15에서도 지원되는 것만 사용 (`make_interval`, `sha256`, `on conflict on constraint`, `cardinality`, `execute function`). `preflight`가 원격 버전 기록, dry-run·적용 시 원격 파서로 재확인 |
| 권한 모델 | PGlite는 superuser로 migration 적용 / Supabase는 `postgres`(superuser 아님) | `auth.users` 트리거 생성, `supabase_auth_admin` 권한, 테이블 소유자 RLS 우회가 다를 수 있음 | `preflight`의 `postgres_can_create_trigger_on_auth_users`, `postgres_can_set_role_authenticated`, `postgres_bypassrls_or_owner` 확인 (읽기 전용 조회 계정이 아닌 postgres를 명시해 검사). 적용 후 스모크 테스트로 실제 동작 확인 |
| auth 구현 | 테스트 shim의 `auth.uid()`·`auth.users`는 최소 재현 | 실제 Supabase Auth의 추가 컬럼·트리거와 상호작용 | 스모크 테스트가 실제 `auth.users`에 가입 → 트리거 → 프로필 생성까지 확인 |
| 동시성 | PGlite는 연결 1개 | `for update` 잠금 대기를 실제로 겪어 보지 못함 (순차 stale 시나리오만 검증) | 3단계에서 두 브라우저 세션으로 동시 처리 E2E 추가 예정 |
| 기본 권한 | Supabase는 public의 새 객체에 anon/authenticated 권한 자동 부여 | 다음 migration에서 REVOKE를 빠뜨리면 노출 | shim이 같은 기본 권한을 재현하고, 테스트와 `verify-catalog`가 anon 권한 0을 검사 |
| GraphQL | Supabase는 `pg_graphql`로 public 테이블 노출 | 권한이 새면 GraphQL로도 조회됨 | GraphQL도 같은 GRANT·RLS를 따르므로 anon 권한 0 → 노출 없음. advisors로 재확인 |

## 3단계: 환자 코드 로그인 (migration 7)

흐름은 **환자 코드 + 생년월일로 최초 확인 → 10분짜리 일회용 설정 권한 → 새 비밀번호 설정 → 환자 코드 + 비밀번호로 로그인** 입니다.

| 구성 | 내용 |
| --- | --- |
| 저장 위치 | `private.patient_credentials`(코드 해시·가상 생년월일·잠금), `private.password_setup_tokens`(설정 권한 해시). API에 노출되지 않음 |
| 서버 전용 함수 | `svc_*` 7개 — service_role만 실행. 실패는 이유 구분 없이 `{"ok": false}` |
| 반복 시도 제한 | DB: 코드별 생년월일 5회 오류·비밀번호 5회 오류 → 15분 잠금. 서버: IP별 요청 횟수 제한(메모리) |
| 방어선 | 비밀번호 설정 전 환자는 세션이 있어도 본인 기록 권한 없음 (`is_patient_self` 조건 추가) |
| 권한 축소 | `create_my_patient_profile`의 로그인 사용자 실행 권한 회수 — 환자는 서버가 발급 (Security Advisor 경고 10 → 9) |
| 비밀번호·세션 | Supabase Auth (DB에 비밀번호 저장 안 함). 로그인 이메일은 내부용 무작위 주소이며 서버에서만 조회 |

### 실제 연동 검증 (carelog-dev)

```bash
npm run test:e2e:remote   # 포트 3335, 검증용 가상 환자 A·B를 만들어 브라우저로 확인 후 자동 삭제
```

- 브라우저 흐름: 코드+생년월일 → 비밀번호 설정 → 저장(같은 날 1건) → 새로고침 → 로그아웃 → 재로그인
- 환자 본인 세션으로 실제 RLS 확인: 설정 전 접근 차단, 설정 후 생년월일로 재설정 차단, A·B 기록 상호 차단, 서버 전용 함수 호출 차단
- 가상 생년월일·코드·비밀번호는 실행 중 메모리에만 있고, trace·스크린샷은 꺼져 있음

### 원격 적용 (별도 승인 후)

`status → preflight → dry-run`으로 7번만 적용 예정인지 확인한 뒤 4단계와 같은 방법으로 적용합니다.

- 사전 점검 SQL은 "CareLog 객체 없음"을 검사하므로 **이미 6개가 적용된 지금은 일부 항목이 false가 정상**입니다. 이번에는 `status`와 `dry-run`으로 판단합니다.
- 적용 후 `verify-catalog`를 실행하고, 스모크 테스트 `verify/20_post_apply_rls_smoke.sql`(migration 7 반영본)을 실행합니다.

### 가상 환자 발급 (적용 후, 관리자)

1. `.env.local`에 서버 키를 추가하고 `chmod 600 .env.local` (편집기로 입력, 출력 금지)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
2. 발급 스크립트를 실행합니다.
   - 생년월일은 화면에 보이지 않게 입력받고, 출력하거나 저장하지 않습니다.
   - URL이 `SUPABASE_PROJECT_REF`(carelog-dev)와 다르면 중단합니다.

```bash
node --env-file=.env.local scripts/provision-virtual-patient.mjs   # 환자 A, B 각각 1번씩
```

3. 표시되는 **환자 코드**를 메모합니다. 한 번만 표시되고, DB에는 해시만 저장됩니다.

## 새 migration을 추가할 때

- `npx supabase migration new <이름>`으로 만들고, **이미 원격에 적용된 파일은 수정하지 않습니다** (forward-only).
- 새 테이블: `enable row level security` + `revoke all … from anon, authenticated` 후 필요한 권한만 GRANT
- 새 함수: 마지막에 `revoke execute … from public, anon, authenticated` 후 필요한 것만 GRANT,
  security definer면 `set search_path = ''`
- `npm run test:db`에 정상·비정상 접근 테스트를 함께 추가합니다.

## 4단계: 역할별 로그인 버전 (migration 8)

- `20261118090000_patient_self_care.sql`: 정책만 4개 추가 (테이블·데이터 변경 없음)
  - 환자 본인이 내 약을 추가·수정·삭제 (보호자 공개 여부는 기존 트리거가 계속 "환자 본인만" 허용, 기본 비공개)
  - 환자 본인이 다음 진료일 기록 (`patients`의 UPDATE 컬럼 권한은 `next_visit_date` 하나뿐)
- 테스트: `supabase/tests/patient-self-care.test.ts` (PGlite)
- 원격 적용 순서: `status` → `dry-run`(이 파일 1개만 표시되는지) → 적용 → `status`(8/8) → `verify-catalog`(정책 32개)
- 간호사·의료진·보호자 계정과 담당 배정은 `scripts/provision-member.mjs`로 관리자가 준비합니다 (역할은 서버 키로만 부여).
- 역할별 화면·권한 검증: `E2E_REMOTE_SERVER=prod npm run test:e2e:remote -- roles`
  (미배정 간호사·초대 없는 보호자·철회된 보호자 차단을 각자의 세션으로 확인, 검증 계정은 자동 삭제)

## 5단계: 관리자 발급 아이디 로그인 (migration 9)

- 환자 로그인 아이디 = Supabase Auth 이메일 `아이디@id.carelog.invalid` → 아이디를 붙이거나 바꿔도 Auth 사용자 ID·환자 ID·비밀번호·모든 기록 유지
- `profiles.disabled_at`: 비활성화 — 모든 권한 판별 함수가 활성 계정만 허용 → 이미 로그인한 세션도 다음 조회부터 차단 (서버는 Auth 로그인 차단도 함께 설정)
- `admin_users`: 관리자 목록 (본인 행만 조회, 추가·삭제는 서버 키만). 관리자는 RLS로 환자 데이터를 읽지 않고 서버 API(`/api/admin/patients`)가 서버 키로 처리
- `svc_mark_password_set`: 이전 방식(환자 코드) 환자를 관리자가 비밀번호 재설정하면 바로 사용 가능하도록 표시 (서버 키만)
- 테스트: `supabase/tests/admin-accounts.test.ts`
- 원격 적용: `status` → `dry-run`(이 파일 1개만) → 적용 → `status` → `verify-catalog`(테이블 16·정책 33)
