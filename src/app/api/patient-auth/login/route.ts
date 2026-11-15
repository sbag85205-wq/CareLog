import type { NextRequest } from "next/server";
import { PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";
import { clientKey, guard, json, limiters, readJson, str } from "@/server/patient-auth/http";
import { withMinDuration } from "@/server/patient-auth/rate-limit";
import { loginWithCode } from "@/server/patient-auth/service";
import { supabasePatientAuthDeps } from "@/server/patient-auth/supabase-deps";

/** 로그인: 환자 코드 + 비밀번호 → Supabase Auth 세션(쿠키) */
export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  return withMinDuration(600, async () => {
    if (!limiters.login.hit(clientKey(req))) return json({ ok: false, message: M.loginFailed }, 429);
    const body = await readJson(req);
    const code = str(body?.loginCode, 40);
    const password = str(body?.password, 200);
    if (!code || !password) return json({ ok: false, message: M.loginFailed }, 401);

    const result = await loginWithCode(supabasePatientAuthDeps(), code, password);
    if (!result.ok) return json({ ok: false, message: result.message }, result.status);
    return json({ ok: true });
  });
}
