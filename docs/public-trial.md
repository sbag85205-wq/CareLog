# 공개 체험 사이트 운영 (carelog-public)

QR로 누구나 접속하는 체험용 배포. 기존 `carelog`(Production `main`)와 같은 DB(`carelog-dev`)를 쓰지만, 별도 Vercel 프로젝트에서 `design-v2-soft-glass` 브랜치를 배포합니다.

## 안내 띠

- `carelog-public` Vercel 환경변수에만 `NEXT_PUBLIC_CARELOG_TRIAL_NOTICE=1`.
- 모든 화면 맨 위에 "체험용 공개 사이트예요. 실제 이름·연락처·건강정보는 입력하지 마세요. 체험 기록은 정기적으로 지워져요."가 나옵니다. 인쇄에는 나오지 않습니다.
- 기존 `carelog` 프로젝트에는 이 값이 없으므로 띠가 나오지 않습니다. 빌드할 때 값이 고정되므로, 값을 바꾸면 다시 배포해야 반영됩니다.

## 체험 계정

1. 관리자 화면(`/admin/patients`)에서 등록합니다.
   - 표시 이름에 **`(체험)`**을 붙입니다.
   - **'테스트 계정'**을 체크합니다.
   - 비밀번호를 정해 둡니다. 환자는 스스로 비밀번호를 바꿀 수 없어 방문자가 계정을 잠그지 못합니다.
2. 포스터·현장에는 체험 계정의 아이디·비밀번호만 안내합니다. **관리자 계정은 공개하지 않습니다.**
3. 같은 체험 계정을 쓰는 방문자끼리는 서로의 기록이 보입니다. 안내 띠로 실제 정보 입력을 막습니다.

## 체험 기록 초기화

`.env.trial.local`(Git 제외, `chmod 600`)에 대상을 적습니다.

```
CARELOG_TRIAL_ACCOUNTS=<환자ID>:<Auth사용자ID>,<환자ID>:<Auth사용자ID>
```

```bash
node --env-file=.env.local --env-file=.env.trial.local scripts/reset-trial-data.mjs                 # 미리 보기 (대상·건수)
node --env-file=.env.local --env-file=.env.trial.local scripts/reset-trial-data.mjs --apply --seed  # 삭제 + 가상 예시
```

- 대상 확인을 하나라도 통과하지 못하면 아무것도 지우지 않습니다. 확인 항목은 다음과 같습니다.
  - 설정한 환자ID와 Auth ID 쌍이 DB와 일치
  - 이름에 `(체험)` 표시
  - Auth `carelog_test` 표시
  - 환자 역할
  - 관리자 아님
- 삭제는 `patient_id = 체험 환자` 조건으로만 합니다. 대상 표는 약 기록·경험·복용 체크·선택 공유·진료 질문·건강기록·약 목록·식사·생활 요청·보호자 초대입니다.
- 계정·환자 행·로그인 정보·공유 관계는 남깁니다.
- 끝나면 다시 세어 0건인지 확인합니다.

## 로그인이 막힐 때

- 아이디 로그인은 **같은 IP에서 10분에 20번**까지 받습니다(성공 포함, 서버 메모리 기준). 같은 와이파이의 방문자들은 이 한도를 함께 씁니다.
  - 10분이 지나면 저절로 풀립니다.
  - 새로 배포해 서버가 다시 시작돼도 풀립니다.
- Supabase Auth도 로그인 요청에 IP별 한도가 있습니다. 서버가 대신 로그인하므로 Vercel 서버 IP 기준입니다.
  - 대시보드 Authentication → Rate Limits에서 확인합니다.
  - 이 설정을 바꾸면 기존 CareLog에도 적용됩니다.
- 이전 방식(환자 코드) 로그인의 5회 실패 시 15분 잠금은 아이디 로그인에는 해당하지 않습니다.
  - 잠긴 경우 관리자 화면의 비밀번호 재설정으로 풀립니다(`svc_mark_password_set`, 비밀번호 변경 없이 잠금만 해제).

## DB 되돌리기 (migration 11 → 10)

[`supabase/rollback/20261124_down_11_10.sql`](../supabase/rollback/20261124_down_11_10.sql)

- 한 트랜잭션으로 실행되어, 중간에 실패하면 아무것도 바뀌지 않습니다.
- 1–9 구조와 기존 데이터로 돌아가는 것을 `supabase/tests/rollback-10-11.test.ts`가 검증합니다.
- 10·11 이후 쌓인 약 기록·경험·공유는 함께 삭제됩니다.
- 별도 승인 후 사람이 직접 실행합니다.
