import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";
import { clientKey, guard, json, limiters, readJson, SETUP_COOKIE, SETUP_COOKIE_PATH, str } from "@/server/patient-auth/http";
import { setPasswordWithToken } from "@/server/patient-auth/service";
import { supabasePatientAuthDeps } from "@/server/patient-auth/supabase-deps";

/** 새 비밀번호 설정 — 일회용 권한 쿠키가 있어야 하며, 성공하면 바로 로그인 세션 발급 */
export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  if (!limiters.setPassword.hit(clientKey(req))) return json({ ok: false, message: M.setupExpired }, 429);

  const body = await readJson(req);
  const password = str(body?.password, 200);
  const confirm = str(body?.passwordConfirm, 200);
  if (password === null || confirm === null) return json({ ok: false, message: M.badRequest }, 400);

  const store = await cookies();
  const token = store.get(SETUP_COOKIE)?.value;
  const result = await setPasswordWithToken(supabasePatientAuthDeps(), token, password, confirm);

  // 설정 완료 또는 권한 만료 시 쿠키 제거 (저장 실패·규칙 위반이면 유지 → 유효기간 안에서 재시도)
  if (result.ok || result.status === 401) {
    store.set(SETUP_COOKIE, "", { httpOnly: true, sameSite: "strict", path: SETUP_COOKIE_PATH, maxAge: 0 });
  }
  if (!result.ok) return json({ ok: false, message: result.message }, result.status);
  return json({ ok: true, signedIn: result.signedIn });
}
