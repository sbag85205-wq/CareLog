import type { NextRequest } from "next/server";
import { ROLE_HOME } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { clientKey, isSameOrigin, json, loginGuards, readJson, str } from "@/server/patient-auth/http";
import { withMinDuration } from "@/server/patient-auth/rate-limit";
import { createSessionClient } from "@/server/supabase/session";
import { getViewer } from "@/server/supabase/viewer";

const FAILED = "이메일 또는 비밀번호가 올바르지 않습니다. 계속 안 되면 잠시 후 다시 시도해 주세요.";

/**
 * 보호자·간호사/의료진·관리자 로그인: 이메일 + 비밀번호 → Supabase Auth 세션(쿠키)
 * - 계정과 역할은 관리자가 준비 (scripts/provision-member.mjs) — 공개 가입 화면 없음
 * - 환자 계정은 환자 코드 로그인만 사용 (이 경로로 로그인하면 거부하고 세션 제거)
 * - 실패 원인은 구분하지 않고 같은 문구, 요청 빈도 제한
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return json({ ok: false, message: "DB 연결 설정이 없어 로그인할 수 없습니다." }, 503);
  if (!isSameOrigin(req)) return json({ ok: false, message: FAILED }, 403);

  return withMinDuration(600, async () => {
    const ip = clientKey(req);
    const guard = loginGuards.member;
    if (!guard.allowRequest(ip)) {
      console.warn("[member-auth] login 거부: rate_limited");
      return json({ ok: false, message: FAILED }, 429);
    }
    const body = await readJson(req);
    const email = str(body?.email, 254)?.toLowerCase();
    const password = str(body?.password, 200);
    if (!email || !password || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, message: FAILED }, 401);

    if (guard.accountBlocked(ip, email)) {
      console.warn("[member-auth] login 거부: account_rate_limited");
      return json({ ok: false, message: FAILED }, 429);
    }
    const client = await createSessionClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      guard.recordFailure(ip, email);
      return json({ ok: false, message: FAILED }, 401);
    }

    const viewer = await getViewer(client);
    if (!viewer || viewer.role === "patient" || viewer.disabled) {
      await client.auth.signOut();
      return json({ ok: false, message: FAILED }, 401);
    }
    return json({ ok: true, home: ROLE_HOME[viewer.role] });
  });
}
