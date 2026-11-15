import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSessionClient } from "@/server/supabase/session";

/**
 * 배포 주소 첫 화면: 로그인 전 → /login, 로그인 후 → /my
 * (기존 가상 데이터 데모는 /demo)
 */
export async function GET(req: NextRequest) {
  let target = "/login";
  if (isSupabaseConfigured()) {
    try {
      const client = await createSessionClient();
      const { data } = await client.auth.getUser();
      if (data.user) target = "/my";
    } catch {
      // 세션 확인 실패 → 로그인 화면 (로그인 화면이 다시 세션을 확인함)
    }
  }
  const res = NextResponse.redirect(new URL(target, req.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
