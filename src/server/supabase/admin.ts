import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * 서버 전용 관리자 클라이언트 (Supabase secret / service_role 키)
 * - RLS를 우회하므로 svc_* RPC 호출과 Auth 관리자 기능(비밀번호 설정)에만 사용
 * - 키는 .env.local 의 SUPABASE_SECRET_KEY (구 SUPABASE_SERVICE_ROLE_KEY) — 브라우저 번들에 포함되지 않음
 */
let cached: SupabaseClient | null = null;

export function getSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function isAdminConfigured(): boolean {
  return SUPABASE_URL.length > 0 && getSecretKey().length > 20;
}

export function getAdminClient(): SupabaseClient {
  if (!isAdminConfigured()) throw new Error("Supabase 서버 키가 설정되지 않았습니다");
  cached ??= createClient(SUPABASE_URL, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
