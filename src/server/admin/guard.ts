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
  const [{ data: row, error: re }, { data: prof, error: pe }] = await Promise.all([
    admin.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle(),
    admin.from("profiles").select("disabled_at").eq("id", data.user.id).maybeSingle(),
  ]);
  // 서버 키로 조회 자체가 실패하면(키 오류·다른 프로젝트 키 등) 권한 없음이 아니라 설정 오류로 알림
  if (re || pe) {
    const e = (re ?? pe)!;
    console.error(`[admin] 관리자 확인 실패 (서버 키 조회 오류): ${e.code ?? ""} ${e.message.slice(0, 80)}`);
    return {
      error: json(
        { ok: false, message: "서버 설정 문제로 관리자 여부를 확인하지 못했습니다. 배포 환경변수 SUPABASE_SECRET_KEY(현재 프로젝트의 Secret key)를 확인해 주세요." },
        503,
      ),
    } as const;
  }
  if (!row || prof?.disabled_at) return { error: json({ ok: false, message: "관리자만 사용할 수 있습니다." }, 403) } as const;
  return { admin, adminUserId: data.user.id } as const;
}
