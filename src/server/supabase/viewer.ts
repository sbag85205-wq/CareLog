import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asAppRole, type AppRole } from "@/lib/roles";

/** 로그인 세션의 사용자와 역할 (역할은 profiles 본인 행 — RLS로 본인 것만 읽힘, 관리자만 변경 가능) */
export async function getViewer(client: SupabaseClient): Promise<{ userId: string; role: AppRole } | null> {
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: prof } = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return { userId: data.user.id, role: asAppRole(prof?.role) };
}
