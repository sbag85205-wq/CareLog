#!/usr/bin/env node
// ============================================================================
// CareLog — 가상 환자 계정 발급 (carelog-dev 전용, 관리자가 직접 실행)
//
//   node --env-file=.env.local scripts/provision-virtual-patient.mjs
//
// 하는 일
//   1. Supabase Auth 계정 생성 (내부용 무작위 이메일, 알 수 없는 무작위 임시 비밀번호, 메일 발송 없음)
//   2. patients 행 생성 (표시 이름, 표시용 demo_code)
//   3. 추측하기 어려운 환자 코드 발급 → DB에는 해시만 저장 (svc_register_patient_credential)
//   4. 환자 코드를 화면에 1회 표시 (다시 볼 수 없음)
//
// 보안
//   * SUPABASE_SECRET_KEY 는 .env.local 에서만 읽음 (명령줄 인자 없음, 출력 안 함)
//   * 생년월일은 화면에 보이지 않게 입력받고 출력·파일 저장하지 않음
//   * NEXT_PUBLIC_SUPABASE_URL 이 SUPABASE_PROJECT_REF(carelog-dev)와 다르면 중단
//   * 가상 정보만 입력 (실명·실제 생년월일 금지)
// ============================================================================
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function die(msg) {
  console.error(`중단: ${msg}`);
  process.exit(1);
}

function generateLoginCode() {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < 12) {
    for (const b of randomBytes(32)) if (b < limit && out.length < 12) out += ALPHABET[b % ALPHABET.length];
  }
  return out.match(/.{4}/g).join("-");
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function validBirth(s) {
  if (!/^\d{8}$/.test(s)) return null;
  const [y, m, d] = [s.slice(0, 4), s.slice(4, 6), s.slice(6, 8)].map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() > Date.now()) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
if (!url || !secret) die("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 .env.local 에 없습니다.");
if (!/^[a-z]{20}$/.test(ref) || url !== `https://${ref}.supabase.co`) {
  die("NEXT_PUBLIC_SUPABASE_URL 이 SUPABASE_PROJECT_REF(carelog-dev)와 일치하지 않습니다. 다른 프로젝트일 수 있어 진행하지 않습니다.");
}
if (!process.stdin.isTTY) die("터미널에서 직접 실행해 주세요 (생년월일을 화면에 보이지 않게 입력받기 위해).");

const domain = process.env.CARELOG_PATIENT_EMAIL_DOMAIN ?? "carelog.invalid";
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

console.log("CareLog 가상 환자 발급 (carelog-dev) — 실명·실제 생년월일을 입력하지 마세요.\n");
const displayName = (await ask("표시 이름 (예: 가상 환자 A): ")) || "가상 환자";
if (displayName.length > 50) die("표시 이름은 50자 이하");
const demoCode = (await ask("표시용 코드 (예: P101, 비우면 없음): ")).toUpperCase();
if (demoCode && !/^[A-Z]{1,3}[0-9]{3}$/.test(demoCode)) die("표시용 코드 형식: 영문 1~3자 + 숫자 3자리");
const birth1 = await ask("가상 생년월일 8자리 YYYYMMDD (화면에 표시되지 않음): ", { hidden: true });
const birth2 = await ask("한 번 더 입력: ", { hidden: true });
const birthIso = validBirth(birth1);
if (!birthIso || birth1 !== birth2) die("생년월일이 올바르지 않거나 두 입력이 다릅니다.");

const loginCode = generateLoginCode();
let userId = null;
let patientId = null;
try {
  const { data: created, error: ce } = await admin.auth.admin.createUser({
    email: `patient-${randomUUID()}@${domain}`,
    password: randomBytes(32).toString("base64url"), // 아무도 모르는 임시 비밀번호 (최초 설정 전 로그인 불가)
    email_confirm: true, // 내부용 주소 — 확인 메일 발송 없음 (프로젝트 Confirm email 설정은 변경하지 않음)
    user_metadata: { display_name: displayName },
  });
  if (ce) throw new Error(`Auth 계정 생성 실패 (${ce.status ?? ""} ${ce.code ?? ce.message})`);
  userId = created.user.id;

  const { data: patient, error: pe } = await admin
    .from("patients")
    .insert({ profile_id: userId, display_name: displayName, demo_code: demoCode || null })
    .select("id")
    .single();
  if (pe) throw new Error(`환자 생성 실패 (${pe.code} ${pe.message})`);
  patientId = patient.id;

  const { error: re } = await admin.rpc("svc_register_patient_credential", {
    p_patient_id: patientId,
    p_login_code: loginCode,
    p_birth_date: birthIso,
  });
  if (re) throw new Error(`환자 코드 등록 실패 (${re.code} ${re.message})`);
} catch (e) {
  console.error(`오류: ${e.message}`);
  // 정리: 중간까지 만든 가상 계정 삭제
  if (patientId) await admin.from("patients").delete().eq("id", patientId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.error("만들던 가상 계정을 정리했습니다.");
  process.exit(1);
}

console.log("\n발급 완료 ─────────────────────────────────────");
console.log(`  표시 이름 : ${displayName}${demoCode ? ` (${demoCode})` : ""}`);
console.log(`  환자 코드 : ${loginCode}`);
console.log("────────────────────────────────────────────────");
console.log("환자 코드는 지금만 표시됩니다 (DB에는 해시만 저장). 입력한 가상 생년월일과 함께 따로 메모해 두세요.");
console.log("다음: 앱 /login → '처음 이용하기'에서 환자 코드 + 생년월일 → 새 비밀번호 설정");
