import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSessionClient } from "@/server/supabase/session";
import { getViewer } from "@/server/supabase/viewer";
import { isTrialSite } from "@/lib/trial";

/**
 * 배포 주소 첫 화면: 로그인 전 → /login, 로그인 후 → 서버가 확인한 역할의 화면
 * (환자 /my · 간호사·의료진 /staff · 보호자 /guardian, 가상 데이터 체험은 /demo)
 */
export async function GET() {
  // 공개 체험 사이트: 로그인 전 첫 화면은 구름이 소개(/start)
  let target = isTrialSite() ? "/start" : "/login";
  if (isSupabaseConfigured()) {
    try {
      const viewer = await getViewer(await createSessionClient());
      if (viewer) target = ROLE_HOME[viewer.role];
    } catch {
      // 세션 확인 실패 → 로그인 화면
    }
  }
  // 상대 경로로 이동 — 서버 내부 호스트 이름(req.url)이 아니라 사용자가 연 주소 그대로 유지 (로그인 쿠키 도메인 일치)
  return new NextResponse(null, { status: 307, headers: { Location: target, "Cache-Control": "private, no-store" } });
}
