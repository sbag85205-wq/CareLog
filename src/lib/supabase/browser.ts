"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * 브라우저용 Supabase 클라이언트 (공개 키만 사용)
 * 세션은 @supabase/ssr 기본 동작대로 쿠키에 저장되며, 건강기록은 저장하지 않음
 */
let client: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}
