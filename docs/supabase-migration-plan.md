# CareLog Supabase 전환 준비 — 분석 보고서

- 작성일: 2026-11-11 (같은 날 설계 결정사항 반영 — 10장)
- 기준 커밋: `4339709` (원격 `main`과 동일, 작업 트리 변경 없음)
- 범위: 분석·설계만. **기존 소스 코드는 수정하지 않았습니다.** 이 문서만 추가했습니다.
- 확정된 결정은 **10장**에 정리했고, 3·4·9장의 표에도 반영했습니다. 결정과 다른 내용이 남아 있으면 10장을 우선합니다.
- 데이터 원칙: 모든 예시·시드는 가상 데이터만 사용합니다. 실제 환자정보는 어떤 단계에서도 입력하지 않습니다.

---

## 0. 요약

| 항목 | 결론 |
| --- | --- |
| 빌드 상태 | `npm run lint` / `npx tsc --noEmit` / `npm run build` 모두 통과 (exit 0) |
| README ↔ 구현 | 대체로 일치. 불일치 2건 — 의료진 생활 요청 큐가 담당 환자로 필터링되지 않음, `MedicationInfoProvider`가 화면에서 쓰이지 않음 |
| 전환 전에 고칠 버그 | **타임스탬프 형식 혼재로 최신순 정렬이 틀어짐** (KST 환경에서 재현), 요청 상태 역행 방지 없음, 재입원 시 이전 입원일 재사용 |
| 가장 큰 구조적 차이 | 현재 저장소는 **모든 역할의 전체 데이터를 한 스냅샷으로 동기 로드**하고 화면에서 거릅니다. DB 모드에서는 **로그인 사용자 범위의 스냅샷을 비동기로 로드**하고, 권한은 RLS로 서버에서 강제해야 합니다 |
| 최고 위험 회귀 | 식사 섭취량 버튼처럼 **로컬 상태 없이 스토어 갱신만으로 선택 표시**하는 UI는 네트워크 지연이 생기면 반응이 없어 보입니다 → 낙관적 업데이트 필요 |
| 권장 전략 | `CareLogData` 형태의 캐시와 셀렉터는 유지하고, 저장소만 "뷰어 범위 로드 + 낙관적 쓰기"로 바꿉니다. 컴포넌트 수정을 최소화하는 방식입니다 |
| 데모/DB 분리 | `NEXT_PUBLIC_CARELOG_DATA_MODE=demo\|supabase`로 구현체를 선택하고, 설정이 누락되면 실패 처리(fail-closed)합니다. 데모 전용 UI(역할 전환·초기화)는 demo 모드에서만 노출합니다 |

---

## 1. 코드 점검 결과

### 1.1 `package.json`

- 런타임 의존성: `next 16.4.5`, `react/react-dom 19.3.0`, `lucide-react ^1.70`, `recharts ^3.10`
- 개발 의존성: Tailwind 4(`@tailwindcss/turbopack`), ESLint 9, TypeScript 5
- 스크립트: `dev`, `build`, `start`, `lint`. **테스트 스크립트와 테스트 프레임워크는 없습니다.**
- Supabase 전환 시 추가할 것: `@supabase/supabase-js`, `@supabase/ssr`, `server-only`(서버 전용 모듈 보호), 테스트용 `vitest`(+ E2E용 `@playwright/test`)
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, `turbopack.root` 고정
- 참고: Next 16에서는 미들웨어 파일명이 **`proxy.ts`** 입니다(`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). Supabase 세션 갱신은 `proxy.ts`에서 처리합니다.

### 1.2 `src/types/index.ts`

- 도메인 타입 14개와 스냅샷 `CareLogData`가 정의되어 있습니다. DB 스키마의 초안으로 쓰기에 적합합니다.
- DB로 옮길 때 바뀌어야 할 점:

| 현재 | 문제 | DB 설계 |
| --- | --- | --- |
| `Patient.assignedStaffIds: string[]` | 배열은 FK와 RLS 조인에 부적합 | `staff_assignments(patient_id, staff_id)` 조인 테이블 |
| `Patient.ward/room/admissionDate` | 입원 이력 1건만 표현 가능, 재입원 시 덮어쓰기 문제 | `admissions` 테이블 (입원 기간 단위) |
| `DemoUser` | 인증 계정 개념 없음 | `profiles` (`auth.users` 1:1) |
| `AccessGrant.role` | `granteeUserId`의 역할과 중복 | 제거 (`profiles.role` 참조) |
| ID가 `"P001"`, `"R-..."` 문자열 | DB는 uuid | `uuid default gen_random_uuid()`. 데모 코드는 별도 컬럼 `demo_code` |
| `createdAt` 문자열 형식 혼재 | 아래 2.2 버그 참조 | `timestamptz` |
| `LifeRequest.mealChange` 중첩 객체 | 컬럼 3개로 정규화 필요 | `meal_change_date/slot/to_type` + CHECK |
| `isDemo` 플래그 | 실데이터 DB에 데모 행이 섞일 위험 | demo 전용 프로젝트에서만 시드 (7장) |

### 1.3 `src/lib/repository/`

- `types.ts`: `CareLogRepository` 인터페이스 — `getSnapshot()/subscribe()`로 동기 읽기, 쓰기 메서드 11개는 `Promise` 반환
- `local-storage.ts`: 쓰기는 `async`지만 실제로는 **동기적으로 commit한 뒤 resolve**합니다. 따라서 `await` 직후 UI가 이미 갱신된 상태라고 가정해도 지금은 문제가 없습니다.
- 인터페이스의 한계:
  1. `getSnapshot(): CareLogData` — 모든 역할의 전체 데이터를 담는 형태라 DB 모드에서는 그대로 쓸 수 없습니다(권한 범위 개념 없음).
  2. 로딩·오류 상태가 없습니다(`null`은 "서버 렌더링 중"만 의미).
  3. 쓰기 메서드에 "누가"(actor)가 인자로 들어가 있습니다(`updateRequestStatus(id, status, staffId)`). DB 모드에서는 `auth.uid()`로 대체해야 하며, 클라이언트가 보낸 값을 신뢰하면 안 됩니다.
  4. `resetDemoData()`가 공용 인터페이스에 들어 있습니다. DB 모드에서는 존재하면 안 되는 기능입니다.
  5. `updateRequestStatus`가 요청 상태 변경과 식사 형태 반영을 한 번에 처리합니다. DB에서는 **트랜잭션(RPC)** 으로 만들어야 합니다.

### 1.4 `src/hooks/useCareLog.ts`

- `useSyncExternalStore(repository.subscribe, repository.getSnapshot, () => null)` 구조입니다. 패턴 자체는 그대로 쓸 수 있습니다.
- `repository`를 재노출하고 있어 **컴포넌트가 저장소를 직접 호출**합니다(아래 12곳). 전환 시 이 지점들이 오류 처리와 낙관적 업데이트의 대상이 됩니다.

### 1.5 `src/lib/medication-info.ts`

- `MedicationInfoProvider.getInfo(med)`와 mock 구현만 있고, **현재 어떤 컴포넌트도 사용하지 않습니다**(grep 결과 0건). `MedicationList`는 `Medication` 필드를 직접 표시합니다. 상세 분석은 6장에서 다룹니다.

### 1.6 `src/components` 구조

```text
layout/        CareLogApp(역할 전환 셸, DEMO_* 상수 사용), AppHeader(+안내문, 푸터)
dashboard/     PatientDashboard(모드 전환·탭·홈), VisitPrep(+summarizeRecent, NextVisitBadge)
health/        ConditionForm, HealthChart, HealthHistory
medication/    MedicationList
inpatient/     MealTracker, LifeRequestPanel(+RequestList, REQUEST_ICON), RequestStatusSteps
medical-staff/ StaffDashboard(목록·상세·요청 큐), TriageBadge
guardian/      GuardianDashboard
ui/            primitives (Card, Button, ChoiceGroup, Sheet, …)
```

저장소 쓰기 호출 지점(전환 시 수정 대상):

| 파일:줄 | 호출 | 현재 처리 | DB 전환 시 위험 |
| --- | --- | --- | --- |
| `health/ConditionForm.tsx:55` | `upsertHealthRecord` | await 후 "저장됨" | 중복 제출, 실패 시 메시지 없음 |
| `layout/CareLogApp.tsx:21` | `resetDemoData` | confirm 후 실행 | **DB 모드에서 절대 노출 금지** |
| `medical-staff/StaffDashboard.tsx:180` | `addStaffReview` | await 후 메시지 | 실패 시 메시지 없음 |
| `medical-staff/StaffDashboard.tsx:296,300` | `updateRequestStatus` | `void` | 연타 시 중복 전이, 실패 무시 |
| `dashboard/VisitPrep.tsx:85,109,116` | 질문 추가·토글·삭제 | `void` | 지연 동안 반응 없음 |
| `inpatient/LifeRequestPanel.tsx:48` | `createRequest` | await 후 "접수됨" | 중복 제출 |
| `inpatient/MealTracker.tsx:43` | `upsertMealLog` | `void`, **선택 상태를 스토어에서 읽음** | **지연 시 버튼이 안 눌린 것처럼 보임** |
| `inpatient/MealTracker.tsx:53` | `createRequest` | await | 중복 제출 |
| `dashboard/PatientDashboard.tsx:60` | `setCareMode` | `void` | 모드 토글 지연, 실패 시 UI 불일치 |

---

## 2. README ↔ 구현 일치 여부

| README 설명 | 구현 | 판정 |
| --- | --- | --- |
| 통원: 컨디션 기록(8개 항목), 7/30일 그래프, 30일 달력·날짜별 수정, 약 정보, 진료 준비 | 모두 구현. 날짜별 목록은 최근 20건만 표시 | 일치 |
| 입원: 식사(메뉴·섭취량·소화·형태 변경 요청), 생활 요청 3단계, 통원→입원 연속 그래프 | 구현. 입원일 기준선은 환자가 현재 입원 모드일 때만 표시 | 일치 |
| 식사 변경은 직원이 처리 완료해야 반영 | `updateRequestStatus(...,"completed")`에서만 반영 | 일치 |
| 의료진: 담당 환자 목록, 분류, 후속 조치, **생활 요청 처리** | 환자 목록은 담당 필터 적용. **요청 큐(`RequestQueue`)와 "미처리 생활 요청" 수는 담당 필터 없이 전체 요청 표시** (`StaffDashboard.tsx:39, 262`) | **불일치** — 데모에서는 담당 의료진이 1명이라 드러나지 않음 |
| 보호자: 승인 환자만, 허용된 약, 입원 식사·요청 | `grantedPatients`, `grantedScopes`, `visibleToGuardian` 필터 | 일치 (화면 필터일 뿐이라는 점도 명시됨) |
| 분류 기준 3가지 (`TRIAGE_RULES`) | `triage.ts`와 수치 일치 | 일치 |
| 데이터 계층: Repository 인터페이스, `index.ts`에서 교체 | 구조는 맞음. 단, 인터페이스가 전체 스냅샷 동기 읽기라 **"구현체만 바꾸면 된다"는 설명은 과소평가** (5장) | **부분 일치** |
| `medication-info.ts`: 식약처 API 대비 | 인터페이스는 있으나 미사용, 필드 부족 (6장) | **부분 일치** |
| 실행 방법·폴더 구조 | 일치 (`guardian/` 포함) | 일치 |

### 2.1 그 밖의 사소한 점

- `ConditionForm`의 `compact` prop이 선언만 되고 사용되지 않습니다.
- `selectors.ts`가 `getMenu`를 `@/data/mock-data`에서 가져옵니다. 데모 메뉴가 도메인 로직에 섞여 있는 상태로, DB 모드에서는 메뉴 제공자로 분리해야 합니다.

### 2.2 전환 전에 고칠 버그

**B1. 타임스탬프 형식 혼재로 최신순 정렬 오류 (재현됨)**

- 시드 데이터는 `"2026-11-11T09:10:00"`(타임존 없는 로컬 시각), 새로 만든 데이터는 `toISOString()` 결과인 `"2026-11-11T00:20:00.000Z"`(UTC) 형식입니다.
- `requestsOf`, 리뷰 정렬, `triage.lastReview`가 문자열 비교로 정렬하기 때문에, KST에서 **09:20에 만든 요청이 09:10 시드 요청보다 아래에** 표시됩니다.

```text
TZ=Asia/Seoul 재현: 최신순 정렬 결과: seed 09:10 -> new 09:20   (기대: new -> seed)
```

- 수정안: 시드도 `new Date(...).toISOString()`로 통일하고, 정렬은 `Date.parse` 비교로 바꿉니다. DB에서는 `timestamptz`를 쓰면 근본적으로 해결됩니다.

**B2. 요청 상태 역행 방지 없음.** `updateRequestStatus`는 `completed → received` 같은 전이도 허용합니다. UI가 앞으로 가는 버튼만 보여서 드러나지 않을 뿐입니다. DB에서는 RPC로 전이 규칙을 강제해야 합니다.

**B3. 재입원 시 이전 입원 정보 재사용.** `setCareMode("inpatient")`는 `admissionDate ?? today`를 씁니다. 퇴원(통원 전환) 후 다시 입원하면 예전 입원일과 병실이 그대로 남습니다 → `admissions` 테이블로 해결합니다.

**B4. 쓰기 실패 처리 없음.** 대부분의 호출이 `void repository.x()`라 실패를 알 수 없습니다. localStorage에서는 실패할 일이 거의 없지만, 네트워크 DB에서는 필수입니다.

**B5. "오늘" 기준이 기기 시간대.** `todayISO()`가 기기 로컬 시간을 씁니다. 해외 시간대 기기나 서버(UTC)에서 날짜가 하루 어긋날 수 있습니다. DB에서는 `(now() at time zone 'Asia/Seoul')::date`로 기준을 통일합니다.

---

## 3. DB 설계

### 3.1 공통 원칙

- PK는 `uuid default gen_random_uuid()`, 시각은 `timestamptz default now()`, 날짜는 `date`
- 열거형은 Postgres `enum`으로 정의합니다. 현재 TS 유니온 타입과 값을 1:1로 맞춥니다.
- 모든 환자 소유 테이블은 `patient_id uuid not null references patients(id) on delete cascade`
- `updated_at`은 공용 트리거 `set_updated_at()`으로 갱신
- 자유 입력 텍스트는 길이 CHECK를 둡니다(UI의 `maxLength`와 동일하게)

### 3.2 열거형

```sql
create type app_role         as enum ('patient','guardian','staff');
create type care_mode        as enum ('outpatient','inpatient');
create type digestion        as enum ('good','normal','bloated','heartburn','nausea','bowel');
create type meal_slot        as enum ('breakfast','lunch','dinner');
create type meal_type        as enum ('regular','porridge','soft','liquid');
create type request_category as enum ('water','bedding','meal_change','other');
create type request_status   as enum ('received','acknowledged','completed');
create type review_action    as enum ('checked','consult_needed');
create type access_scope     as enum ('records','medications','meals','requests');
create type med_source       as enum ('manual','mfds_easy','mfds_permit');  -- 'mock'은 demo 전용
create type admission_source as enum ('self_reported','hospital_confirmed');
create type invitation_status as enum ('pending','accepted','revoked','expired');
```

### 3.3 테이블

| 테이블 | 주요 컬럼 | 제약·FK | 인덱스 |
| --- | --- | --- | --- |
| `profiles` | `id uuid PK → auth.users(id)`, `role app_role not null`, `display_name text`, `created_at` | `role`은 **본인이 수정 불가**(컬럼 권한에서 제외) | PK |
| `patients` | `id`, `profile_id uuid null → profiles(id)`, `display_name`, `birth_year smallint`, `sex char(1)`, `department`, `care_mode care_mode default 'outpatient'` (**환자 자기기록 모드**, 공식 입원 여부 아님), `next_visit_date date`, `demo_code text null`, `created_at`, `updated_at` | `unique(profile_id)` (환자 계정 1:1), `check(sex in ('M','F'))` | `profile_id` |
| `admissions` | `id`, `patient_id`, `ward`, `room`, `admitted_on date not null`, `discharged_on date null`, `source admission_source not null default 'self_reported'` (`self_reported`/`hospital_confirmed`), `created_by → profiles`, `created_at` | `check(discharged_on is null or discharged_on >= admitted_on)`. **행을 삭제하지 않음** (과거 입원 이력 보존) | **부분 unique** `(patient_id) where discharged_on is null` (진행 중인 입원 1건), `(patient_id, admitted_on desc)` |
| `staff_assignments` | `patient_id`, `staff_id → profiles(id)`, `assigned_at` | `PK(patient_id, staff_id)` | `(staff_id)` |
| `guardian_invitations` | `id`, `patient_id`, `invitee_email citext`, `scopes access_scope[]`, `token_hash text`, `status invitation_status` (`pending`/`accepted`/`revoked`/`expired`), `expires_at`, `created_by`, `accepted_by → profiles null`, `created_at` | `check(cardinality(scopes) > 0)`. 토큰은 **해시만 저장** | `(patient_id)`, `(token_hash) unique` |
| `access_grants` | `id`, `patient_id`, `grantee_id → profiles(id)`, `scopes access_scope[] not null`, `invitation_id → guardian_invitations null`, `approved_at`, `revoked_at null` | `unique(patient_id, grantee_id)`, `check(cardinality(scopes) > 0)` | `(grantee_id) where revoked_at is null` |
| `health_records` | `id`, `patient_id`, `record_date date`, `condition smallint`, `pain smallint`, `fatigue smallint`, `sleep smallint`, `meal_intake smallint`, `digestion digestion`, `symptoms text[] default '{}'`, `memo text default ''`, `recorded_in care_mode`, `created_by`, `created_at`, `updated_at` | **`unique(patient_id, record_date)`**, `check(condition between 1 and 5)`, `pain 0~10`, `fatigue/sleep 1~5`, `meal_intake in (0,25,50,75,100)`, `char_length(memo) <= 500` | `(patient_id, record_date desc)` — unique 인덱스로 겸용 |
| `medications` | `id`, `patient_id`, `name`, `purpose`, `dosage`, `schedule`, `caution`(병원 안내 문구), `source med_source`, `external_item_seq text null`, `visible_to_guardian bool default false`, `is_active bool default true`, `created_by`, timestamps | `check(source = 'manual' or external_item_seq is not null)` | `(patient_id) where is_active`, `(external_item_seq)` |
| `drug_info_cache` | `item_seq text`, `provider med_source`, `payload jsonb`, `source_updated_on date`, `fetched_at` | `PK(item_seq, provider)` | PK |
| `visit_questions` | `id`, `patient_id`, `text`, `done bool default false`, `shared_with_staff bool not null default false`, `created_at` | `char_length(text) between 1 and 200` | `(patient_id, created_at)` |
| `meal_menus` (선택) | `menu_date`, `slot`, `meal_type`, `items text[]` | `PK(menu_date, slot, meal_type)` | PK |
| `meal_logs` | `id`, `patient_id`, `meal_date date`, `slot meal_slot`, `meal_type meal_type default 'regular'`, `intake smallint null`, `digestion digestion null`, `updated_at` | **`unique(patient_id, meal_date, slot)`**, `check(intake is null or intake in (0,25,50,75,100))` | unique 인덱스로 겸용 |
| `life_requests` | `id`, `patient_id`, `category`, `detail`, `status default 'received'`, `meal_change_date date`, `meal_change_slot meal_slot`, `meal_change_to_type meal_type`, `created_by`, `handled_by → profiles null`, timestamps | `check(char_length(detail) between 1 and 200)`. 식사 변경 3컬럼은 **모두 null이거나 모두 값이 있어야 하고, 값이 있으면 `category = 'meal_change'`** | `(patient_id, created_at desc)`, `(created_at desc) where status <> 'completed'` (의료진 큐) |
| `staff_reviews` | `id`, `patient_id`, `staff_id → profiles`, `action review_action`, `created_at` (**환자에게 공개되는 상태 정보만**) | — | `(patient_id, created_at desc)` |
| `staff_review_notes` | `review_id uuid PK → staff_reviews(id) on delete cascade`, `note text` (**의료진 내부 메모, 환자·보호자 비공개**) | `char_length(note) <= 300` | PK |

설계 메모:

- `visible_to_guardian` 기본값은 **`false`(옵트인)** 로 확정했습니다(10장). 프로토타입 가상 데이터도 2단계에서 같은 기본값으로 맞춥니다.
- 검토 상태와 내부 메모를 **테이블 단위로 분리**했습니다. RLS는 행 단위라서 같은 행 안의 메모 컬럼만 숨기기 어렵고, 테이블을 나누는 편이 정책이 단순하고 실수할 여지가 적기 때문입니다.
- `medications.caution`은 병원·의료진이 정한 안내, `drug_info_cache.payload`는 식약처 원문입니다. 두 출처를 섞지 않습니다.
- 분류(triage)는 1차로 기존처럼 클라이언트에서 계산합니다. RLS로 이미 담당 환자 데이터만 받으므로 그대로 동작합니다. 환자 수가 늘면 `security_invoker = true` 뷰(`patient_triage_30d`)로 옮깁니다.

### 3.4 Migration 계획 (`supabase/migrations/`)

| 순서 | 파일 | 내용 |
| --- | --- | --- |
| 1 | `0001_enums_profiles.sql` | 열거형, `profiles`, 가입 트리거 `handle_new_user()` (기본 role = `patient`. staff/guardian 지정은 관리자만 service role로) |
| 2 | `0002_core_tables.sql` | `patients`, `admissions`, `staff_assignments`, `guardian_invitations`, `access_grants`, `set_updated_at` 트리거 |
| 3 | `0003_records.sql` | `health_records`, `medications`, `drug_info_cache`, `visit_questions`, `meal_menus`, `meal_logs`, `life_requests`, `staff_reviews`, `staff_review_notes` + 인덱스 |
| 4 | `0004_rls_helpers.sql` | 권한 판별 함수 (`security definer`, `stable`, `set search_path = ''`) |
| 5 | `0005_rls_policies.sql` | 모든 테이블 `enable row level security` + 정책 (4장) + 컬럼 권한 |
| 6 | `0006_rpc.sql` | `set_care_mode()`, `advance_request_status()`, `upsert_meal_intake()`, `invite_guardian()`, `accept_guardian_invitation()`, `revoke_guardian_access()` |
| — | `supabase/seed.sql` | **가상 데이터만**, 클라우드 개발용 프로젝트에서만 실행 (운영 프로젝트 적용 금지) |

롤백은 새 마이그레이션을 추가하는 방식(forward-only)으로 합니다. 운영 프로젝트에는 `seed.sql`을 절대 적용하지 않습니다.

**적용 방법 (Docker·CLI 없는 환경, 10장 결정 6):**

- SQL 파일은 `supabase/migrations/<타임스탬프>_<이름>.sql` 형식으로 Git에서 관리합니다. 파일 이름 규칙은 Supabase CLI 규칙과 같게 맞춰, 나중에 CLI를 쓸 수 있게 되어도 그대로 옮길 수 있게 합니다.
- 클라우드 **개발용** 프로젝트에 적용하는 방법은 두 가지입니다.
  1. 대시보드 SQL Editor에서 파일 순서대로 실행하고, 적용한 파일명을 `supabase/APPLIED.md`에 기록
  2. `npx supabase link` + `npx supabase db push` — 전역 설치 없이 npx로 실행. 원격 DB에 직접 적용하므로 Docker가 필요 없는 것으로 알고 있으나, **2단계 시작 시 실제로 확인 필요**
- 개발용 프로젝트에도 **가상 데이터만** 넣습니다. DB 비밀번호와 service role 키는 `.env.local`(Git 제외)에만 둡니다.

---

## 4. 인증·권한·RLS 설계

### 4.1 인증

- Supabase Auth **이메일·비밀번호** 방식으로 하고, **이메일 확인(Confirm email)을 켭니다.** 확인 전 계정은 로그인할 수 없습니다.
- 역할의 원천은 `profiles.role` 하나뿐입니다. **`user_metadata`는 사용자가 직접 수정할 수 있으므로 권한 판단에 쓰지 않습니다.** JWT 클레임이 필요하면 Custom Access Token Hook으로 `profiles.role`을 넣습니다.
- 가입 트리거 `handle_new_user()`는 항상 `role = 'patient'`로 프로필을 만듭니다. 가입 폼에 역할 선택 항목을 두지 않습니다.
- **`staff` 역할은 관리자만 부여합니다** (service role로 실행하는 관리 SQL 또는 서버 전용 관리 스크립트). `profiles.role`은 `authenticated`에게 UPDATE 권한을 주지 않고, 트리거로도 변경을 막습니다.
- 보호자는 별도 역할로 가입하지 않습니다. **초대를 수락하면 `access_grants`가 생기고, 그 grant로 접근 범위가 정해집니다.** 그래서 한 사람이 자신의 환자 계정과 다른 환자의 보호자 권한을 함께 가질 수 있습니다. `app_role`의 `guardian` 값은 화면 전환 판단용으로만 남깁니다.
- Next 16 연동: `@supabase/ssr` + 쿠키 세션. `src/proxy.ts`에서 세션을 갱신하고, 서버 컴포넌트와 Route Handler는 `createServerClient`를 사용합니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다. `server-only` 모듈에서만 import합니다.

### 4.2 통원·입원 처리

- 통원·입원은 **역할이 아니라 환자의 모드**입니다. `patients.care_mode` 컬럼으로 표현하고, `health_records.recorded_in`에 기록 당시 모드를 남깁니다(현재 구조 유지).
- 전환은 RPC `set_care_mode(patient_id, mode)`로만 합니다.
  - `inpatient`로 전환: 진행 중인 `admissions`가 없으면 새로 생성 (B3 해결)
  - `outpatient`로 전환: 진행 중인 입원에 `discharged_on = today(KST)` 기록
- 호출 권한: **환자 본인 + 담당 의료진** (10장 결정 1). 환자가 전환하면 `admissions.source = 'self_reported'`로 기록하고, 화면에 "자기기록 모드 · 공식 입원 확인 아님"을 표시합니다. 나중에 병원 확인 기능이 생기면 `hospital_confirmed`를 씁니다.
- 재입원은 언제나 **새 `admissions` 행**입니다. 이전 행은 수정·삭제하지 않습니다.

### 4.3 RLS 판별 함수

```sql
-- 모두 security definer + stable + set search_path = ''
app.current_role()                         -- profiles.role of auth.uid()
app.is_patient_self(p uuid)                -- patients.profile_id = auth.uid()
app.is_assigned_staff(p uuid)              -- staff_assignments에 (p, auth.uid()) 존재 && role = 'staff'
app.guardian_has(p uuid, s access_scope)   -- access_grants: grantee = auth.uid(), revoked_at is null, s = any(scopes)
app.can_read_patient(p uuid)               -- 위 세 가지 중 하나
```

### 4.4 권한 매트릭스 (S=조회, I=등록, U=수정, D=삭제, RPC=함수로만)

| 테이블 | 환자 본인 | 담당 의료진 | 보호자 (승인 범위) |
| --- | --- | --- | --- |
| `profiles` | S/U 본인 (`display_name`만) | S (담당 환자의 profile) | S 본인 |
| `patients` | S, `care_mode`는 RPC | S, U(`next_visit_date`), `care_mode`는 RPC | S (grant 존재 시) |
| `admissions` | S | S/I/U | S (grant 존재 시) |
| `staff_assignments` | — | S 본인 행 | — (쓰기는 관리자/service role만) |
| `guardian_invitations` | S/I/U(철회) 본인 환자 | — | 수락은 RPC `accept_guardian_invitation(token)`로만 (로그인 이메일 = `invitee_email`일 때) |
| `access_grants` | S, U(`scopes` 변경·`revoked_at` 철회) 본인 환자. I는 초대 수락 RPC만 | — | S 본인이 받은 grant |
| `health_records` | S/I/U (D 없음) | S | S if `records` |
| `medications` | S, U는 `visible_to_guardian`만 (명시적 허용) | S/I/U/D | S if `medications` **and** `visible_to_guardian` |
| `drug_info_cache` | S | S | S |
| `visit_questions` | S/I/U/D | S **if `shared_with_staff`** | — |
| `meal_logs` | S, U는 `intake`/`digestion`만 (`upsert_meal_intake` RPC) | S/U | S if `meals` |
| `life_requests` | S/I (등록 시 `status = 'received'`, `handled_by is null`만 허용) | S, 상태 변경은 `advance_request_status` RPC | S if `requests` |
| `staff_reviews` | S (상태·시각만) | S/I | — |
| `staff_review_notes` | — | S/I (담당 환자의 리뷰만) | — |

구현 시 주의:

- RLS는 행만 제어합니다. 컬럼 제한은 `revoke update on ... from authenticated` 후 `grant update (col, ...)`로 하거나 RPC로 처리합니다.
- `advance_request_status`는 `received → acknowledged → completed` 순서로만 허용하고(B2), `completed`이면서 식사 변경 요청이면 `meal_logs.meal_type`을 **같은 트랜잭션에서** 반영합니다. `handled_by = auth.uid()`는 서버에서 채웁니다.
- 보호자 화면에서 비공개 약을 거르는 일은 현재 `selectors.medicationsOf`(클라이언트)가 하고 있습니다. **DB 모드에서는 RLS가 원천 차단해야 하며**, 클라이언트 필터는 보조 수단으로만 남깁니다.

---

## 5. 동기 → 비동기 Repository 전환 분석

### 5.1 현재 계약에서 깨지는 가정

1. **전체 스냅샷**: 의료진·보호자·환자 화면이 같은 `CareLogData`를 공유합니다. DB 모드에서는 로그인 사용자마다 RLS로 걸러진 다른 스냅샷을 받습니다.
2. **즉시 반영**: 쓰기 `await`가 끝나면 스토어가 이미 갱신되어 있다고 가정합니다.
3. **항상 성공**: 오류 경로가 없습니다.
4. **ID·시각을 클라이언트가 생성**: DB에서는 서버가 생성한 값을 받아 캐시를 교체해야 합니다.
5. **고정 데모 ID**: `CareLogApp`이 `DEMO_PATIENT_ID/STAFF_ID/GUARDIAN_ID`를 직접 사용합니다.
6. **다중 탭 동기화**: `storage` 이벤트 → DB 모드에서는 Supabase Realtime(생활 요청, 식사 기록)으로 대체합니다.

### 5.2 권장 설계 — 화면 변경 최소화

```ts
// src/lib/repository/types.ts (변경안)
export interface Viewer { userId: string; role: Role; patientId?: string }  // patientId: 환자 본인일 때
export type LoadState = { status: "idle" | "loading" | "ready" | "error"; data: CareLogData | null; error?: string };

export interface CareLogRepository {
  readonly mode: "demo" | "supabase";
  getState(): LoadState;                 // useSyncExternalStore용 (참조 안정성 유지)
  subscribe(listener: () => void): () => void;
  load(viewer: Viewer): Promise<void>;   // 뷰어 범위 스냅샷 로드 (DB: RLS 결과)
  // 쓰기: actor 인자 제거 → 서버가 auth.uid() 사용
  upsertHealthRecord(input: HealthRecordInput): Promise<HealthRecord>;
  setCareMode(patientId: string, mode: CareMode): Promise<void>;
  advanceRequestStatus(id: string, to: RequestStatus): Promise<void>;
  // …나머지 쓰기 메서드는 동일한 시그니처
}
export interface DemoControls { resetDemoData(): Promise<void>; switchViewer(role: Role): void } // demo 전용
```

- **캐시 형태(`CareLogData`)와 `selectors.ts`/`triage.ts`는 그대로 둡니다.** 컴포넌트 대부분이 수정 없이 동작합니다.
- 쓰기 공통 흐름 (`lib/repository/optimistic.ts`): ① 캐시에 낙관적 반영 → ② 원격 호출 → ③ 성공하면 서버 행으로 교체 / 실패하면 롤백하고 오류 알림
- local 구현도 같은 흐름을 쓰고, `NEXT_PUBLIC_CARELOG_FAKE_LATENCY_MS` 옵션으로 **지연을 흉내 내** DB 연결 전에 UI 회귀를 미리 잡습니다.

### 5.3 회귀 위험

| 위험 | 등급 | 원인 | 대응 |
| --- | --- | --- | --- |
| 식사 섭취량·소화 버튼이 눌리지 않는 것처럼 보임 | 높음 | `MealTracker`가 선택값을 스토어에서만 읽음 | 낙관적 업데이트, 지연 시뮬레이션 테스트 |
| 데모 초기화 버튼이 DB 모드에서 노출 | 높음 | `resetDemoData`가 공용 인터페이스에 있음 | `DemoControls`로 분리, demo 모드에서만 렌더링 |
| 보호자에게 비공개 데이터 전송 | 높음 | 지금은 전체 로드 후 화면에서 필터 | RLS 강제 + RLS 테스트 |
| 요청 상태·식사 반영 불일치 | 높음 | 두 테이블을 따로 갱신할 경우 | `advance_request_status` RPC(트랜잭션) |
| 중복 제출 (기록 저장·요청 보내기 연타) | 중간 | 버튼 비활성화 없음 | `pending` 상태로 버튼 잠금. 기록은 upsert라 데이터 중복은 없음 |
| 최신순 정렬 오류 | 중간 | B1 | 1단계에서 수정 |
| 로딩·오류 화면 없음 | 중간 | `null` = 로딩만 처리 | `LoadState` 기반 로딩·오류·재시도 UI |
| 날짜 하루 어긋남 | 중간 | B5 | KST 기준 `today` 유틸 |
| 폼 초기화 타이밍 (`key={date-version}`) | 낮음 | 저장 후 서버 행으로 교체되며 `updatedAt` 변경 | 현재 key는 version 기반이라 영향 적음. E2E로 확인 |
| 차트·달력 | 낮음 | 순수 함수 기반 | 영향 거의 없음 |

---

## 6. 의약품 정보 Provider 분석

### 6.1 현재 구조의 한계

```ts
interface MedicationInfoProvider { getInfo(med: Medication): Promise<MedicationInfo> }
interface MedicationInfo { efficacy; usage; warning; sourceLabel }
```

1. **사용처 없음** — 화면은 `Medication` 필드만 표시합니다.
2. **검색 기능 없음** — 약을 등록하려면 이름으로 검색해 품목기준코드(`itemSeq`)를 얻어야 합니다.
3. **필드 부족** — e약은요가 제공하는 상호작용·부작용·보관법·경고·이미지·수정일을 담을 자리가 없습니다.
4. **미조회·오류 표현 없음** — 결과가 없거나 API 장애일 때를 구분할 수 없습니다.
5. **단일 제공자** — e약은요는 주로 일반의약품만 다루므로, 처방약이 없을 때 허가정보 API로 넘어가는 대체 경로가 필요합니다.
6. **캐시·호출 한도 대응 없음**

### 6.2 확인한 API 명세 (공공데이터포털 기준)

| 구분 | e약은요 (의약품개요정보) | 의약품 제품 허가정보 |
| --- | --- | --- |
| 데이터 ID | 15075057 | 15095677 |
| 기본 URL | `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService` | `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08` |
| 오퍼레이션 | `getDrbEasyDrugList` (목록 조회 1개) | 제품 허가 목록 / 제품 허가 상세정보 / 주성분 상세정보 — **경로명은 포털 명세에 표기되지 않음, 활용가이드로 확인 필요** |
| 인증키 파라미터 | `ServiceKey` (포털 표기 기준 대문자 S) | `serviceKey` |
| 조회 키 | `itemSeq`, `itemName`, `entpName` | 상세: `item_seq`, `item_name`, `entp_name`, `edi_code`, `atc_code` 등 |
| 응답 필드 | `itemSeq`, `itemName`, `entpName`, `efcyQesitm`(효능), `useMethodQesitm`(사용법), `atpnWarnQesitm`(사용 전 경고), `atpnQesitm`(주의사항), `intrcQesitm`(상호작용), `seQesitm`(부작용), `depositMethodQesitm`(보관), `itemImage`, `openDe`, `updateDe` | 포털 명세에는 `header/body`만 표기. **실제 응답 필드(효능·용법 문서 필드 등)는 샘플 호출로 확인 필요** |
| 응답 형식 | XML 기본, `type=json` 가능 | XML 기본, `type=json` 가능 |
| 호출 한도 | 명세에 표기 없음 | 명세에 표기 없음 |

**공통 조인 키는 품목기준코드(`itemSeq` / `item_seq`)** 입니다. 우리 `medications.external_item_seq`에 저장하면 됩니다.

### 6.3 제안 구조

```ts
// src/lib/medication-info/types.ts
export interface DrugSearchHit { itemSeq: string; itemName: string; company: string; provider: ProviderId }
export interface DrugInfo {
  itemSeq: string; itemName: string; company: string;
  efficacy?: string; usage?: string; warningBeforeUse?: string; precautions?: string;
  interactions?: string; sideEffects?: string; storage?: string; imageUrl?: string;
  sourceUpdatedOn?: string; provider: ProviderId; sourceLabel: string; fetchedAt: string;
}
export type ProviderId = "mock" | "mfds_easy" | "mfds_permit";
export type LookupResult = { ok: true; info: DrugInfo } | { ok: false; reason: "not_found" | "upstream_error" | "rate_limited" };
export interface MedicationInfoProvider {
  id: ProviderId;
  search(query: string): Promise<DrugSearchHit[]>;
  getByItemSeq(itemSeq: string): Promise<LookupResult>;
}
```

- `CompositeProvider`: e약은요 → (없으면) 허가정보 → (demo 모드) mock 순서로 조회
- **서버 전용**: `src/lib/medication-info/mfds-*.ts`에 `import "server-only"`를 붙이고, 호출은 `src/app/api/medications/[itemSeq]/route.ts`와 `.../search/route.ts`에서만 합니다. 키는 `MFDS_API_KEY`(이미 `.env.example`에 있음)를 씁니다.
- 캐시: `drug_info_cache` 테이블(예: TTL 7일, `updateDe` 기준) 또는 `use cache` + `cacheLife` (`cacheComponents` 활성화 상태)
- 보안·표시:
  - 응답 문자열에 HTML 태그와 개행이 섞여 오므로 서버에서 정리한 뒤 **텍스트로만 렌더링**합니다(`dangerouslySetInnerHTML` 금지).
  - 출처·수정일·"의사·약사 안내 우선" 문구를 표시합니다.
  - 병원 안내(`medications.caution`)와 식약처 원문은 화면에서 구분합니다.
- 장애 대비: 공공데이터포털 장애나 데이터 이관 사례가 있습니다(아래 참고 자료). API가 실패해도 약 목록은 기존 `Medication` 필드로 계속 표시되어야 합니다.

---

## 7. 데모 모드와 DB 모드 분리

1. **모드 스위치 (fail-closed)** — `src/lib/config.ts`
   - `NEXT_PUBLIC_CARELOG_DATA_MODE`가 없으면 `demo`
   - `supabase` 모드인데 URL·anon key가 없으면 **오류 화면을 띄웁니다.** 조용히 demo로 넘어가지 않습니다.
2. **구현체 분리** — `repository/index.ts`가 모드에 따라 local 또는 supabase 구현을 동적 import합니다. demo 번들에는 Supabase 클라이언트가 포함되지 않고, supabase 모드에서는 `mock-data`를 import하지 않습니다(`getMenu`도 메뉴 제공자로 분리).
3. **데모 전용 UI 격리** — 역할 전환 탭, 데모 데이터 초기화, 보라색 데모 배너를 `DemoControls`가 있을 때만 렌더링합니다. DB 모드에서는 로그인한 역할의 화면만 보입니다.
4. **Supabase 프로젝트 분리**
   - `carelog-dev` (클라우드 개발용, 10장 결정 6): `seed.sql`의 가상 데이터만 사용
   - `carelog-prod`: 시드 금지
   - 운영 DB에서 `demo_code is not null` 행이 0건인지 확인하는 점검 쿼리를 배포 체크리스트에 넣습니다.
5. **브라우저 저장소** — localStorage 키는 demo 전용(`carelog.demo-data.v1`)으로 유지합니다. **DB 모드에서는 건강정보를 localStorage에 캐시하지 않습니다**(메모리 캐시만, 세션은 `@supabase/ssr` 쿠키).
6. **실데이터 전 선행 과제 (법률 자문 아님, 체크리스트)**
   - 건강정보는 개인정보보호법상 민감정보입니다. 별도 동의, 접근 기록, 보관 기간, 국내 리전(Supabase `ap-northeast-2`)을 검토해야 합니다.
   - 이 단계 전까지는 가상 데이터만 사용합니다.

---

## 8. 변경 대상 파일

| 구분 | 파일 | 변경 내용 | 규모 |
| --- | --- | --- | --- |
| 수정 | `src/data/mock-data.ts` | 시드 시각을 ISO(UTC)로 통일 (B1) | 소 |
| 수정 | `src/lib/selectors.ts`, `src/lib/triage.ts`, `StaffDashboard.tsx` | 시각 정렬을 `Date.parse` 기반으로 변경, 요청 큐를 담당 환자로 필터 | 소 |
| 수정 | `src/lib/repository/local-storage.ts` | 상태 전이 가드 (B2), 재입원 처리 (B3), 낙관적 쓰기 공통화 | 중 |
| 수정 | `src/lib/repository/types.ts`, `index.ts` | `LoadState`, `Viewer`, `DemoControls`, 모드별 팩토리 | 중 |
| 수정 | `src/hooks/useCareLog.ts` | `LoadState` 구독, `useViewer()` 추가 | 소 |
| 수정 | `layout/CareLogApp.tsx` | `DEMO_*` 상수 대신 `Viewer` 사용, 로딩·오류 UI, demo 전용 컨트롤 | 중 |
| 수정 | 쓰기 호출 9개 컴포넌트 (1.6 표) | 대기 상태·오류 표시. 로직 변경은 거의 없음 | 소×9 |
| 신규 | `src/lib/config.ts` | 데이터 모드 설정 및 검증 | 소 |
| 신규 | `src/lib/repository/supabase.ts`, `src/lib/supabase/{client,server}.ts`, `src/proxy.ts` | Supabase 구현, 세션 갱신 | 대 |
| 신규 | `src/app/login/page.tsx` | 로그인 화면 (DB 모드) | 중 |
| 신규 | `src/lib/medication-info/*`, `src/app/api/medications/**/route.ts` | 제공자 구조 개편, 서버 호출 | 중 |
| 신규 | `supabase/migrations/0001~0006_*.sql`, `supabase/seed.sql`, `supabase/tests/*.sql` | 스키마, RLS, RPC, 가상 시드, RLS 테스트 | 대 |
| 신규 | `vitest.config.ts`, `src/**/*.test.ts`, `e2e/*.spec.ts` | 테스트 기반 | 중 |
| 수정 | `package.json`, `.env.example`, `README.md` | 의존성·스크립트, `NEXT_PUBLIC_CARELOG_DATA_MODE`, 문서 갱신 | 소 |
| 기존 유지 | `src/lib/medication-info.ts` | 새 모듈로 옮길 때까지 유지 (삭제하지 않음) | — |

---

## 9. 단계별 구현 계획과 테스트 기준

각 단계가 끝날 때마다 **공통 회귀 기준**을 통과해야 합니다.

- `npm run lint`, `npx tsc --noEmit`, `npm run build` 성공
- demo 모드 E2E 17개 항목 통과 (지난 작업에서 수동으로 실행한 Playwright 시나리오를 `e2e/`로 옮겨 자동화)
  - 모바일·PC 가로 스크롤 없음, 그래프 표시
  - 컨디션 저장, 통원↔입원 전환
  - 생활 요청 등록, 식사 변경 요청 대기 표시
  - 의료진 분류 표시, 요청 처리, 후속 조치 기록
  - 보호자 비공개 약 숨김, 새로고침 후 유지, 데모 초기화
  - 콘솔 오류 0건

| 단계 | 내용 | 완료 기준 (테스트) |
| --- | --- | --- |
| **1. 테스트 기반 + 작은 버그 수정** | vitest 도입, E2E 자동화, B1·B2·담당 필터 수정 | KST에서 새 요청이 맨 위에 표시됨 / `completed → received` 전이 거부 / 담당 아닌 환자의 요청이 큐에 없음 / triage 단위 테스트 (기존 분류 결과: P002 검토 대상, P004 변화 확인, P003 기록 부족) 통과 |
| **2. 데모·DB 모드 분리 + 비동기 계약** | `config.ts`, `Viewer`, `LoadState`, `DemoControls`, 낙관적 쓰기 (여전히 localStorage) | 지연 800ms 설정에서도 E2E 17항목 통과 / 쓰기 실패를 주입하면 롤백되고 오류 메시지 표시 / supabase 모드 + 환경변수 누락 시 오류 화면 (demo로 넘어가지 않음) |
| **3. 스키마·RLS·RPC** | migrations 0001~0006, 가상 `seed.sql` | 클라우드 개발용 프로젝트에 migration 순서대로 적용 성공 / 아래 **RLS 테스트 매트릭스** 전부 통과 |
| **4. Supabase Repository + 인증** | `supabase.ts`, 로그인, `proxy.ts`, Realtime | 역할별 가상 계정 3개로 로그인 시 각 화면 정상 / 의료진이 요청을 처리하면 환자 화면에 실시간 반영 / 같은 날짜 기록 저장 시 중복 없이 수정됨 / demo 모드 E2E 계속 통과 |
| **5. 식약처 연동** | 제공자 개편, Route Handler, 캐시 | 키가 클라이언트 번들에 없음 (빌드 산출물 grep) / API 장애를 흉내 내도 약 목록 표시 / 응답 HTML이 텍스트로 렌더링됨 / 캐시 적중 시 외부 호출 없음 |
| **6. 문서·운영 점검** | README, 배포 체크리스트 | 운영 DB 데모 행 0건 점검 쿼리, service role 키 노출 점검 |

### RLS 테스트 매트릭스 (3단계, 가상 계정으로 SQL 테스트)

- 환자 A는 환자 B의 `health_records`를 조회하면 0행
- 담당이 아닌 의료진은 해당 환자 조회 시 0행
- `records` 범위가 없는 보호자는 `health_records` 0행
- 보호자는 `visible_to_guardian = false`인 약을 볼 수 없음
- 철회된 grant(`revoked_at` 설정)는 즉시 접근 불가
- 환자가 `life_requests.status`를 직접 수정하면 거부됨. 등록 시 `status = 'completed'`도 거부됨
- 환자는 `profiles.role`을 수정할 수 없음
- `advance_request_status`: 역행 거부, 식사 변경 요청 완료 시 `meal_logs.meal_type`이 같은 트랜잭션에서 반영됨
- `health_records`에 같은 날짜로 upsert하면 1행만 유지됨
- `set_care_mode`: 재입원 시 새 `admissions` 행이 생성되고 이전 입원은 종료일을 유지함
- 일반 가입자는 가입 시 `staff`가 될 수 없고, 가입 후 `profiles.role`을 바꿀 수 없음 (UPDATE 거부)
- 이메일 미확인 계정은 로그인 불가
- `shared_with_staff = false`인 진료 질문은 담당 의료진에게도 0행
- 환자는 `staff_reviews`는 조회되지만 `staff_review_notes`는 0행
- 다른 이메일로 로그인한 사용자는 초대를 수락할 수 없음. 철회·만료된 초대도 수락 불가

---

## 10. 확정된 설계 결정 (2026-11-11)

| # | 항목 | 결정 | 반영 위치 |
| --- | --- | --- | --- |
| 1 | 입원 모드 전환 | **환자 본인이 전환 가능**(현행 유지). 단 "자기기록 모드 · 공식 입원 확인 아님"으로 구분해 표시. 재입원 시 **새 admission 이력**을 만들고 과거 입원은 보존 | 3.3 `admissions.source`, 4.2, 1단계 D |
| 2 | 보호자 약 공개 | 기본 **비공개**. 환자가 명시적으로 허용한 약만 보호자가 조회 | 3.3 `medications.visible_to_guardian default false`, 4.4 |
| 3 | 보호자 승인 | **환자가 직접 초대**(이메일)하고 공유 범위를 승인·변경·철회 | 3.3 `guardian_invitations`, `access_grants`, 4.4 |
| 4 | 열람 범위 | 진료 질문 메모는 **기본 본인만**, 환자가 공유한 질문만 의료진 열람. 의료진 검토 **상태는 환자에게 공개**, **내부 메모는 비공개** | 3.3 `visit_questions.shared_with_staff`, `staff_reviews` / `staff_review_notes` 분리, 4.4 |
| 5 | 로그인 | Supabase Auth **이메일·비밀번호 + 이메일 확인**. 의료진 권한은 일반 가입자가 선택·변경 불가 | 4.1 |
| 6 | Supabase 환경 | Docker·CLI가 없으므로 **클라우드 개발용 프로젝트**를 사용. SQL migration은 Git으로 관리 | 3.4 |

후속 메모:

- 결정 2(약 기본 비공개)는 2단계에서 가상 데이터에도 적용합니다. 1단계는 "기존 UI·기능 유지" 범위라 현재 가상 데이터 값은 바꾸지 않습니다.
- 결정 3·4의 화면(초대, 질문 공유 토글, 검토 상태 표시)은 DB 연동과 함께 2단계 이후에 구현합니다. 1단계에서는 범위를 넓히지 않습니다.

---

## 11. 이번 점검의 검증 결과

| 명령 | 결과 |
| --- | --- |
| `npm run lint` | 통과 (exit 0, 경고 없음) |
| `npx tsc --noEmit` | 통과 (exit 0) |
| `npm run build` | 통과 (exit 0) — Compiled successfully, TypeScript 완료, `/` 정적 프리렌더 |
| B1 재현 스크립트 | `TZ=Asia/Seoul`에서 정렬 역전 확인 |
| `MedicationInfoProvider` 사용처 | 0건 (grep) |

## 참고 자료

- [공공데이터포털 — 식품의약품안전처_의약품개요정보(e약은요) (15075057)](https://www.data.go.kr/data/15075057/openapi.do)
- [공공데이터포털 — 식품의약품안전처_의약품 제품 허가정보 (15095677)](https://www.data.go.kr/data/15095677/openapi.do)
- [WikiDocs — e약은요 API 활용 예시 (공공데이터 장애 관련 주의 문구 포함)](https://wikidocs.net/297482)
