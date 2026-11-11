-- ============================================================================
-- 테스트 전용: Supabase 환경 최소 재현 (PGlite에서 migration·RLS 검증용)
-- ⚠️ migration이 아닙니다. 실제 Supabase 프로젝트에는 절대 적용하지 마세요.
--
-- 재현 범위
-- * 역할: anon, authenticated, service_role(BYPASSRLS), supabase_auth_admin
-- * auth 스키마: auth.users(필요 컬럼만), auth.uid(), auth.jwt(), auth.role()
--   → JWT 대신 트랜잭션 설정 request.jwt.claims 로 로그인 사용자를 흉내 냄 (Supabase와 같은 방식)
-- * Supabase 기본 권한: public 스키마의 새 테이블·함수·시퀀스에 anon/authenticated/service_role
--   권한이 자동 부여되는 동작 → migration의 REVOKE가 실제로 필요한지까지 검증하기 위함
-- ============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin nologin noinherit;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
grant all on auth.users to supabase_auth_admin, service_role;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role, supabase_auth_admin;
