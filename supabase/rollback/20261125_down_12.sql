-- ============================================================================
-- 되돌리기: migration 12(공개 체험) 제거 → migration 11 상태로
-- ⚠️ 별도 승인 후 사람이 직접 실행. 한 트랜잭션 — 중간 실패 시 아무것도 바뀌지 않음
-- 체험 방문자의 환자 행·기록은 모두 삭제되고 익명 계정은 비활성화됨 (기존 계정·데이터는 그대로)
-- 남은 익명 Auth 계정(is_anonymous = true)은 이후 관리 API로 삭제 (scripts/purge-trial.mjs 와 같은 방식)
-- 검증: supabase/tests/public-trial.test.ts 의 '되돌리기' 테스트
-- ============================================================================
begin;

update public.profiles set disabled_at = coalesce(disabled_at, now())
  where id in (select user_id from private.trial_accounts);
delete from public.patients
  where id in (select patient_id from private.trial_accounts where patient_id is not null);

drop function if exists public.svc_trial_users_to_delete(integer);
drop function if exists public.svc_purge_expired_trials(integer);
drop function if exists public.end_trial();
drop function if exists public.trial_status();
drop function if exists public.start_trial();
drop function if exists private.seed_trial_sample(uuid, date);
drop function if exists private.purge_expired_trials(integer);
drop function if exists private.is_anonymous_session();
drop table if exists private.trial_accounts;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125090000';
  end if;
end
$$;

commit;
