import type { NextRequest } from "next/server";
import { isValidLoginId, LOGIN_MESSAGES, loginIdToEmail, normalizeLoginId } from "@/lib/patient-auth/login-id";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { clientKey, isSameOrigin, json, loginGuards, readJson, str } from "@/server/patient-auth/http";
import { withMinDuration } from "@/server/patient-auth/rate-limit";
import { createSessionClient } from "@/server/supabase/session";
import { getViewer } from "@/server/supabase/viewer";

const FAILED = LOGIN_MESSAGES.loginFailed;

/**
 * 환자 로그인: 관리자가 발급한 아이디 + 비밀번호 → Supabase Auth 세션(쿠키)
 * - 비밀번호 검증·세션은 Supabase Auth (signInWithPassword)
 * - 역할은 서버가 확인: 환자 계정이 아니거나 비활성화된 계정이면 세션을 지우고 같은 문구로 거부
 * - 실패 원인을 구분하지 않음, 요청 빈도 제한, 입력값은 기록하지 않음
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return json({ ok: false, message: "DB 연결 설정이 없어 로그인할 수 없습니다." }, 503);
  if (!isSameOrigin(req)) return json({ ok: false, message: FAILED }, 403);

  return withMinDuration(600, async () => {
    const ip = clientKey(req);
    const guard = loginGuards.patient;
    if (!guard.allowRequest(ip)) {
      console.warn("[patient-auth] login 거부: rate_limited");
      return json({ ok: false, message: FAILED }, 429);
    }
    const body = await readJson(req);
    const loginId = normalizeLoginId(str(body?.loginId, 40) ?? "");
    const password = str(body?.password, 200);
    if (!isValidLoginId(loginId) || !password) return json({ ok: false, message: FAILED }, 401);
    // 계정별 실패 제한 (공개 체험 사이트에서 IP 한도를 완화했을 때만 켜짐)
    if (guard.accountBlocked(ip, loginId)) {
      console.warn("[patient-auth] login 거부: account_rate_limited");
      return json({ ok: false, message: FAILED }, 429);
    }

    const client = await createSessionClient();
    const { error } = await client.auth.signInWithPassword({ email: loginIdToEmail(loginId), password });
    if (error) {
      guard.recordFailure(ip, loginId);
      return json({ ok: false, message: FAILED }, 401);
    }

    const viewer = await getViewer(client);
    if (!viewer || viewer.role !== "patient" || viewer.disabled) {
      await client.auth.signOut();
      return json({ ok: false, message: FAILED }, 401);
    }
    return json({ ok: true });
  });
}
