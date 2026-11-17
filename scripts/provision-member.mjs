#!/usr/bin/env node
// ============================================================================
// CareLog — 간호사·의료진 / 보호자 가상 계정 준비 + 담당 환자 배정 (carelog-dev 전용, 관리자 실행)
//
//   node --env-file=.env.local scripts/provision-member.mjs
//
// 메뉴
//   1. 간호사·의료진 계정 만들기   (이메일·비밀번호 로그인, 역할 staff는 서버 키로만 부여)
//   2. 보호자 계정 만들기          (역할 guardian — 환자의 초대를 수락해야 정보가 보임)
//   3. 담당 환자 배정              (의료진 이메일 + 환자 선택 → staff_assignments)
//   4. 현황 보기                   (가상 계정·배정 목록, 비밀값 없음)
//
// 보안
//   * SUPABASE_SECRET_KEY 는 .env.local 에서만 읽음 (명령줄 인자 없음, 출력 안 함)
//   * 비밀번호는 화면에 보이지 않게 두 번 입력받고 출력·파일 저장하지 않음
//   * NEXT_PUBLIC_SUPABASE_URL 이 SUPABASE_PROJECT_REF(carelog-dev)와 다르면 중단
//   * 기존 계정·기록을 지우거나 비밀번호를 바꾸지 않음 (같은 이메일이 있으면 중단)
//   * 가상 이메일·이름만 사용 (예: nurse1@carelog.invalid)
// ============================================================================
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

function die(msg) {
  console.error(`중단: ${msg}`);
  process.exit(1);
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
if (!url || !secret) die("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 .env.local 에 없습니다.");
if (!/^[a-z]{20}$/.test(ref) || url !== `https://${ref}.supabase.co`) {
  die("NEXT_PUBLIC_SUPABASE_URL 이 SUPABASE_PROJECT_REF(carelog-dev)와 일치하지 않습니다. 다른 프로젝트일 수 있어 진행하지 않습니다.");
}
if (!process.stdin.isTTY) die("터미널에서 직접 실행해 주세요 (비밀번호를 화면에 보이지 않게 입력받기 위해).");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLE_NAME = { staff: "간호사·의료진", guardian: "보호자" };

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`계정 목록 조회 실패 (${error.status ?? ""} ${error.code ?? ""})`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function createMember(role) {
  console.log(`\n${ROLE_NAME[role]} 가상 계정 만들기 — 실제 이메일·실명을 쓰지 마세요.`);
  const email = (await ask(`이메일 (예: ${role === "staff" ? "nurse1" : "guardian1"}@carelog.invalid): `)).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die("이메일 형식이 아닙니다.");
  if (email.startsWith("patient-")) die("patient- 로 시작하는 주소는 환자 내부용입니다.");
  if (await findUserByEmail(email)) die("이미 있는 이메일입니다. 기존 계정은 바꾸지 않습니다.");
  const name = (await ask(`표시 이름 (예: ${role === "staff" ? "가상 간호사 김" : "가상 보호자 이"}): `)) || `가상 ${ROLE_NAME[role]}`;
  if (name.length > 50) die("표시 이름은 50자 이하");
  const pw1 = await ask("비밀번호 (8자 이상, 영문+숫자, 화면에 표시되지 않음): ", { hidden: true });
  const pw2 = await ask("한 번 더 입력: ", { hidden: true });
  if (pw1 !== pw2) die("두 비밀번호가 다릅니다.");
  if (pw1.length < 8 || !/[A-Za-z]/.test(pw1) || !/[0-9]/.test(pw1)) die("비밀번호는 8자 이상, 영문과 숫자를 함께 사용해 주세요.");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw1,
    email_confirm: true, // 관리자가 준비한 가상 계정 — 확인 메일 발송 없음 (프로젝트 Confirm email 설정은 변경하지 않음)
    user_metadata: { display_name: name },
  });
  if (error) die(`계정 생성 실패 (${error.status ?? ""} ${error.code ?? error.message})`);
  const uid = data.user.id;
  // 역할은 서버 키(service_role)로만 변경 가능 — 화면에서 고를 수 없음
  const { error: re } = await admin.from("profiles").update({ role, display_name: name }).eq("id", uid);
  if (re) {
    await admin.auth.admin.deleteUser(uid);
    die(`역할 지정 실패 (${re.code}) — 방금 만든 계정은 정리했습니다.`);
  }
  console.log(`\n완료: ${ROLE_NAME[role]} 계정 ${email} (${name})`);
  console.log(role === "staff" ? "다음: 메뉴 3에서 담당 환자를 배정하세요." : "다음: 환자가 /my → 보호자 공유에서 이 이메일로 초대 링크를 만들어 전달합니다.");
}

async function listPatients() {
  const { data, error } = await admin.from("patients").select("id, display_name, demo_code, care_mode, created_at").order("created_at");
  if (error) die(`환자 목록 조회 실패 (${error.code})`);
  return data;
}

async function assign() {
  const email = (await ask("\n담당 의료진 이메일: ")).toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) die("해당 이메일의 계정이 없습니다.");
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "staff") die("간호사·의료진 역할 계정이 아닙니다 (메뉴 1로 만든 계정만 배정 가능).");
  const patients = await listPatients();
  if (!patients.length) die("환자가 없습니다. scripts/provision-virtual-patient.mjs 로 먼저 발급하세요.");
  patients.forEach((p, i) => console.log(`  ${i + 1}. ${p.display_name}${p.demo_code ? ` (${p.demo_code})` : ""}`));
  const pick = await ask("배정할 환자 번호 (여러 명은 쉼표, 예: 1,2): ");
  const chosen = pick
    .split(",")
    .map((s) => Number(s.trim()) - 1)
    .filter((i) => Number.isInteger(i) && patients[i]);
  if (!chosen.length) die("선택한 환자가 없습니다.");
  for (const i of chosen) {
    const { error } = await admin
      .from("staff_assignments")
      .upsert({ patient_id: patients[i].id, staff_id: user.id }, { onConflict: "patient_id,staff_id", ignoreDuplicates: true });
    if (error) die(`배정 실패 (${error.code} ${error.message})`);
    console.log(`  배정: ${patients[i].display_name} ← ${email}`);
  }
}

async function status() {
  const { data: profs } = await admin.from("profiles").select("id, role, display_name").in("role", ["staff", "guardian"]);
  const { data: asg } = await admin.from("staff_assignments").select("patient_id, staff_id");
  const patients = await listPatients();
  const name = (pid) => patients.find((p) => p.id === pid)?.display_name ?? "?";
  console.log("\n간호사·의료진 / 보호자 계정");
  for (const p of profs ?? []) {
    const mine = (asg ?? []).filter((a) => a.staff_id === p.id).map((a) => name(a.patient_id));
    console.log(`  - [${ROLE_NAME[p.role]}] ${p.display_name || "(이름 없음)"}${p.role === "staff" ? ` · 담당: ${mine.join(", ") || "없음"}` : ""}`);
  }
  console.log(`환자 ${patients.length}명: ${patients.map((p) => p.display_name + (p.demo_code ? `(${p.demo_code})` : "")).join(", ") || "없음"}`);
}

console.log("CareLog 가상 계정 준비 (carelog-dev)");
console.log("  1) 간호사·의료진 계정 만들기\n  2) 보호자 계정 만들기\n  3) 담당 환자 배정\n  4) 현황 보기");
const choice = await ask("번호: ");
try {
  if (choice === "1") await createMember("staff");
  else if (choice === "2") await createMember("guardian");
  else if (choice === "3") await assign();
  else if (choice === "4") await status();
  else die("1~4 중에서 골라 주세요.");
} catch (e) {
  die(e.message);
}
