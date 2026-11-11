-- ============================================================================
-- CareLog migration 2/6 — 환자·입원 이력·담당 의료진·보호자 초대/승인
-- 모든 테이블: RLS 활성화 + anon/authenticated 기본 권한 제거 (권한은 5/6에서 최소로 부여)
-- ============================================================================

-- ── patients ───────────────────────────────────────────────────────────────
create table public.patients (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid unique references public.profiles (id) on delete set null,
  display_name    text not null check (char_length(display_name) between 1 and 50),
  birth_year      smallint check (birth_year between 1900 and 2100),
  sex             text check (sex in ('M', 'F')),
  department      text not null default '' check (char_length(department) <= 50),
  care_mode       public.care_mode not null default 'outpatient',
  next_visit_date date,
  demo_code       text unique check (demo_code ~ '^[A-Z]{1,3}[0-9]{3}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.patients.id is '환자 UUID (앱 내부 식별자)';
comment on column public.patients.demo_code is '가상 데이터 식별자 (예: P001). 실제 환자는 null — UUID와 분리';
comment on column public.patients.care_mode is '환자 자기기록 모드. 병원의 공식 입원 확인이 아님';

alter table public.patients enable row level security;
revoke all on table public.patients from anon, authenticated;
create trigger patients_set_updated_at before update on public.patients
  for each row execute function private.set_updated_at();

-- ── admissions: 입원 이력 (재입원 = 새 행, 과거 행 보존) ─────────────────────
create table public.admissions (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  ward          text not null check (char_length(ward) between 1 and 50),
  room          text not null check (char_length(room) between 1 and 20),
  admitted_on   date not null,
  discharged_on date,
  source        public.admission_source not null default 'self_reported',
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint admissions_discharge_after_admit check (discharged_on is null or discharged_on >= admitted_on)
);
-- 진행 중인 입원은 환자당 1건
create unique index admissions_one_open_per_patient on public.admissions (patient_id) where discharged_on is null;
create index admissions_patient_admitted on public.admissions (patient_id, admitted_on desc);

alter table public.admissions enable row level security;
revoke all on table public.admissions from anon, authenticated;

-- ── staff_assignments: 담당 의료진 관계 ─────────────────────────────────────
create table public.staff_assignments (
  patient_id  uuid not null references public.patients (id) on delete cascade,
  staff_id    uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (patient_id, staff_id)
);
create index staff_assignments_staff on public.staff_assignments (staff_id);

alter table public.staff_assignments enable row level security;
revoke all on table public.staff_assignments from anon, authenticated;

create function private.ensure_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.staff_id and role = 'staff') then
    raise exception 'invalid_input: 의료진 계정만 담당자로 지정할 수 있습니다' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger staff_assignments_staff_only before insert or update on public.staff_assignments
  for each row execute function private.ensure_staff_profile();

-- ── guardian_invitations: 환자가 보호자를 이메일로 초대 ────────────────────
create table public.guardian_invitations (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  invitee_email text not null
    check (invitee_email = lower(invitee_email) and invitee_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  scopes        public.access_scope[] not null check (cardinality(scopes) > 0),
  token_hash    text not null unique,  -- 초대 토큰은 해시만 저장 (원문은 초대 생성 시 1회만 반환)
  status        public.invitation_status not null default 'pending',
  expires_at    timestamptz not null default (now() + interval '7 days'),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  accepted_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create index guardian_invitations_patient on public.guardian_invitations (patient_id);

alter table public.guardian_invitations enable row level security;
revoke all on table public.guardian_invitations from anon, authenticated;

-- ── access_grants: 승인된 보호자 접근 범위 ──────────────────────────────────
create table public.access_grants (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  grantee_id    uuid not null references public.profiles (id) on delete cascade,
  scopes        public.access_scope[] not null check (cardinality(scopes) > 0),
  invitation_id uuid references public.guardian_invitations (id) on delete set null,
  approved_at   timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (patient_id, grantee_id)
);
create index access_grants_active_grantee on public.access_grants (grantee_id) where revoked_at is null;

alter table public.access_grants enable row level security;
revoke all on table public.access_grants from anon, authenticated;
