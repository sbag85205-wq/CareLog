# CareLog (케어로그)

통원·입원 환자를 위한 **통합 건강기록 및 의료 소통 웹앱 프로토타입** — AX 액션러닝 개인 프로젝트

> ⚠️ **프로토타입 / 가상 데이터 전용**
> 화면의 모든 환자·약품·기록은 개발 시연용 가상 데이터입니다. 실제 로그인·접근제어·병원 EMR·의약품 API는 연결되어 있지 않으며,
> 실제 환자정보나 건강정보를 입력하지 마세요. 응급 상황용 서비스가 아닙니다.

## 주요 기능

| 역할 (상단 데모 전환) | 기능 |
| --- | --- |
| **환자 · 통원 모드** | 오늘의 컨디션 기록(컨디션·통증·피로·수면·식사량·소화·증상·메모), 7일/30일 그래프, 30일 기록 달력(미기록일 표시)·날짜별 수정, 내 약 정보, 진료 준비(다음 진료일·2주 요약·질문 메모) |
| **환자 · 입원 모드** | 통원 기능 + 오늘의 식사(메뉴·섭취량·소화 체크·식사 형태 변경 요청), 생활 요청(물·침구·식사 변경·기타, 접수→직원 확인→처리 완료), 통원→입원 기록 연속 그래프 |
| **간호사·의료진** | 담당 환자 목록, 30일 평균 컨디션·기록 일수, 시연용 분류(검토 대상/변화 확인/기록 부족), 환자별 30일 그래프·기록 검토, 후속 조치(확인 완료/진료 상담 필요), 생활 요청 처리 |
| **보호자** | 승인된 환자만 조회: 최근 컨디션·기록 요약·허용된 약·입원 식사·생활 요청 상태 (조회 전용) |

통원·입원 모드에서 작성한 기록은 모두 같은 환자 ID에 누적되며, 각 기록에 작성 당시 모드(`recordedIn`)가 남습니다.

### 의료진 분류 기준 (개발 시연용 — 의료적 판정 아님)

- **검토 대상**: 최근 30일 평균 컨디션 ≤ 2.0 이고 기록 10일 이상
- **기록 부족**: 최근 30일 기록 10일 미만 또는 최근 7일 기록 3일 미만
- **변화 확인**: 최근 7일 평균과 이전(8~30일) 평균 차이 ≥ 1.5

점수만으로 응급 대응·진료 변경을 자동 결정하지 않습니다. 기준값은 `src/lib/triage.ts`의 `TRIAGE_RULES`에 있습니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Lucide React · Recharts · npm

## 실행 방법

```bash
npm install
npm run dev                 # http://localhost:3000
npm run dev -- -p 3333      # 포트 지정 (공유 서버에서 3000이 사용 중일 때)

npm run lint                # ESLint
npx tsc --noEmit            # 타입 검사
npm test                    # 단위 테스트 (Vitest)
npm run test:e2e            # 사용자 흐름 테스트 (Playwright, 개발 서버 자동 실행 · 기본 포트 3334, E2E_PORT로 변경)
npm run build && npm start  # 프로덕션 빌드/실행
```

`npm run test:e2e`는 Chromium을 프로젝트 `node_modules` 안에 설치하고, 시스템 라이브러리가 없는 서버(root 권한 없음)에서는
필요한 라이브러리를 `.e2e-libs/`(Git 제외)에 풀어서 사용합니다.

### DB 전환 대비 — 가상 네트워크 지연·실패 재현 (개발 서버 전용)

브라우저 개발자 도구 콘솔에서 설정한 뒤 새로고침합니다. 프로덕션 빌드에서는 무시됩니다.

```js
localStorage.setItem("carelog.dev.latencyMs", "1500"); // 모든 저장에 1.5초 지연
localStorage.setItem("carelog.dev.failWrites", "1");   // 모든 저장 실패 (복구·오류 안내 확인)
localStorage.removeItem("carelog.dev.latencyMs"); localStorage.removeItem("carelog.dev.failWrites"); // 해제
```

원격 서버(SSH)에서 실행할 경우 VS Code의 **포트(Ports) 탭**에서 해당 포트를 포워딩하거나,
로컬 터미널에서 `ssh -L 3333:localhost:3333 <서버>` 후 브라우저에서 `http://localhost:3333`에 접속합니다.

상단 **데모 데이터 초기화** 버튼으로 가상 데이터를 처음 상태로 되돌릴 수 있습니다.

### 환자 로그인 (DB 연동 시험, carelog-dev)

| 경로 | 내용 |
| --- | --- |
| `/` | 기존 가상 데이터 데모 (localStorage, 로그인 없음) |
| `/login` | **처음 이용하기**(환자 코드 + 생년월일 8자리 → 새 비밀번호) / **로그인**(환자 코드 + 비밀번호) |
| `/my` | 로그인한 가상 환자의 오늘 컨디션 기록·기록 조회 (Supabase 저장, 같은 한국 날짜는 1건 수정) |

- Supabase 설정이 없으면 `/login`은 "설정 없음" 안내만 표시합니다.
- 준비 절차는 [supabase/README.md](supabase/README.md)의 "3단계"를 따릅니다.
- `npm run test:db` 는 PGlite에서 migration·RLS·로그인 흐름을 검증합니다.

## 폴더 구조

```text
src/
├── app/                    # layout.tsx, page.tsx, globals.css
├── components/
│   ├── layout/             # CareLogApp(역할 전환 셸), AppHeader, 안내문
│   ├── dashboard/          # PatientDashboard(모드 전환·탭), VisitPrep
│   ├── health/             # ConditionForm, HealthChart, HealthHistory
│   ├── medication/         # MedicationList
│   ├── inpatient/          # MealTracker, LifeRequestPanel, RequestStatusSteps
│   ├── medical-staff/      # StaffDashboard, TriageBadge
│   ├── guardian/           # GuardianDashboard
│   └── ui/                 # 공통 카드·버튼·선택 버튼 등
├── data/mock-data.ts       # 가상 데이터 생성 (오늘 기준 상대 날짜, 시드 고정)
├── types/index.ts          # 도메인 타입 (DB 스키마 초안) — 시각은 UTC ISO 8601, 날짜는 한국(Asia/Seoul) 기준
├── lib/
│   ├── repository/         # 데이터 접근 계층 (인터페이스 + localStorage 구현 + 버전 마이그레이션)
│   ├── domain/             # 상태 전이·입원 이력 규칙 (DB 함수로 옮길 대상)
│   ├── selectors.ts        # 조회 로직 (향후 DB 쿼리로 대체)
│   ├── triage.ts           # 시연용 분류 기준
│   ├── medication-info.ts  # 의약품 정보 제공자 인터페이스 (식약처 API 대비)
│   ├── date.ts, labels.ts
└── hooks/useCareLog.ts     # useSyncExternalStore 기반 데이터 구독
```

## 데이터 계층 설계

- 화면은 `CareLogRepository` 인터페이스(`src/lib/repository/types.ts`)만 사용합니다.
- 현재 구현: `local-storage.ts` (브라우저 localStorage, 가상 데이터 전용)
- Supabase 전환 시 같은 인터페이스로 `supabase.ts`를 구현하고 `src/lib/repository/index.ts`에서 교체합니다.
- 접근 권한은 `AccessGrant`(환자·피부여자·범위) 및 `Medication.visibleToGuardian`으로 모델링되어 있으며,
  현재는 프론트엔드 필터링일 뿐 **실제 보안 기능이 아닙니다**. 실제 서비스에서는 Supabase RLS로 서버에서 강제해야 합니다.

Supabase 전환 분석·설계와 단계별 계획은 [docs/supabase-migration-plan.md](docs/supabase-migration-plan.md)에 있습니다.

## 다음 단계

1. **Supabase 스키마**: `types/index.ts`를 기준으로 `patients`, `health_records(unique patient_id+date)`, `medications`,
   `meal_logs`, `life_requests`, `staff_reviews`, `access_grants`, `profiles(role)` 테이블 생성
2. **Supabase Auth + RLS**: 환자는 본인 행만, 의료진은 `assigned_staff` 환자만, 보호자는 `access_grants` 범위만 조회하도록 정책 작성
3. **Repository 교체**: `createSupabaseRepository()` 구현 → 역할 전환 데모 메뉴를 실제 로그인으로 대체
4. **식약처 공공데이터 API**: 서버 Route Handler(`/api/medications/[itemSeq]`)에서 `MFDS_API_KEY`로 e약은요 API 호출,
   `MedicationInfoProvider` 구현 추가 (키는 클라이언트에 노출 금지)
5. 생활 요청 실시간 알림(Supabase Realtime), 감사 로그, 개인정보 처리 동의 화면
