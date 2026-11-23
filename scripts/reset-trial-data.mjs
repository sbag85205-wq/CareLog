#!/usr/bin/env node
// @ts-check
/**
 * 공개 체험 계정 기록 초기화 (carelog-public 체험용)
 *
 *   node --env-file=.env.local --env-file=.env.trial.local scripts/reset-trial-data.mjs            # 미리 보기 (지울 대상·건수만)
 *   node --env-file=.env.local --env-file=.env.trial.local scripts/reset-trial-data.mjs --apply    # 삭제
 *   ... --apply --seed                                                                              # 삭제 후 가상 예시 기록 넣기
 *
 * 필요한 값 (출력하지 않음): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PROJECT_REF,
 *   CARELOG_TRIAL_ACCOUNTS="환자ID:Auth사용자ID,…" (.env.trial.local — Git 제외)
 * 계정·로그인 정보·환자 행·공유 관계는 그대로 둡니다. 확인을 하나라도 통과하지 못하면 아무것도 지우지 않습니다.
 */
import { createClient } from "@supabase/supabase-js";
import { applyReset, countPlan, parseTargets, RESET_TABLES, seedSample, verifyTargets } from "./trial/reset-core.mjs";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const SEED = args.has("--seed");

function die(msg) {
  console.error(`중단: ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 없습니다.");
if (!/^[a-z]{20}$/.test(ref) || new URL(url).hostname !== `${ref}.supabase.co`) die("DB 주소가 SUPABASE_PROJECT_REF 프로젝트와 다릅니다.");
if (SEED && !APPLY) die("--seed 는 --apply 와 함께만 씁니다.");

let targets;
try {
  targets = parseTargets(process.env.CARELOG_TRIAL_ACCOUNTS);
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const check = await verifyTargets(client, targets);
if (!check.ok) {
  for (const e of check.errors) console.error(`  ✗ ${e}`);
  die("체험 계정 확인을 통과하지 못해 아무것도 지우지 않았습니다.");
}

const plan = await countPlan(client, check.verified);
console.log(`▶ 초기화 대상 체험 계정 ${check.verified.length}개 (환자 행·계정·로그인 정보·공유 관계는 유지)`);
let total = 0;
for (const v of check.verified) {
  const row = plan[v.patientId];
  const sum = Object.values(row).reduce((a, n) => a + (n ?? 0), 0);
  total += sum;
  console.log(`  - ${v.name} [${v.patientId.slice(0, 8)}…] 지울 기록 ${sum}건`);
  console.log(`    ${RESET_TABLES.map((t) => `${t} ${row[t] ?? "표 없음"}`).join(" · ")}`);
}
console.log(`  합계 ${total}건`);

if (!APPLY) {
  console.log("미리 보기만 했어요. 지우려면 --apply 를 붙여 다시 실행하세요.");
  process.exit(0);
}

const deleted = await applyReset(client, check.verified);
const n = Object.values(deleted).flatMap((t) => Object.values(t)).reduce((a, b) => a + b, 0);
console.log(`✓ ${n}건을 지웠어요 (남은 기록 0건 확인).`);

if (SEED) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  for (const v of check.verified) await seedSample(client, v, today);
  console.log(`✓ 체험 계정 ${check.verified.length}개에 가상 예시 기록을 넣었어요.`);
}
