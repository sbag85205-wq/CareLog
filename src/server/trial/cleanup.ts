import "server-only";

/**
 * 만료된 공개 체험 정리 — 서버 키로 DB 정리 함수만 호출 (환자 기록을 직접 조회하지 않음)
 * 1. svc_purge_expired_trials: 만료 체험의 환자 행 삭제(기록 연쇄 삭제) + 계정 비활성화
 * 2. svc_trial_users_to_delete: 정리가 끝난 익명 체험 계정 목록 → 한 번 더 익명 계정인지 확인 후 Auth 계정 삭제
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CleanupResult {
  purged: number;
  deleted: number;
  skipped: number;
}

export async function cleanupExpiredTrials(admin: SupabaseClient, limit = 200): Promise<CleanupResult> {
  const { data: purged, error: pe } = await admin.rpc("svc_purge_expired_trials", { p_limit: limit });
  if (pe) throw new Error(`purge: ${pe.code ?? ""}`);
  const { data: ids, error: le } = await admin.rpc("svc_trial_users_to_delete", { p_limit: limit });
  if (le) throw new Error(`list: ${le.code ?? ""}`);
  let deleted = 0;
  let skipped = 0;
  for (const id of (ids ?? []) as string[]) {
    const { data } = await admin.auth.admin.getUserById(id);
    // 익명 계정이 아니면 절대 지우지 않음 (DB 목록과 Auth 상태를 이중 확인)
    if (!data?.user || data.user.is_anonymous !== true) {
      skipped++;
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) skipped++;
    else deleted++;
  }
  return { purged: Number(purged ?? 0), deleted, skipped };
}
