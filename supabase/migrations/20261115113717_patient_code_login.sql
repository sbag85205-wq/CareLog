-- ============================================================================
-- CareLog migration 7 — 환자 코드 로그인 (3단계)
--
-- 흐름: 미리 발급한 환자 코드 + 생년월일로 최초 확인 → 일회용 설정 권한(짧은 유효기간)
--       → 비밀번호 설정 (Supabase Auth) → 이후 환자 코드 + 비밀번호로 로그인
--
-- 원칙
-- * 로그인 코드·생년월일·설정 토큰은 API에 노출되지 않는 private 스키마에 보관
--   (코드·토큰은 SHA-256 해시만 저장, 원문은 발급 시 1회만 전달)
-- * 아래 svc_* 함수는 service_role(서버 전용 키)만 실행 가능. anon/authenticated는 호출 불가
--   → 브라우저에서 코드나 환자 ID를 보내 계정에 연결하는 경로가 없음
-- * 실패 응답은 이유와 관계없이 {"ok": false} 하나 — 코드 존재·생년월일 일치 여부를 드러내지 않음
--   (오류를 raise하지 않아 실패 횟수 기록이 롤백되지 않음)
-- * 비밀번호 검증·세션 발급은 Supabase Auth가 담당 (이 DB에는 비밀번호를 저장하지 않음)
-- ============================================================================

-- ── 내부 도우미 ─────────────────────────────────────────────────────────────
create function private.hash_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_value, ''), 'UTF8')), 'hex')
$$;

-- 입력 정규화: 공백·하이픈 제거, 대문자 (예: "cl7k-q2mx-9vtd" → "CL7KQ2MX9VTD")
create function private.normalize_login_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

-- ── 로그인 자격 정보 (환자당 1건) ────────────────────────────────────────────
create table private.patient_credentials (
  patient_id          uuid primary key references public.patients (id) on delete cascade,
  login_code_hash     text not null unique check (login_code_hash ~ '^[0-9a-f]{64}$'),
  birth_date          date not null check (birth_date between date '1900-01-01' and date '2100-12-31'),
  password_set_at     timestamptz,  -- null = 아직 비밀번호 미설정 (최초 확인만 가능)
  verify_failures     smallint not null default 0,
  verify_locked_until timestamptz,
  login_failures      smallint not null default 0,
  login_locked_until  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table private.patient_credentials enable row level security;
revoke all on table private.patient_credentials from public, anon, authenticated;
create trigger patient_credentials_set_updated_at before update on private.patient_credentials
  for each row execute function private.set_updated_at();

-- ── 비밀번호 설정용 일회용 권한 ─────────────────────────────────────────────
create table private.password_setup_tokens (
  token_hash   text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  expires_at   timestamptz not null,
  claimed_at   timestamptz,  -- 설정 진행 중 (동시 제출 차단)
  completed_at timestamptz,  -- 설정 완료 (재사용 불가)
  created_at   timestamptz not null default now()
);
create index password_setup_tokens_patient on private.password_setup_tokens (patient_id);
alter table private.password_setup_tokens enable row level security;
revoke all on table private.password_setup_tokens from public, anon, authenticated;

-- ── 방어선: 비밀번호 설정 전 환자는 세션이 있어도 본인 기록 권한 없음 ─────────
-- (함수 시그니처·권한은 migration 3과 동일하게 유지, 판별 조건만 추가)
create or replace function private.is_patient_self(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient_id
      and p.profile_id = (select auth.uid())
      and not exists (
        select 1 from private.patient_credentials c
        where c.patient_id = p.id and c.password_set_at is null
      )
  )
$$;

-- ── 환자는 서버가 발급 (가입자의 환자 프로필 자가 생성 경로 제거) ─────────────
-- 공개 가입이 켜져 있으면 누구나 계정을 만들고 이 함수로 환자 행을 만들 수 있었음
revoke execute on function public.create_my_patient_profile(text, smallint, text) from authenticated;

-- ============================================================================
-- 서버 전용 함수 (service_role만 실행)
-- ============================================================================

-- 가상 환자에게 로그인 코드 등록 (발급 스크립트용)
create function public.svc_register_patient_credential(
  p_patient_id uuid,
  p_login_code text,
  p_birth_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := private.normalize_login_code(p_login_code);
begin
  if char_length(v_code) < 10 then
    raise exception 'invalid_input: 로그인 코드는 10자 이상이어야 합니다' using errcode = '22023';
  end if;
  if not exists (select 1 from public.patients where id = p_patient_id and profile_id is not null) then
    raise exception 'invalid_input: 로그인 계정이 연결된 환자가 아닙니다' using errcode = '22023';
  end if;
  if p_birth_date is null or p_birth_date > private.today_kst() then
    raise exception 'invalid_input: 생년월일이 올바르지 않습니다' using errcode = '22023';
  end if;
  insert into private.patient_credentials (patient_id, login_code_hash, birth_date)
  values (p_patient_id, private.hash_text(v_code), p_birth_date);
end
$$;

-- 최초 확인: 코드 + 생년월일 → 일회용 설정 권한
create function public.svc_verify_first_access(
  p_login_code text,
  p_birth_date date,
  p_ttl_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred private.patient_credentials;
  v_token text;
  v_expires timestamptz;
  c_max_failures constant smallint := 5;
  c_lock constant interval := interval '15 minutes';
begin
  select * into v_cred from private.patient_credentials
    where login_code_hash = private.hash_text(private.normalize_login_code(p_login_code))
    for update;

  if v_cred.patient_id is null then
    return jsonb_build_object('ok', false);
  end if;
  if v_cred.verify_locked_until is not null and v_cred.verify_locked_until > now() then
    return jsonb_build_object('ok', false);
  end if;
  if v_cred.password_set_at is not null then
    -- 설정 완료 후에는 최초 확인을 다시 쓸 수 없음 (생년월일로 비밀번호 덮어쓰기 차단)
    return jsonb_build_object('ok', false);
  end if;
  if p_birth_date is distinct from v_cred.birth_date then
    update private.patient_credentials
      set verify_failures = verify_failures + 1,
          verify_locked_until = case when verify_failures + 1 >= c_max_failures then now() + c_lock end
      where patient_id = v_cred.patient_id;
    return jsonb_build_object('ok', false);
  end if;

  update private.patient_credentials
    set verify_failures = 0, verify_locked_until = null
    where patient_id = v_cred.patient_id;
  -- 이전에 발급한 미완료 권한은 무효화 (가장 최근 확인만 유효)
  delete from private.password_setup_tokens where patient_id = v_cred.patient_id and completed_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 600), 60), 1800));
  insert into private.password_setup_tokens (token_hash, patient_id, expires_at)
  values (private.hash_text(v_token), v_cred.patient_id, v_expires);

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
end
$$;

-- 비밀번호 설정 시작: 권한을 "진행 중"으로 잠금 (동시 제출 중 하나만 통과)
create function public.svc_begin_password_setup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok private.password_setup_tokens;
  v_uid uuid;
begin
  select * into v_tok from private.password_setup_tokens
    where token_hash = private.hash_text(p_token)
    for update;
  if v_tok.token_hash is null or v_tok.completed_at is not null or v_tok.claimed_at is not null
     or v_tok.expires_at <= now() then
    return jsonb_build_object('ok', false);
  end if;
  if exists (select 1 from private.patient_credentials
             where patient_id = v_tok.patient_id and password_set_at is not null) then
    return jsonb_build_object('ok', false);
  end if;
  select profile_id into v_uid from public.patients where id = v_tok.patient_id;
  if v_uid is null then
    return jsonb_build_object('ok', false);
  end if;

  update private.password_setup_tokens set claimed_at = now() where token_hash = v_tok.token_hash;
  return jsonb_build_object('ok', true, 'auth_user_id', v_uid);
end
$$;

-- 비밀번호 설정 완료 (Auth 비밀번호 변경 성공 후 호출) → 이후 최초 확인 불가
create function public.svc_complete_password_setup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok private.password_setup_tokens;
  v_email text;
begin
  select * into v_tok from private.password_setup_tokens
    where token_hash = private.hash_text(p_token)
    for update;
  if v_tok.token_hash is null or v_tok.claimed_at is null or v_tok.completed_at is not null then
    return jsonb_build_object('ok', false);
  end if;

  update private.patient_credentials
    set password_set_at = now(), login_failures = 0, login_locked_until = null
    where patient_id = v_tok.patient_id;
  update private.password_setup_tokens set completed_at = now() where token_hash = v_tok.token_hash;
  delete from private.password_setup_tokens where patient_id = v_tok.patient_id and completed_at is null;

  select u.email into v_email
    from public.patients p join auth.users u on u.id = p.profile_id
    where p.id = v_tok.patient_id;
  return jsonb_build_object('ok', true, 'email', v_email);
end
$$;

-- 비밀번호 저장 실패 시 되돌리기 → 유효기간 안에서 다시 시도 가능
create function public.svc_abort_password_setup(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.password_setup_tokens
    set claimed_at = null
    where token_hash = private.hash_text(p_token) and completed_at is null;
end
$$;

-- 일반 로그인: 코드 → Auth 로그인 이메일 (설정 완료·잠금 아님일 때만, 서버에서만 조회)
create function public.svc_login_lookup(p_login_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select u.email into v_email
    from private.patient_credentials c
    join public.patients p on p.id = c.patient_id
    join auth.users u on u.id = p.profile_id
    where c.login_code_hash = private.hash_text(private.normalize_login_code(p_login_code))
      and c.password_set_at is not null
      and (c.login_locked_until is null or c.login_locked_until <= now());
  if v_email is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'email', v_email);
end
$$;

-- 로그인 결과 기록 (연속 실패 5회 → 15분 잠금, 성공 시 초기화)
create function public.svc_record_login_result(p_login_code text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_success then
    update private.patient_credentials
      set login_failures = 0, login_locked_until = null
      where login_code_hash = private.hash_text(private.normalize_login_code(p_login_code));
  else
    update private.patient_credentials
      set login_failures = login_failures + 1,
          login_locked_until = case when login_failures + 1 >= 5 then now() + interval '15 minutes' end
      where login_code_hash = private.hash_text(private.normalize_login_code(p_login_code));
  end if;
end
$$;

-- ── 실행 권한: 새 함수는 모두 service_role 전용 ─────────────────────────────
revoke execute on function
  private.hash_text(text),
  private.normalize_login_code(text)
from public, anon, authenticated;

revoke execute on function
  public.svc_register_patient_credential(uuid, text, date),
  public.svc_verify_first_access(text, date, integer),
  public.svc_begin_password_setup(text),
  public.svc_complete_password_setup(text),
  public.svc_abort_password_setup(text),
  public.svc_login_lookup(text),
  public.svc_record_login_result(text, boolean)
from public, anon, authenticated;

grant execute on function
  public.svc_register_patient_credential(uuid, text, date),
  public.svc_verify_first_access(text, date, integer),
  public.svc_begin_password_setup(text),
  public.svc_complete_password_setup(text),
  public.svc_abort_password_setup(text),
  public.svc_login_lookup(text),
  public.svc_record_login_result(text, boolean)
to service_role;
