import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { searchDrugs } from "@/server/mfds/drug-search";
import { clientKey, isSameOrigin, json, readJson } from "@/server/patient-auth/http";
import { createRateLimiter } from "@/server/patient-auth/rate-limit";
import { createSessionClient } from "@/server/supabase/session";

const limiter = createRateLimiter(30, 60_000);

const MESSAGES = {
  bad_query: "약 이름을 2자 이상(또는 보험코드 9자리) 입력해 주세요.",
  not_configured: "지금은 식약처 검색을 사용할 수 없어요. 약 이름을 직접 입력해 저장할 수 있어요.",
  upstream: "식약처 검색이 잠시 응답하지 않아요. 약 이름을 직접 입력해 저장할 수 있어요.",
} as const;

/**
 * 내 약 추가 — 식약처 의약품 제품 허가정보 검색 (서버에서만 외부 호출)
 * - 로그인한 사용자만 (공공 API 사용량 보호)
 * - 검색어는 요청 본문(POST)으로 받아 주소·접근 로그에 남지 않게 함, 외부 API에는 검색어만 전달
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403);
  if (!isSupabaseConfigured()) return json({ ok: false, message: MESSAGES.not_configured }, 503);
  const { data } = await (await createSessionClient()).auth.getUser();
  if (!data.user) return json({ ok: false, message: "로그인이 필요합니다." }, 401);
  if (!limiter.hit(`${data.user.id}:${clientKey(req)}`)) {
    return json({ ok: false, message: "검색 요청이 많아요. 잠시 후 다시 시도해 주세요." }, 429);
  }
  const body = await readJson(req);
  // 약 이름 검색어 또는 처방전에서 읽은 보험코드(9자리) 중 하나만 받음
  const r = await searchDrugs(typeof body?.edi === "string" ? { edi: body.edi } : body?.q);
  if (!r.ok) {
    const status = r.reason === "bad_query" ? 400 : 503;
    return json({ ok: false, reason: r.reason, message: MESSAGES[r.reason] }, status);
  }
  return json({ ok: true, items: r.items, total: r.total });
}
