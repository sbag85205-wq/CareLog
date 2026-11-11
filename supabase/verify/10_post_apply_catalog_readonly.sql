-- ============================================================================
-- CareLog 적용 후 카탈로그 점검 (읽기 전용) — scripts/supabase-remote.sh verify-catalog
-- 실제 Supabase에서 테이블·RLS·권한·함수 설정이 PGlite 테스트와 같은지 확인. ok가 모두 true여야 함
-- ============================================================================
with
  tbl as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('profiles', 'patients', 'admissions', 'staff_assignments', 'guardian_invitations',
                        'access_grants', 'health_records', 'medications', 'drug_info_cache', 'visit_questions',
                        'meal_menus', 'meal_logs', 'life_requests', 'staff_reviews', 'staff_review_notes')
  ),
  fn as (
    select p.oid, n.nspname || '.' || p.proname as name, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  )
select check_name, ok, detail
from (
  values
    ('carelog_tables_15', (select count(*) = 15 from tbl), (select count(*)::text from tbl)),
    ('rls_enabled_all', not exists (select 1 from tbl where not relrowsecurity),
      (select coalesce(string_agg(relname, ', '), '없음') from tbl where not relrowsecurity)),
    -- migration 5/6의 정책 수와 정확히 일치해야 함 (정책 추가·삭제 시 이 값도 함께 수정)
    ('policies_count_28', (select count(*) = 28 from pg_policies where schemaname = 'public'),
      (select count(*)::text from pg_policies where schemaname = 'public')),
    ('anon_no_table_privileges',
      not exists (select 1 from tbl where has_table_privilege('anon', oid, 'select,insert,update,delete')),
      (select coalesce(string_agg(relname, ', '), '없음') from tbl
        where has_table_privilege('anon', oid, 'select,insert,update,delete'))),
    ('authenticated_cannot_update_profile_role',
      not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'), ''),
    ('authenticated_cannot_set_request_status',
      not has_column_privilege('authenticated', 'public.life_requests', 'status', 'insert')
      and not has_column_privilege('authenticated', 'public.life_requests', 'status', 'update'), ''),
    ('authenticated_cannot_read_invitation_token',
      not has_column_privilege('authenticated', 'public.guardian_invitations', 'token_hash', 'select'), ''),
    ('definer_functions_fixed_search_path',
      not exists (select 1 from fn where prosecdef
        and not coalesce(proconfig @> array['search_path=""'] or proconfig @> array['search_path='], false)),
      (select coalesce(string_agg(name, ', '), '없음') from fn where prosecdef
        and not coalesce(proconfig @> array['search_path=""'] or proconfig @> array['search_path='], false))),
    ('anon_cannot_execute_any_function',
      not exists (select 1 from fn where has_function_privilege('anon', oid, 'execute')),
      (select coalesce(string_agg(name, ', '), '없음') from fn where has_function_privilege('anon', oid, 'execute'))),
    ('admin_set_role_service_role_only',
      not has_function_privilege('authenticated', 'private.admin_set_role(uuid, public.app_role)', 'execute')
      and has_function_privilege('service_role', 'private.admin_set_role(uuid, public.app_role)', 'execute'), ''),
    ('signup_trigger_on_auth_users',
      exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'
        and not tgisinternal and tgenabled <> 'D'), ''),
    ('private_schema_not_exposed_to_anon', not has_schema_privilege('anon', 'private', 'usage'), '')
) as v(check_name, ok, detail);
