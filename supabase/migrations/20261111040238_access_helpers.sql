-- ============================================================================
-- CareLog migration 3/6 — 권한 판별 함수 (RLS 정책에서 사용)
--
-- * security definer: 판별용 조회가 다른 테이블의 RLS에 막히거나 정책이 서로를 재귀 호출하는 것을 방지
-- * set search_path = '' + 모든 객체 스키마 명시: search_path 조작 공격 방지
-- * 모두 "현재 로그인 사용자(auth.uid())"에 대한 판별만 함 — 다른 사용자 정보는 반환하지 않음
-- ============================================================================

create function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'
  )
$$;

-- 이 환자가 로그인한 본인인가
create function private.is_patient_self(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients
    where id = p_patient_id and profile_id = (select auth.uid())
  )
$$;

-- 로그인한 의료진에게 배정된 환자인가
create function private.is_assigned_staff(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.profiles pr on pr.id = sa.staff_id and pr.role = 'staff'
    where sa.patient_id = p_patient_id and sa.staff_id = (select auth.uid())
  )
$$;

-- 로그인한 보호자가 이 환자의 해당 범위를 승인받았는가 (철회되지 않은 grant)
create function private.guardian_has(p_patient_id uuid, p_scope public.access_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.access_grants
    where patient_id = p_patient_id
      and grantee_id = (select auth.uid())
      and revoked_at is null
      and p_scope = any (scopes)
  )
$$;

create function private.has_active_grant(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.access_grants
    where patient_id = p_patient_id and grantee_id = (select auth.uid()) and revoked_at is null
  )
$$;

-- 생활 요청 상태 전이 규칙 (앱 src/lib/domain/request-status.ts 와 동일)
create function private.next_request_status(p_status public.request_status)
returns public.request_status
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'received' then 'acknowledged'::public.request_status
    when 'acknowledged' then 'completed'::public.request_status
    else null
  end
$$;
