-- ============================================================================
-- CareLog migration 1/6 — 기반: 스키마, 열거형, 공용 함수, profiles
--
-- * 가상 데이터 전용 개발 프로젝트 기준. 운영 프로젝트 적용은 별도 승인 후.
-- * 설계 근거: docs/supabase-migration-plan.md 3·4·10장
-- * 오류 메시지 규칙: '<코드>: <안내 문구>' (코드: forbidden, not_found, invalid_input,
--   invalid_transition, stale_state) — 앱의 CareLogError 코드와 1:1 대응
-- ============================================================================

-- 내부 전용 스키마: API(PostgREST)에 노출되지 않음. 권한 판별 함수·트리거 함수 보관
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
-- Supabase Auth가 auth.users에 행을 넣을 때 실행되는 트리거 함수가 private 스키마에 있음
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
  end if;
end $$;
alter default privileges in schema private revoke execute on functions from public;

-- ── 열거형 (앱 src/types/index.ts 값과 1:1) ─────────────────────────────────
create type public.app_role          as enum ('patient', 'guardian', 'staff');
create type public.care_mode         as enum ('outpatient', 'inpatient');
create type public.digestion         as enum ('good', 'normal', 'bloated', 'heartburn', 'nausea', 'bowel');
create type public.meal_slot         as enum ('breakfast', 'lunch', 'dinner');
create type public.meal_type         as enum ('regular', 'porridge', 'soft', 'liquid');
create type public.request_category  as enum ('water', 'bedding', 'meal_change', 'other');
create type public.request_status    as enum ('received', 'acknowledged', 'completed');
create type public.review_action     as enum ('checked', 'consult_needed');
create type public.access_scope      as enum ('records', 'medications', 'meals', 'requests');
create type public.med_source        as enum ('manual', 'mfds_easy', 'mfds_permit');
create type public.admission_source  as enum ('self_reported', 'hospital_confirmed');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ── 공용 함수 ───────────────────────────────────────────────────────────────
-- 일일 기록·입원일 등 "오늘"은 항상 한국 날짜
create function private.today_kst()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ── profiles: auth.users 1:1 ────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.app_role not null default 'patient',
  display_name text not null default '' check (char_length(display_name) <= 50),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is '로그인 계정 프로필. role은 관리자만 변경 (일반 가입자는 항상 patient)';

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- 가입 시 프로필 생성 — 역할은 가입 정보(user_metadata)와 무관하게 항상 patient
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'patient', left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 50));
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 역할·ID 변경 차단 (컬럼 권한과 별개로 한 번 더 막는 방어선)
create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'forbidden: 계정 ID는 바꿀 수 없습니다' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and current_user in ('anon', 'authenticated') then
    raise exception 'forbidden: 역할은 관리자만 변경할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- 관리자 전용: 의료진 권한 부여/회수. service_role(대시보드 SQL·서버 관리 스크립트)만 실행 가능
create function private.admin_set_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'not_found: 프로필이 없습니다' using errcode = 'P0002';
  end if;
end
$$;
