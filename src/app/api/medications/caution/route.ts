import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDrugCaution } from "@/server/mfds/drug-search";
import { clientKey, isSameOrigin, json, readJson } from "@/server/patient-auth/http";
import { createRateLimiter } from "@/server/patient-auth/rate-limit";
import { createSessionClient } from "@/server/supabase/session";

const limiter = createRateLimiter(60, 60_000);

/**
 * 고른 제품의 식약처 주의사항(요약) — 서버에서만 외부 호출, 외부로는 품목기준코드만
 * 로그인한 사용자만, 품목기준코드는 요청 본문으로
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403);
  if (!isSupabaseConfigured()) return json({ ok: false, message: "식약처 정보를 가져올 수 없어요." }, 503);
  const { data } = await (await createSessionClient()).auth.getUser();
  if (!data.user) return json({ ok: false, message: "로그인이 필요합니다." }, 401);
  if (!limiter.hit(`${data.user.id}:${clientKey(req)}`)) return json({ ok: false, message: "요청이 많아요. 잠시 후 다시 시도해 주세요." }, 429);
  const body = await readJson(req);
  const r = await getDrugCaution(body?.itemSeq);
  if (!r.ok) {
    const status = r.reason === "bad_query" ? 400 : r.reason === "not_found" ? 404 : 503;
    return json({ ok: false, reason: r.reason, message: "식약처 주의사항을 가져오지 못했어요. 필요하면 직접 적어 주세요." }, status);
  }
  return json({ ok: true, caution: r.caution });
}
