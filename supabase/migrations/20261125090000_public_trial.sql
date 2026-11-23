-- ============================================================================
-- CareLog migration 12 — 공개 체험 (로그인 없이 '체험 시작하기', Supabase Anonymous Auth)
--
-- * 기존 테이블·함수·정책은 바꾸지 않습니다. private 표 1개 + 함수만 추가.
-- * 방문자마다 Supabase 익명 계정(auth.users.is_anonymous = true) → 기존 가입 트리거가 profile(patient) 생성
--   → start_trial() 이 그 방문자 전용 환자 행 + 가상 예시 기록을 만듦 → 이후는 기존 RLS 그대로 (본인 기록만)
-- * 익명 세션이 아니면 체험을 만들 수 없음 (기존 환자·보호자·의료진 계정은 영향 없음)
-- * 체험은 24시간 뒤 만료 → 환자 행 삭제(기록 연쇄 삭제) + 계정 비활성화. Auth 계정 삭제는 서버 스크립트·크론이
--   svc_trial_users_to_delete() 로 받은 목록만 관리 API로 삭제
-- * 익명 로그인 자체는 Supabase 대시보드 설정(Anonymous sign-ins)으로 켜야 동작 — 이 migration 은 켜지 않음
-- ============================================================================

create table private.trial_accounts (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  patient_id uuid unique references public.patients (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  purged_at  timestamptz
);
create index trial_accounts_expiry on private.trial_accounts (expires_at) where purged_at is null;
alter table private.trial_accounts enable row level security;
revoke all on table private.trial_accounts from public, anon, authenticated;

-- 지금 요청이 Supabase 익명 세션인지 (JWT is_anonymous)
create function private.is_anonymous_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
revoke execute on function private.is_anonymous_session() from public, anon, authenticated;

-- 만료된 체험 정리 (한 번에 p_limit 건): 환자 행 삭제(기록 연쇄 삭제) + 계정 비활성화
create function private.purge_expired_trials(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  r record;
begin
  for r in
    select t.user_id, t.patient_id from private.trial_accounts t
    where t.purged_at is null and t.expires_at <= now()
    order by t.expires_at
    limit greatest(1, least(coalesce(p_limit, 20), 500))
    for update skip locked
  loop
    update public.profiles set disabled_at = coalesce(disabled_at, now()) where id = r.user_id;
    if r.patient_id is not null then
      delete from public.patients where id = r.patient_id;
    end if;
    update private.trial_accounts set purged_at = now(), patient_id = null where user_id = r.user_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;
revoke execute on function private.purge_expired_trials(integer) from public, anon, authenticated;

-- 가상 예시 기록 (체험 시작 시 1회)
create function private.seed_trial_sample(p_patient uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otc uuid;
  v_rx uuid;
  v_ortho uuid;
  v_item uuid;
  v_cold uuid;
begin
  insert into public.health_records (patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo, recorded_in)
  values
    (p_patient, p_today - 3, 3, 3, 3, 3, 75, 'normal', '{두통}', '(체험 예시) 오후에 머리가 조금 아팠어요.', 'outpatient'),
    (p_patient, p_today - 2, 4, 2, 2, 4, 100, 'good', '{}', '(체험 예시) 잘 잤어요.', 'outpatient'),
    (p_patient, p_today - 1, 2, 4, 4, 2, 50, 'heartburn', '{속쓰림}', '(체험 예시) 저녁에 속이 쓰렸어요.', 'outpatient');

  insert into public.prescriptions (patient_id, request_id, kind, source, prescribed_on, clinic)
  values (p_patient, gen_random_uuid(), 'otc', 'search', p_today - 40, '(체험) 가상약국') returning id into v_otc;
  insert into public.prescription_items (prescription_id, patient_id, sort, name, strength, ingredients, drug_class, mfds_class, categories, category_source, dosage, frequency, active)
  values (v_otc, p_patient, 0, '(체험) 가상진통정500밀리그램', '500mg', '아세트아미노펜', 'otc', '114 해열·진통·소염제', '{pain}', 'mfds', '1회 1정', '필요할 때', false)
  returning id into v_item;
  insert into public.prescription_notes (prescription_id, patient_id, item_id, taken_on, tags, memo)
  values (v_otc, p_patient, v_item, p_today - 38, '{증상 완화를 느꼈어요,복용하기 편했어요}', '(체험 예시) 두통이 있을 때 먹었는데 편했어요.');

  insert into public.prescriptions (patient_id, request_id, kind, source, prescribed_on, department, clinic, starred, guidance)
  values (p_patient, gen_random_uuid(), 'prescription', 'prescription', p_today - 14, '이비인후과', '(체험) 가상이비인후과', true, '(체험 예시) 졸릴 수 있으니 운전에 주의하세요.')
  returning id into v_rx;
  insert into public.prescription_items (prescription_id, patient_id, sort, name, dosage, frequency, timing, duration, categories, category_source, active)
  values (v_rx, p_patient, 0, '(체험) 가상코감기정', '1회 1정', '하루 3회', '식후 30분', '5일분', '{cold}', 'mfds', false)
  returning id into v_cold;
  insert into public.prescription_items (prescription_id, patient_id, sort, name, dosage, frequency, timing, duration, categories, category_source, active)
  values (v_rx, p_patient, 1, '(체험) 가상위보호정', '1회 1정', '하루 3회', '식후 30분', '5일분', '{stomach}', 'mfds', false);
  insert into public.prescription_notes (prescription_id, patient_id, item_id, taken_on, tags, memo)
  values
    (v_rx, p_patient, null, p_today - 12, '{증상 완화를 느꼈어요,속쓰림,원인 미확인}', '(체험 예시) 콧물은 줄었는데 저녁에 속이 쓰렸어요. 어느 약 때문인지는 모르겠어요.'),
    (v_rx, p_patient, v_cold, p_today - 13, '{졸림}', '(체험 예시) 낮에 졸렸어요.');

  insert into public.prescriptions (patient_id, request_id, kind, source, prescribed_on, department, clinic)
  values (p_patient, gen_random_uuid(), 'prescription', 'prescription', p_today - 3, '정형외과', '(체험) 가상정형외과') returning id into v_ortho;
  insert into public.prescription_items (prescription_id, patient_id, sort, name, ingredients, dosage, frequency, timing, duration, categories, category_source, active, schedule_slots)
  values (v_ortho, p_patient, 0, '(체험) 가상소염진통정', '아세클로페낙', '1회 1정', '하루 2회', '아침 저녁 식후', '14일분', '{pain,antiinflam}', 'ingredient', true, '{morning,evening}');

  insert into public.visit_questions (patient_id, text, prescription_id)
  values (p_patient, '(체험 예시) 감기약 먹고 속이 쓰렸는데 다음에도 같은 약을 먹어도 될까요?', v_rx);
end
$$;
revoke execute on function private.seed_trial_sample(uuid, date) from public, anon, authenticated;

-- ── 체험 시작: 익명 세션만, 같은 세션이면 같은 체험(재사용), 만료됐으면 거부 ──
create function public.start_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_t private.trial_accounts;
  v_pid uuid;
  v_exp timestamptz;
begin
  if v_uid is null or not private.is_anonymous_session() then
    raise exception 'forbidden: 체험은 로그인 없이 시작한 체험 세션에서만 만들 수 있습니다' using errcode = '42501';
  end if;
  select * into v_t from private.trial_accounts where user_id = v_uid;
  if v_t.user_id is not null then
    if v_t.purged_at is not null or v_t.expires_at <= now() then
      raise exception 'expired: 체험 시간이 끝났습니다. 새로 시작해 주세요' using errcode = 'P0001';
    end if;
    return jsonb_build_object('patient_id', v_t.patient_id, 'expires_at', v_t.expires_at, 'resumed', true);
  end if;
  if exists (select 1 from public.patients where profile_id = v_uid) then
    raise exception 'forbidden: 이미 환자 정보가 있는 계정입니다' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and (role <> 'patient' or disabled_at is not null)) then
    raise exception 'forbidden: 체험을 시작할 수 없는 계정입니다' using errcode = '42501';
  end if;

  perform private.purge_expired_trials(20); -- 지나가는 김에 만료된 체험 몇 건 정리

  v_exp := now() + interval '24 hours';
  update public.profiles set display_name = '체험 방문자' where id = v_uid;
  insert into public.patients (profile_id, display_name)
  values (v_uid, '(체험) 방문자 ' || upper(left(replace(v_uid::text, '-', ''), 4)))
  returning id into v_pid;
  insert into private.trial_accounts (user_id, patient_id, expires_at) values (v_uid, v_pid, v_exp);
  perform private.seed_trial_sample(v_pid, (now() at time zone 'Asia/Seoul')::date);
  return jsonb_build_object('patient_id', v_pid, 'expires_at', v_exp, 'resumed', false);
end
$$;
revoke execute on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- 내 체험 상태 (체험이 아니면 is_trial=false)
create function public.trial_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('is_trial', true, 'expires_at', t.expires_at,
                               'expired', t.purged_at is not null or t.expires_at <= now())
     from private.trial_accounts t where t.user_id = (select auth.uid())),
    jsonb_build_object('is_trial', false)
  )
$$;
revoke execute on function public.trial_status() from public, anon;
grant execute on function public.trial_status() to authenticated;

-- 체험 끝내기: 내 체험 기록을 바로 지우고 계정 비활성화 (익명 체험 세션 본인만)
create function public.end_trial()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_anonymous_session() then
    raise exception 'forbidden: 체험 세션이 아닙니다' using errcode = '42501';
  end if;
  update private.trial_accounts set expires_at = least(expires_at, now()) where user_id = v_uid and purged_at is null;
  if not found then return; end if;
  update public.profiles set disabled_at = coalesce(disabled_at, now()) where id = v_uid;
  delete from public.patients where id = (select patient_id from private.trial_accounts where user_id = v_uid);
  update private.trial_accounts set purged_at = now(), patient_id = null where user_id = v_uid;
end
$$;
revoke execute on function public.end_trial() from public, anon;
grant execute on function public.end_trial() to authenticated;

-- ── 서버 정리 작업용 (서버 키만) ──
create function public.svc_purge_expired_trials(p_limit integer default 100)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.purge_expired_trials(p_limit)
$$;
revoke execute on function public.svc_purge_expired_trials(integer) from public, anon, authenticated;
grant execute on function public.svc_purge_expired_trials(integer) to service_role;

-- 지워도 되는 Auth 계정: 정리가 끝난(기록 삭제·비활성화) 익명 체험 계정만
create function public.svc_trial_users_to_delete(p_limit integer default 100)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id from private.trial_accounts t
  join auth.users u on u.id = t.user_id
  where t.purged_at is not null and t.patient_id is null and coalesce(u.is_anonymous, false)
    and not exists (select 1 from public.patients p where p.profile_id = t.user_id)
    and not exists (select 1 from public.admin_users a where a.user_id = t.user_id)
  order by t.purged_at
  limit greatest(1, least(coalesce(p_limit, 100), 1000))
$$;
revoke execute on function public.svc_trial_users_to_delete(integer) from public, anon, authenticated;
grant execute on function public.svc_trial_users_to_delete(integer) to service_role;
