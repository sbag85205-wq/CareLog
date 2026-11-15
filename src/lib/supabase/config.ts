/**
 * Supabase 공개 설정 (브라우저·서버 공용)
 * - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (구 anon key도 허용)
 * - 값이 없으면 DB 모드 화면은 "설정 없음" 안내만 표시 (가상 데이터 데모로 대체하지 않음)
 * - 비밀 키(SUPABASE_SECRET_KEY)는 여기서 다루지 않음 → src/server/supabase/admin.ts (서버 전용)
 */
// 배포 화면에 붙여 넣을 때 섞이기 쉬운 앞뒤 공백·줄바꿈과 URL 끝의 "/" 는 제거
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
export const SUPABASE_PUBLISHABLE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();

export function isSupabaseConfigured(): boolean {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length > 20;
}
