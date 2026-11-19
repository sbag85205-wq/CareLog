import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAppRole, type AppRole } from "@/lib/roles";

export interface Viewer {
  userId: string;
  role: AppRole;
  /** 관리자가 비활성화한 계정 */
  disabled: boolean;
}

/**
 * 로그인 세션의 사용자와 역할
 * - 역할: profiles.role(관리자만 변경) / 관리자: admin_users 본인 행 (둘 다 RLS로 본인 것만 읽힘)
 */
export async function getViewer(client: SupabaseClient): Promise<Viewer | null> {
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const [{ data: prof }, { data: adm }] = await Promise.all([
    client.from("profiles").select("role, disabled_at").eq("id", data.user.id).maybeSingle(),
    client.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle(),
  ]);
  return { userId: data.user.id, role: adm ? "admin" : asAppRole(prof?.role), disabled: Boolean(prof?.disabled_at) };
}
