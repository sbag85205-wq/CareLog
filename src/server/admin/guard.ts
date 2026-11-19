import "server-only";
import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSameOrigin, json } from "@/server/patient-auth/http";
import { getAdminClient, isAdminConfigured } from "@/server/supabase/admin";
import { createSessionClient } from "@/server/supabase/session";

/**
 * 관리자 API 공통 검사 — 모두 서버에서 확인
 * 1) 같은 출처 요청 2) 로그인 세션 3) admin_users 행 (서버 키로 다시 확인) 4) 비활성화되지 않은 계정
 * 통과하면 서버 키 클라이언트를 돌려줌 (서버 키는 이 파일 밖·브라우저로 나가지 않음)
 */
export async function requireAdmin(req: NextRequest) {
  if (!isSupabaseConfigured() || !isAdminConfigured()) {
    return { error: json({ ok: false, message: "DB 연결 설정이 없습니다." }, 503) } as const;
  }
  if (!isSameOrigin(req)) return { error: json({ ok: false, message: "허용되지 않은 요청입니다." }, 403) } as const;
  const session = await createSessionClient();
  const { data } = await session.auth.getUser();
  if (!data.user) return { error: json({ ok: false, message: "로그인이 필요합니다." }, 401) } as const;
  const admin = getAdminClient();
  const [{ data: row }, { data: prof }] = await Promise.all([
    admin.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle(),
    admin.from("profiles").select("disabled_at").eq("id", data.user.id).maybeSingle(),
  ]);
  if (!row || prof?.disabled_at) return { error: json({ ok: false, message: "관리자만 사용할 수 있습니다." }, 403) } as const;
  return { admin, adminUserId: data.user.id } as const;
}
