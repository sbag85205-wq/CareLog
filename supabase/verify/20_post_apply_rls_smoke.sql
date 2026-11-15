-- ============================================================================
-- CareLog 적용 후 동작 스모크 테스트 — 실제 Supabase에서 가입 트리거·RLS·RPC·역할 권한 재검증
--
-- * migration 적용(별도 승인) 이후에만 실행. 개발용 프로젝트 전용
-- * 전체가 하나의 트랜잭션이며 마지막에 ROLLBACK → 가상 계정·기록이 DB에 남지 않음
--   (중간에 실패해도 예외로 트랜잭션이 중단되어 아무것도 남지 않음)
-- * 실패 시 'FAIL: …' 메시지와 함께 중단, 모두 통과하면 마지막 행에 PASS 출력
-- * 실행: 대시보드 SQL Editor에 전체 붙여넣기 (권장) — 로컬에서는 npm run test:db 가 이 파일도 검증
-- * 가상 이메일은 example.invalid 도메인 (실제로 발송·수신 불가)
-- ============================================================================
begin;

-- ── 준비 (적용 계정 = 테이블 소유자) ────────────────────────────────────────
do $$
declare
  sfx text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  ids jsonb := jsonb_build_object(
    'pa', gen_random_uuid(), 'pb', gen_random_uuid(), 'gd', gen_random_uuid(),
    'sa', gen_random_uuid(), 'sb', gen_random_uuid());
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  select (ids ->> k)::uuid,
         format('carelog-smoke-%s-%s@example.invalid', sfx, k),
         now(),
         -- 권한 상승 시도: 가입 정보에 role=staff
         case when k = 'pa' then '{"role": "staff", "display_name": "가상 환자A"}'::jsonb else '{}'::jsonb end
  from unnest(array['pa', 'pb', 'gd', 'sa', 'sb']) as k;

  if (select count(*) from public.profiles where id in (select (value #>> '{}')::uuid from jsonb_each(ids))) <> 5 then
    raise exception 'FAIL: 가입 트리거가 프로필 5개를 만들지 않음';
  end if;
  if exists (select 1 from public.profiles where id = (ids ->> 'pa')::uuid and role <> 'patient') then
    raise exception 'FAIL: 가입 정보의 role=staff가 반영됨 (권한 상승)';
  end if;

  perform private.admin_set_role((ids ->> 'sa')::uuid, 'staff');
  perform private.admin_set_role((ids ->> 'sb')::uuid, 'staff');
  perform set_config('carelog.ids', ids::text, true);
  perform set_config('carelog.email_gd', format('carelog-smoke-%s-gd@example.invalid', sfx), true);
end $$;

-- ── 환자 A·B: 서버(적용 계정)가 환자 프로필 발급 — migration 7부터 가입자 자가 생성 불가 ──
do $$
declare
  ids jsonb := current_setting('carelog.ids')::jsonb;
  v_a uuid;
  v_b uuid;
begin
  insert into public.patients (profile_id, display_name) values ((ids ->> 'pa')::uuid, '가상 환자A') returning id into v_a;
  insert into public.patients (profile_id, display_name) values ((ids ->> 'pb')::uuid, '가상 환자B') returning id into v_b;
  perform set_config('carelog.pid_a', v_a::text, true);
  perform set_config('carelog.pid_b', v_b::text, true);
end $$;

-- ── 관리자 작업: 담당 배정, 약 등록(공개로 넣어도 비공개로 저장돼야 함) ──────
do $$
declare
  ids jsonb := current_setting('carelog.ids')::jsonb;
  pid_a uuid := current_setting('carelog.pid_a')::uuid;
  pid_b uuid := current_setting('carelog.pid_b')::uuid;
begin
  insert into public.staff_assignments (patient_id, staff_id)
  values (pid_a, (ids ->> 'sa')::uuid), (pid_b, (ids ->> 'sb')::uuid);
  insert into public.medications (patient_id, name, visible_to_guardian) values (pid_a, '예시 약품 (가상)', true);
  if exists (select 1 from public.medications where patient_id = pid_a and visible_to_guardian) then
    raise exception 'FAIL: 보호자 약 공개 기본값이 비공개가 아님';
  end if;
end $$;

-- ── 환자 A ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'pa', 'role', 'authenticated')::text, true);
do $$
declare
  pid_a uuid := current_setting('carelog.pid_a')::uuid;
  pid_b uuid := current_setting('carelog.pid_b')::uuid;
  inv jsonb;
begin
  perform public.upsert_health_record(pid_a, private.today_kst(), 4::smallint, 1::smallint, 2::smallint, 4::smallint, 75::smallint, 'good');
  insert into public.life_requests (patient_id, category, detail) values (pid_a, 'water', '(가상) 물');

  begin
    perform public.upsert_health_record(pid_b, private.today_kst(), 1::smallint, 9::smallint, 5::smallint, 1::smallint, 0::smallint, 'nausea');
    raise exception 'FAIL: 환자A가 환자B의 기록을 작성함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  if (select count(*) from public.health_records where patient_id = pid_b) <> 0 then
    raise exception 'FAIL: 환자A가 환자B의 기록을 조회함';
  end if;
  begin
    update public.profiles set role = 'staff' where id = auth.uid();
    raise exception 'FAIL: 환자가 자기 역할을 staff로 변경함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform private.admin_set_role(auth.uid(), 'staff');
    raise exception 'FAIL: 환자가 관리자 함수를 실행함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    update public.life_requests set status = 'completed' where patient_id = pid_a;
    raise exception 'FAIL: 환자가 요청 상태를 직접 변경함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  begin
    perform public.create_my_patient_profile('가상 추가 프로필');
    raise exception 'FAIL: 가입자가 환자 프로필을 직접 생성함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  inv := public.invite_guardian(pid_a, current_setting('carelog.email_gd'), '{records,medications}');
  perform set_config('carelog.token', inv ->> 'token', true);
end $$;
reset role;

-- ── 환자 B: 자신의 기록 + 요청 ──────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'pb', 'role', 'authenticated')::text, true);
do $$
begin
  perform public.upsert_health_record(current_setting('carelog.pid_b')::uuid, private.today_kst(),
    2::smallint, 5::smallint, 4::smallint, 2::smallint, 25::smallint, 'bloated');
  insert into public.life_requests (patient_id, category, detail)
  values (current_setting('carelog.pid_b')::uuid, 'bedding', '(가상) 침구');
end $$;
reset role;

-- ── 보호자: 초대 수락 → 허용 범위만 ─────────────────────────────────────────
-- (적용 계정으로 가입 확인 이메일 값을 맞춤 — 실제 이메일 발송 없음)
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'gd', 'role', 'authenticated')::text, true);
do $$
declare
  pid_a uuid := current_setting('carelog.pid_a')::uuid;
  pid_b uuid := current_setting('carelog.pid_b')::uuid;
begin
  perform public.accept_guardian_invitation(current_setting('carelog.token'));
  if (select count(*) from public.health_records where patient_id = pid_a) <> 1 then
    raise exception 'FAIL: 보호자가 승인된 환자 기록을 조회하지 못함';
  end if;
  if (select count(*) from public.health_records where patient_id = pid_b) <> 0 then
    raise exception 'FAIL: 보호자가 승인되지 않은 환자 기록을 조회함';
  end if;
  if (select count(*) from public.medications where patient_id = pid_a) <> 0 then
    raise exception 'FAIL: 보호자가 비공개 약을 조회함';
  end if;
  if (select count(*) from public.life_requests) <> 0 then
    raise exception 'FAIL: 보호자가 승인되지 않은 범위(requests)를 조회함';
  end if;
end $$;
reset role;

-- ── 의료진 A: 담당 환자만, 요청 상태 RPC, 검토 ──────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'sa', 'role', 'authenticated')::text, true);
do $$
declare
  pid_a uuid := current_setting('carelog.pid_a')::uuid;
  pid_b uuid := current_setting('carelog.pid_b')::uuid;
  req_a uuid;
  req_b uuid;
  r public.life_requests;
begin
  if (select count(*) from public.health_records where patient_id = pid_a) <> 1 then
    raise exception 'FAIL: 의료진이 담당 환자 기록을 조회하지 못함';
  end if;
  if (select count(*) from public.health_records where patient_id = pid_b) <> 0 then
    raise exception 'FAIL: 의료진이 비담당 환자 기록을 조회함';
  end if;
  select id into req_a from public.life_requests where patient_id = pid_a;
  r := public.advance_request_status(req_a, 'received', 'acknowledged');
  if r.handled_by <> auth.uid() or r.status <> 'acknowledged' then
    raise exception 'FAIL: 처리자 또는 상태가 올바르지 않음';
  end if;
  begin
    perform public.advance_request_status(req_a, 'received', 'acknowledged');
    raise exception 'FAIL: 중복 처리(stale_state)가 차단되지 않음';
  exception when others then if sqlerrm like 'FAIL:%' or sqlerrm not like 'stale_state:%' then raise; end if;
  end;
  begin
    perform public.advance_request_status(req_a, 'acknowledged', 'received');
    raise exception 'FAIL: 상태 역행이 차단되지 않음';
  exception when others then if sqlerrm like 'FAIL:%' or sqlerrm not like 'invalid_transition:%' then raise; end if;
  end;
  -- 비담당 환자의 요청 (RLS로 보이지 않으므로 소유자 권한 없이 ID를 알 수 없음 → 직접 조회 불가 확인)
  select id into req_b from public.life_requests where patient_id = pid_b;
  if req_b is not null then
    raise exception 'FAIL: 의료진이 비담당 환자의 요청을 조회함';
  end if;
  perform public.add_staff_review(pid_a, 'consult_needed', '(가상) 내부 메모');
end $$;
reset role;

-- ── 의료진 B: 다른 의료진 담당 환자의 요청 처리 불가 ─────────────────────────
do $$ begin
  perform set_config('carelog.req_a',
    (select id::text from public.life_requests where patient_id = current_setting('carelog.pid_a')::uuid), true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'sb', 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.advance_request_status(current_setting('carelog.req_a')::uuid, 'acknowledged', 'completed');
    raise exception 'FAIL: 비담당 의료진이 요청을 처리함';
  exception when others then if sqlerrm like 'FAIL:%' or sqlerrm not like 'not_found:%' then raise; end if;
  end;
  if (select count(*) from public.staff_review_notes) <> 0 then
    raise exception 'FAIL: 비담당 의료진이 검토 메모를 조회함';
  end if;
end $$;
reset role;

-- ── 환자 A: 검토 상태는 보이고 내부 메모는 보이지 않음 ───────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('carelog.ids')::jsonb ->> 'pa', 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from public.staff_reviews where patient_id = current_setting('carelog.pid_a')::uuid) <> 1 then
    raise exception 'FAIL: 환자가 검토 상태를 조회하지 못함';
  end if;
  if (select count(*) from public.staff_review_notes) <> 0 then
    raise exception 'FAIL: 환자가 의료진 내부 메모를 조회함';
  end if;
end $$;
reset role;

-- ── 비로그인(anon): 환자정보 조회 불가 ──────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
begin
  begin
    perform 1 from public.patients limit 1;
    raise exception 'FAIL: 비로그인 사용자가 patients를 조회함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform 1 from public.health_records limit 1;
    raise exception 'FAIL: 비로그인 사용자가 health_records를 조회함';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
reset role;

select 'PASS' as result, 'CareLog 원격 스모크 테스트 통과 — 이어서 ROLLBACK (데이터 남지 않음)' as detail;
rollback;
