-- ============================================================================
-- CareLog 원격 사전 점검 (migration 적용 전, 읽기 전용) — scripts/supabase-remote.sh preflight
-- 단일 SELECT: DB를 바꾸지 않음. 결과의 ok가 모두 true여야 dry-run·적용을 진행합니다.
-- ============================================================================
select check_name, ok, detail
from (
  values
    -- PGlite 테스트는 PostgreSQL 18 — 원격 버전 기록 (15 이상이면 사용한 문법 모두 지원)
    ('postgres_version_15_or_later',
      current_setting('server_version_num')::int >= 150000,
      current_setting('server_version')),
    ('role_anon_exists', exists (select 1 from pg_roles where rolname = 'anon'), ''),
    ('role_authenticated_exists', exists (select 1 from pg_roles where rolname = 'authenticated'), ''),
    ('role_service_role_exists', exists (select 1 from pg_roles where rolname = 'service_role'), ''),
    ('role_supabase_auth_admin_exists', exists (select 1 from pg_roles where rolname = 'supabase_auth_admin'), ''),
    -- migration 적용 계정(postgres)이 auth.users에 가입 트리거를 만들 수 있는지
    -- ※ --read-only 조회는 supabase_read_only_user로 실행되므로 current_user가 아닌 postgres를 명시해 검사
    ('postgres_can_create_trigger_on_auth_users',
      coalesce(has_table_privilege('postgres', 'auth.users', 'TRIGGER'), false),
      '검사 대상: postgres (조회 계정: ' || current_user || ')'),
    ('auth_users_required_columns',
      (select count(*) = 4 from information_schema.columns
        where table_schema = 'auth' and table_name = 'users'
          and column_name in ('id', 'email', 'email_confirmed_at', 'raw_user_meta_data')),
      'id, email, email_confirmed_at, raw_user_meta_data'),
    ('auth_uid_function_exists', to_regprocedure('auth.uid()') is not null, ''),
    -- postgres가 authenticated로 전환 가능해야 적용 후 스모크 테스트(SET ROLE authenticated)를 실행할 수 있음
    ('postgres_can_set_role_authenticated', pg_has_role('postgres', 'authenticated', 'MEMBER'),
      '검사 대상: postgres'),
    -- 테이블 소유자(postgres)의 RLS 우회 속성: security definer 함수 내부 조회가 RLS에 막히지 않음
    ('postgres_bypassrls_or_owner',
      coalesce((select rolbypassrls or rolsuper from pg_roles where rolname = 'postgres'), false),
      (select 'bypassrls=' || rolbypassrls || ', superuser=' || rolsuper from pg_roles where rolname = 'postgres')),
    ('gen_random_uuid_available', to_regprocedure('gen_random_uuid()') is not null, ''),
    ('sha256_available', to_regprocedure('sha256(bytea)') is not null, ''),
    -- 새 개발 프로젝트여야 함: CareLog 객체가 아직 없어야 충돌 없이 적용됨
    ('no_existing_carelog_tables',
      not exists (select 1 from pg_tables where schemaname = 'public'
        and tablename in ('profiles', 'patients', 'admissions', 'staff_assignments', 'guardian_invitations',
                          'access_grants', 'health_records', 'medications', 'drug_info_cache', 'visit_questions',
                          'meal_menus', 'meal_logs', 'life_requests', 'staff_reviews', 'staff_review_notes')),
      (select coalesce(string_agg(tablename, ', '), '없음') from pg_tables where schemaname = 'public')),
    ('no_existing_carelog_types',
      not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typname in ('app_role', 'care_mode', 'request_status', 'access_scope')),
      ''),
    ('no_existing_private_schema', to_regnamespace('private') is null, ''),
    ('no_trigger_name_conflict_on_auth_users',
      not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'),
      (select coalesce(string_agg(tgname, ', '), '없음') from pg_trigger
        where tgrelid = 'auth.users'::regclass and not tgisinternal)),
    ('migration_history_empty',
      to_regclass('supabase_migrations.schema_migrations') is null,
      case when to_regclass('supabase_migrations.schema_migrations') is null then '이력 테이블 없음 (새 프로젝트)'
           else '이력 테이블 있음 — migration list --remote 결과 확인 필요' end)
) as v(check_name, ok, detail);
