-- ============================================================================
-- CareLog migration 6/6 — RPC 함수 + 함수 실행 권한
--
-- * security invoker 함수: 호출자 권한·RLS가 그대로 적용됨 (편의용 upsert)
-- * security definer 함수: 함수 안에서 auth.uid()로 권한을 직접 검사한 뒤에만 변경
--   - set search_path = '' + 객체 스키마 명시
--   - 행위자(의료진/환자) ID는 인자로 받지 않고 auth.uid()만 사용
-- * 마지막에 모든 함수의 PUBLIC/anon 실행 권한을 회수하고 필요한 것만 authenticated에 부여
-- ============================================================================

-- ── 환자 프로필 생성 (가입 후 1회) ──────────────────────────────────────────
create function public.create_my_patient_profile(
  p_display_name text,
  p_birth_year smallint default null,
  p_sex text default null
)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.patients;
begin
  if v_uid is null then
    raise exception 'forbidden: 로그인이 필요합니다' using errcode = '42501';
  end if;
  if private.is_staff() then
    raise exception 'forbidden: 의료진 계정은 환자 프로필을 만들 수 없습니다' using errcode = '42501';
  end if;
  if exists (select 1 from public.patients where profile_id = v_uid) then
    raise exception 'invalid_input: 이미 환자 프로필이 있습니다' using errcode = '23505';
  end if;
  insert into public.patients (profile_id, display_name, birth_year, sex)
  values (v_uid, btrim(p_display_name), p_birth_year, p_sex)
  returning * into v_row;
  return v_row;
end
$$;

-- ── 통원·입원 모드 전환 + 입원 이력 (앱 src/lib/domain/admissions.ts 와 동일 규칙) ──
create function public.set_care_mode(
  p_patient_id uuid,
  p_mode public.care_mode,
  p_ward text default null,
  p_room text default null
)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.patients;
  v_open public.admissions;
  v_today date := private.today_kst();
begin
  if not (private.is_patient_self(p_patient_id) or private.is_assigned_staff(p_patient_id)) then
    raise exception 'forbidden: 이 환자의 모드를 바꿀 권한이 없습니다' using errcode = '42501';
  end if;

  select * into v_patient from public.patients where id = p_patient_id for update;  -- 동시 전환 직렬화
  select * into v_open from public.admissions
    where patient_id = p_patient_id and discharged_on is null for update;

  if p_mode = 'inpatient' and v_open.id is null then
    -- 재입원 포함: 항상 새 이력. 병동·병실은 자기기록 (미입력 허용)
    insert into public.admissions (patient_id, ward, room, admitted_on, source)
    values (
      p_patient_id,
      coalesce(nullif(btrim(p_ward), ''), '미입력'),
      coalesce(nullif(btrim(p_room), ''), '미입력'),
      v_today,
      'self_reported'
    );
  elsif p_mode = 'outpatient' and v_open.id is not null then
    update public.admissions
      set discharged_on = greatest(v_today, v_open.admitted_on)
      where id = v_open.id;
  end if;

  update public.patients set care_mode = p_mode where id = p_patient_id returning * into v_patient;
  return v_patient;
end
$$;

-- ── 건강기록 저장 (환자·날짜당 1건 upsert) — invoker: RLS가 본인만 허용 ─────
create function public.upsert_health_record(
  p_patient_id uuid,
  p_record_date date,
  p_condition smallint,
  p_pain smallint,
  p_fatigue smallint,
  p_sleep smallint,
  p_meal_intake smallint,
  p_digestion public.digestion,
  p_symptoms text[] default '{}',
  p_memo text default ''
)
returns public.health_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mode public.care_mode;
  v_row public.health_records;
begin
  select care_mode into v_mode from public.patients where id = p_patient_id;  -- RLS 적용
  insert into public.health_records as h
    (patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo, recorded_in)
  values
    (p_patient_id, p_record_date, p_condition, p_pain, p_fatigue, p_sleep, p_meal_intake, p_digestion,
     coalesce(p_symptoms, '{}'), coalesce(p_memo, ''), coalesce(v_mode, 'outpatient'))
  on conflict on constraint health_records_one_per_day do update set
    condition = excluded.condition,
    pain = excluded.pain,
    fatigue = excluded.fatigue,
    sleep = excluded.sleep,
    meal_intake = excluded.meal_intake,
    digestion = excluded.digestion,
    symptoms = excluded.symptoms,
    memo = excluded.memo           -- recorded_in(최초 기록 당시 모드)은 유지
  returning h.* into v_row;
  return v_row;
end
$$;

-- ── 식사 섭취량·소화 기록 (넘긴 값만 변경) — invoker: RLS가 본인만 허용 ──────
create function public.upsert_meal_intake(
  p_patient_id uuid,
  p_meal_date date,
  p_slot public.meal_slot,
  p_intake smallint default null,
  p_digestion public.digestion default null
)
returns public.meal_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.meal_logs;
begin
  insert into public.meal_logs as m (patient_id, meal_date, slot, intake, digestion)
  values (p_patient_id, p_meal_date, p_slot, p_intake, p_digestion)
  on conflict on constraint meal_logs_one_per_slot do update set
    intake = coalesce(excluded.intake, m.intake),
    digestion = coalesce(excluded.digestion, m.digestion)
  returning m.* into v_row;
  return v_row;
end
$$;

-- ── 생활 요청 상태 진행 (접수 → 직원 확인 → 처리 완료) ──────────────────────
-- * 담당 의료진만, 한 단계씩만
-- * p_expected: 화면에서 보고 있던 상태. 행 잠금 후 실제 상태와 다르면 stale_state
--   → 여러 의료진이 동시에 눌러도 한 명만 성공 (나머지는 잠금 해제 후 바뀐 상태를 보고 거부됨)
-- * 식사 변경 요청은 처리 완료 시 같은 트랜잭션에서 meal_logs.meal_type 반영
create function public.advance_request_status(
  p_request_id uuid,
  p_expected public.request_status,
  p_to public.request_status
)
returns public.life_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.life_requests;
begin
  if v_uid is null then
    raise exception 'forbidden: 로그인이 필요합니다' using errcode = '42501';
  end if;

  select * into v_req from public.life_requests where id = p_request_id for update;
  -- 존재 여부를 노출하지 않도록 "없음"과 "권한 없음"을 같은 오류로 처리
  if v_req.id is null or not private.is_assigned_staff(v_req.patient_id) then
    raise exception 'not_found: 요청을 찾을 수 없거나 처리 권한이 없습니다' using errcode = 'P0002';
  end if;
  if private.next_request_status(p_expected) is distinct from p_to then
    raise exception 'invalid_transition: % 상태에서 %(으)로 바꿀 수 없습니다', p_expected, p_to using errcode = 'P0001';
  end if;
  if v_req.status <> p_expected then
    raise exception 'stale_state: 이미 % 상태로 변경된 요청입니다', v_req.status using errcode = 'P0001';
  end if;

  update public.life_requests
    set status = p_to, handled_by = v_uid, version = version + 1
    where id = p_request_id
    returning * into v_req;

  if p_to = 'completed' and v_req.category = 'meal_change' then
    insert into public.meal_logs as m (patient_id, meal_date, slot, meal_type)
    values (v_req.patient_id, v_req.meal_change_date, v_req.meal_change_slot, v_req.meal_change_to_type)
    on conflict on constraint meal_logs_one_per_slot do update set meal_type = excluded.meal_type;
  end if;

  return v_req;
end
$$;

-- ── 의료진 검토 (상태 + 선택적 내부 메모를 한 트랜잭션으로) ─────────────────
create function public.add_staff_review(
  p_patient_id uuid,
  p_action public.review_action,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_assigned_staff(p_patient_id) then
    raise exception 'forbidden: 담당 환자만 검토할 수 있습니다' using errcode = '42501';
  end if;
  insert into public.staff_reviews (patient_id, staff_id, action)
  values (p_patient_id, auth.uid(), p_action)
  returning id into v_id;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.staff_review_notes (review_id, note) values (v_id, btrim(p_note));
  end if;
  return v_id;
end
$$;

-- ── 약 보호자 공개 여부 (환자 본인만) ───────────────────────────────────────
create function public.set_medication_guardian_visibility(p_medication_id uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
begin
  select patient_id into v_patient_id from public.medications where id = p_medication_id for update;
  if v_patient_id is null or not private.is_patient_self(v_patient_id) then
    raise exception 'not_found: 약을 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  update public.medications set visible_to_guardian = p_visible where id = p_medication_id;
end
$$;

-- ── 보호자 초대 (환자 본인) — 토큰 원문은 이때 1회만 반환, DB에는 해시만 ─────
create function public.invite_guardian(
  p_patient_id uuid,
  p_email text,
  p_scopes public.access_scope[],
  p_valid_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_inv public.guardian_invitations;
begin
  if not private.is_patient_self(p_patient_id) then
    raise exception 'forbidden: 본인 환자 정보만 공유할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_scopes), 0) = 0 then
    raise exception 'invalid_input: 공유 범위를 하나 이상 선택해 주세요' using errcode = '22023';
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'invalid_input: 초대 유효기간은 1~30일입니다' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where id = auth.uid() and lower(email) = v_email) then
    raise exception 'invalid_input: 본인 이메일은 보호자로 초대할 수 없습니다' using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.guardian_invitations (patient_id, invitee_email, scopes, token_hash, expires_at)
  values (
    p_patient_id, v_email, p_scopes,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + make_interval(days => p_valid_days)
  )
  returning * into v_inv;

  return jsonb_build_object('invitation_id', v_inv.id, 'token', v_token, 'expires_at', v_inv.expires_at);
end
$$;

-- ── 초대 수락 (초대받은 이메일로 로그인·이메일 확인된 계정만) ────────────────
create function public.accept_guardian_invitation(p_token text)
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
  if v_uid is null then
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

-- ── 환자: 초대 취소 / 공유 범위 변경 / 공유 철회 ────────────────────────────
create function public.revoke_guardian_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.guardian_invitations;
begin
  select * into v_inv from public.guardian_invitations where id = p_invitation_id for update;
  if v_inv.id is null or not private.is_patient_self(v_inv.patient_id) then
    raise exception 'not_found: 초대를 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  if v_inv.status = 'pending' then
    update public.guardian_invitations set status = 'revoked', responded_at = now() where id = p_invitation_id;
  end if;
end
$$;

create function public.update_guardian_scopes(p_grant_id uuid, p_scopes public.access_scope[])
returns public.access_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.access_grants;
begin
  select * into v_grant from public.access_grants where id = p_grant_id for update;
  if v_grant.id is null or not private.is_patient_self(v_grant.patient_id) then
    raise exception 'not_found: 공유 정보를 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  if v_grant.revoked_at is not null then
    raise exception 'invalid_input: 철회된 공유는 다시 초대해야 합니다' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_scopes), 0) = 0 then
    raise exception 'invalid_input: 공유 범위를 하나 이상 선택하거나 공유를 철회해 주세요' using errcode = '22023';
  end if;
  update public.access_grants set scopes = p_scopes where id = p_grant_id returning * into v_grant;
  return v_grant;
end
$$;

create function public.revoke_guardian_access(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.access_grants;
begin
  select * into v_grant from public.access_grants where id = p_grant_id for update;
  if v_grant.id is null or not private.is_patient_self(v_grant.patient_id) then
    raise exception 'not_found: 공유 정보를 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  update public.access_grants set revoked_at = coalesce(revoked_at, now()) where id = p_grant_id;
end
$$;

-- ============================================================================
-- 함수 실행 권한: 기본(PUBLIC)·Supabase 기본 부여를 모두 회수한 뒤 필요한 것만 부여
-- ============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- RLS 정책·트리거가 호출하는 판별 함수 (private 스키마는 API에 노출되지 않음)
grant execute on function
  private.today_kst(),
  private.is_staff(),
  private.is_patient_self(uuid),
  private.is_assigned_staff(uuid),
  private.guardian_has(uuid, public.access_scope),
  private.has_active_grant(uuid),
  private.next_request_status(public.request_status)
to authenticated;

-- 로그인 사용자가 API로 호출하는 RPC (각 함수가 내부에서 권한 검사)
grant execute on function
  public.create_my_patient_profile(text, smallint, text),
  public.set_care_mode(uuid, public.care_mode, text, text),
  public.upsert_health_record(uuid, date, smallint, smallint, smallint, smallint, smallint, public.digestion, text[], text),
  public.upsert_meal_intake(uuid, date, public.meal_slot, smallint, public.digestion),
  public.advance_request_status(uuid, public.request_status, public.request_status),
  public.add_staff_review(uuid, public.review_action, text),
  public.set_medication_guardian_visibility(uuid, boolean),
  public.invite_guardian(uuid, text, public.access_scope[], integer),
  public.accept_guardian_invitation(text),
  public.revoke_guardian_invitation(uuid),
  public.update_guardian_scopes(uuid, public.access_scope[]),
  public.revoke_guardian_access(uuid)
to authenticated;

-- 관리자 전용
grant execute on function private.admin_set_role(uuid, public.app_role) to service_role;
