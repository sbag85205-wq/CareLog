import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSessionClient } from "@/server/supabase/session";
import { getViewer } from "@/server/supabase/viewer";

/**
 * 배포 주소 첫 화면: 로그인 전 → /login, 로그인 후 → 서버가 확인한 역할의 화면
 * (환자 /my · 간호사·의료진 /staff · 보호자 /guardian, 가상 데이터 체험은 /demo)
 */
export async function GET(req: NextRequest) {
  let target = "/login";
  if (isSupabaseConfigured()) {
    try {
      const viewer = await getViewer(await createSessionClient());
      if (viewer) target = ROLE_HOME[viewer.role];
    } catch {
      // 세션 확인 실패 → 로그인 화면
    }
  }
  const res = NextResponse.redirect(new URL(target, req.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
