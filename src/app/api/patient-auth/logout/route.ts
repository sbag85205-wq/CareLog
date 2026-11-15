import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, json } from "@/server/patient-auth/http";
import { createSessionClient } from "@/server/supabase/session";

/** 로그아웃 — 세션 쿠키 제거 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ ok: false }, 403);
  if (isSupabaseConfigured()) {
    const client = await createSessionClient();
    await client.auth.signOut();
  }
  return json({ ok: true });
}
