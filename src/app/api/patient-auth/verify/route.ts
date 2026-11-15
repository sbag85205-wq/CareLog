import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { todayISO } from "@/lib/date";
import { parseBirthDate8, PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";
import { clientKey, guard, json, limiters, readJson, SETUP_COOKIE, SETUP_COOKIE_PATH, str } from "@/server/patient-auth/http";
import { withMinDuration } from "@/server/patient-auth/rate-limit";
import { SETUP_TOKEN_TTL_SECONDS, verifyFirstAccess } from "@/server/patient-auth/service";
import { supabasePatientAuthDeps } from "@/server/patient-auth/supabase-deps";

/** 처음 이용하기: 환자 코드 + 생년월일 → 비밀번호 설정용 일회용 권한(httpOnly 쿠키) */
export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  return withMinDuration(600, async () => {
    if (!limiters.verify.hit(clientKey(req))) return json({ ok: false, message: M.verifyFailed }, 429);
    const body = await readJson(req);
    const code = str(body?.loginCode, 40);
    const birth = str(body?.birthDate, 8);
    const birthIso = birth ? parseBirthDate8(birth, todayISO()) : null;
    if (!code || !birthIso) return json({ ok: false, message: M.verifyFailed }, 401);

    const result = await verifyFirstAccess(supabasePatientAuthDeps(), code, birthIso);
    if (!result.ok) return json({ ok: false, message: result.message }, result.status);

    (await cookies()).set(SETUP_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: SETUP_COOKIE_PATH,
      maxAge: SETUP_TOKEN_TTL_SECONDS,
    });
    return json({ ok: true, expiresInSeconds: SETUP_TOKEN_TTL_SECONDS });
  });
}
