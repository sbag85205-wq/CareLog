-- ============================================================================
-- CareLog migration 9 — 관리자 발급 아이디 로그인: 계정 비활성화 · 관리자 목록
--
-- * 기존 migration(1~8)은 수정하지 않습니다. 기존 데이터는 그대로이며 새 컬럼은 null(활성)로 시작합니다.
-- * 환자 로그인 아이디는 Supabase Auth 계정의 이메일(아이디@id.carelog.invalid)로 관리합니다.
--   → 아이디를 붙이거나 바꿔도 Auth 사용자 ID·환자 ID·비밀번호·모든 기록이 그대로 이어집니다 (DB 변경 없음).
-- * 비활성화(profiles.disabled_at): 권한 판별 함수가 모두 "활성 계정"을 요구
--   → 이미 로그인한 기기의 토큰이 남아 있어도 다음 조회부터 RLS가 즉시 차단
--   (서버는 Supabase Auth 로그인 차단(ban)도 함께 설정해 새 로그인·토큰 갱신을 막음)
-- * 관리자(admin_users): 행 추가·삭제는 service_role(서버 키)만. 관리자는 RLS로 환자 데이터를 직접 읽지 않고,
--   서버가 관리자 여부를 확인한 뒤 서버 키로만 계정을 관리합니다.
-- ============================================================================

-- ── 계정 비활성화 ─────────────────────────────────────────────────────────
alter table public.profiles add column disabled_at timestamptz;
comment on column public.profiles.disabled_at is
  '비활성화 시각 (null = 활성). 서버 키로만 변경 — 일반 사용자는 UPDATE 컬럼 권한 없음';

-- ── 관리자 목록 ───────────────────────────────────────────────────────────
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.admin_users is 'CareLog 관리자 계정. 추가·삭제는 서버 키(service_role)만';
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
create policy admin_users_select_self on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));  -- 본인이 관리자인지 확인하는 용도만 (다른 관리자 목록은 안 보임)

-- ── 활성 계정 판별 ────────────────────────────────────────────────────────
create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and disabled_at is null
  )
$$;
revoke execute on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated;

-- ── 권한 판별 함수: 모두 활성 계정만 (본문은 기존과 같고 조건만 추가) ─────────
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff' and disabled_at is null
  )
$$;

create or replace function private.is_patient_self(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.patients p
    where p.id = p_patient_id
      and p.profile_id = (select auth.uid())
      and not exists (
        select 1 from private.patient_credentials c
        where c.patient_id = p.id and c.password_set_at is null
      )
  )
$$;

create or replace function private.is_assigned_staff(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.profiles pr on pr.id = sa.staff_id and pr.role = 'staff' and pr.disabled_at is null
    where sa.patient_id = p_patient_id and sa.staff_id = (select auth.uid())
  )
$$;

create or replace function private.guardian_has(p_patient_id uuid, p_scope public.access_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.access_grants
    where patient_id = p_patient_id
      and grantee_id = (select auth.uid())
      and revoked_at is null
      and p_scope = any (scopes)
  )
$$;

create or replace function private.has_active_grant(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.access_grants
    where patient_id = p_patient_id and grantee_id = (select auth.uid()) and revoked_at is null
  )
$$;

-- ── auth.uid()를 직접 쓰던 정책도 활성 계정만 ─────────────────────────────
drop policy access_grants_select on public.access_grants;
create policy access_grants_select on public.access_grants for select to authenticated
  using (private.is_patient_self(patient_id) or (grantee_id = (select auth.uid()) and private.is_active_user()));

drop policy staff_assignments_select on public.staff_assignments;
create policy staff_assignments_select on public.staff_assignments for select to authenticated
  using ((staff_id = (select auth.uid()) and private.is_active_user()) or private.is_patient_self(patient_id));

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and private.is_active_user())
  with check (id = (select auth.uid()));

-- ── 초대 수락도 활성 계정만 (본문은 migration 6과 같고 첫 검사만 추가) ────────
create or replace function public.accept_guardian_invitation(p_token text)
returns public.access_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_inv public.guardian_invitations;
  v_grant public.access_grants;
begin
  if v_uid is null or not private.is_active_user() then
    raise exception 'forbidden: 로그인이 필요합니다' using errcode = '42501';
  end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then
    raise exception 'forbidden: 이메일 확인을 마친 계정만 초대를 수락할 수 있습니다' using errcode = '42501';
  end if;

  select * into v_inv from public.guardian_invitations
    where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    for update;
  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invalid_input: 유효하지 않거나 만료된 초대입니다' using errcode = '22023';
  end if;
  if v_inv.invitee_email <> v_email then
    raise exception 'forbidden: 초대받은 이메일 계정으로 로그인해야 합니다' using errcode = '42501';
  end if;
  if private.is_patient_self(v_inv.patient_id) then
    raise exception 'forbidden: 본인 정보의 보호자가 될 수 없습니다' using errcode = '42501';
  end if;

  insert into public.access_grants (patient_id, grantee_id, scopes, invitation_id)
  values (v_inv.patient_id, v_uid, v_inv.scopes, v_inv.id)
  on conflict (patient_id, grantee_id) do update set
    scopes = excluded.scopes, invitation_id = excluded.invitation_id, approved_at = now(), revoked_at = null
  returning * into v_grant;

  update public.guardian_invitations
    set status = 'accepted', accepted_by = v_uid, responded_at = now()
    where id = v_inv.id;

  return v_grant;
end
$$;

-- ── 이전 방식(환자 코드) 환자: 관리자가 비밀번호를 정하면 "설정 완료"로 표시 ──
-- 비밀번호를 한 번도 정하지 않은 코드 방식 환자도 관리자 재설정 후 바로 본인 기록을 쓸 수 있게 함
create function public.svc_mark_password_set(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.patient_credentials
    set password_set_at = coalesce(password_set_at, now()),
        login_failures = 0,
        login_locked_until = null
    where patient_id = p_patient_id;
end
$$;
revoke execute on function public.svc_mark_password_set(uuid) from public, anon, authenticated;
grant execute on function public.svc_mark_password_set(uuid) to service_role;
