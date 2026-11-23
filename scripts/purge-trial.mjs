#!/usr/bin/env node
// @ts-check
/**
 * 만료된 공개 체험 정리 (수동) — 크론과 같은 일을 사람이 실행
 *   node --env-file=.env.local scripts/purge-trial.mjs           # 미리 보기 (지울 익명 계정 수)
 *   node --env-file=.env.local scripts/purge-trial.mjs --apply   # 정리 실행
 * DB 정리 함수(svc_*)만 호출하고, Auth 계정은 익명 계정인지 다시 확인한 뒤에만 삭제. 값은 출력하지 않음.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
if (!url || !key || !/^[a-z]{20}$/.test(ref) || new URL(url).hostname !== `${ref}.supabase.co`) {
  console.error("중단: DB 주소·서버 키·SUPABASE_PROJECT_REF 를 확인하세요.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
if (!APPLY) {
  const { data, error } = await admin.rpc("svc_trial_users_to_delete", { p_limit: 1000 });
  if (error) {
    console.error(`중단: ${error.code ?? ""}`);
    process.exit(1);
  }
  console.log(`정리가 끝나 지울 수 있는 익명 체험 계정: ${(data ?? []).length}개 (만료됐지만 아직 정리 안 된 체험은 --apply 때 함께 정리)`);
  process.exit(0);
}
const { data: purged, error: pe } = await admin.rpc("svc_purge_expired_trials", { p_limit: 500 });
if (pe) {
  console.error(`중단: ${pe.code ?? ""}`);
  process.exit(1);
}
const { data: ids } = await admin.rpc("svc_trial_users_to_delete", { p_limit: 1000 });
let deleted = 0;
for (const id of /** @type {string[]} */ (ids ?? [])) {
  const { data } = await admin.auth.admin.getUserById(id);
  if (data?.user?.is_anonymous !== true) continue; // 익명 계정이 아니면 지우지 않음
  if (!(await admin.auth.admin.deleteUser(id)).error) deleted++;
}
console.log(`✓ 만료 체험 ${purged}건 정리, 익명 계정 ${deleted}개 삭제`);
