/**
 * 원격 검증 공용 도구 — 가상 계정 발급·정리, 비밀값을 로그에 남기지 않는 입력, 사용자 세션
 * (값은 메모리에만 두고 출력하지 않음)
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";
import { generateLoginCode } from "../src/lib/patient-auth/rules";

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DOMAIN = process.env.CARELOG_PATIENT_EMAIL_DOMAIN ?? "carelog.invalid";

export type VPatient = { label: string; name: string; uid: string; pid: string; email: string; code: string; birth: string; password: string };
export type VMember = { label: string; name: string; uid: string; email: string; password: string };

const created: { uid?: string; pid?: string }[] = [];
const randPassword = () => `Cl${randomBytes(12).toString("base64url")}7`;

function virtualBirth(): string {
  const t = Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 50 * 365) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
}

export async function provisionPatient(label: string): Promise<VPatient> {
  const email = `patient-${randomUUID()}@${DOMAIN}`;
  const name = `가상 검증 ${label} (자동 삭제)`;
  const rec: { uid?: string; pid?: string } = {};
  created.push(rec);
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (ue) throw new Error(`Auth 계정 생성 실패: ${ue.status ?? ""} ${ue.code ?? ue.message}`);
  rec.uid = u.user.id;
  const { data: p, error: pe } = await admin.from("patients").insert({ profile_id: u.user.id, display_name: name }).select("id").single();
  if (pe) throw new Error(`환자 생성 실패: ${pe.code}`);
  rec.pid = p.id;
  const code = generateLoginCode();
  const birth = virtualBirth();
  const { error: re } = await admin.rpc("svc_register_patient_credential", {
    p_patient_id: p.id,
    p_login_code: code,
    p_birth_date: `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`,
  });
  if (re) throw new Error(`환자 코드 등록 실패: ${re.code}`);
  return { label, name, uid: u.user.id, pid: p.id, email, code, birth, password: randPassword() };
}

/** 관리자가 준비하는 의료진·보호자 가상 계정 (역할은 서버 키로만 부여) */
export async function provisionMember(label: string, role: "staff" | "guardian"): Promise<VMember> {
  const email = `${role}-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  const name = `가상 검증 ${label}`;
  const password = randPassword();
  const rec: { uid?: string } = {};
  created.push(rec);
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw new Error(`Auth 계정 생성 실패: ${error.status ?? ""} ${error.code ?? error.message}`);
  rec.uid = u.user.id;
  const { error: re } = await admin.from("profiles").update({ role, display_name: name }).eq("id", u.user.id);
  if (re) throw new Error(`역할 지정 실패: ${re.code}`);
  return { label, name, uid: u.user.id, email, password };
}

export async function assignStaff(staff: VMember, patient: VPatient) {
  const { error } = await admin.from("staff_assignments").insert({ patient_id: patient.pid, staff_id: staff.uid });
  if (error) throw new Error(`배정 실패: ${error.code}`);
}

/** 검증용 가상 계정 삭제 (환자 행 → 기록·요청·약·초대·공유 연쇄 삭제, 이어서 Auth 계정) */
export async function cleanup() {
  for (const r of created) if (r.pid) await admin.from("patients").delete().eq("id", r.pid);
  for (const r of created) if (r.uid) await admin.auth.admin.deleteUser(r.uid);
  created.length = 0;
}

/** 사용자 본인 세션 (Publishable key + 비밀번호 로그인) → 실제 RLS 적용 */
export async function userSession(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`사용자 세션 로그인 실패: ${error.status ?? ""} ${error.code ?? ""}`);
  return c;
}

/** 값이 로그에 남지 않게 입력 (React 제어 입력에 맞게 input 이벤트 발생) */
export async function typeSecret(locator: Locator, value: string) {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

/** 배포 주소(/) → 처음 이용하기 → 비밀번호 설정 → /my */
export async function patientFirstUse(page: Page, v: VPatient) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("tab", { name: "처음 이용하기" }).click();
  await typeSecret(page.getByLabel("환자 코드"), v.code);
  await typeSecret(page.getByLabel("생년월일 8자리"), v.birth);
  await page.getByRole("button", { name: "본인 확인하고 시작하기" }).click();
  await expect(page.getByText("10분 안에 새 비밀번호를 설정해 주세요")).toBeVisible();
  await typeSecret(page.getByLabel("새 비밀번호", { exact: true }), v.password);
  await typeSecret(page.getByLabel("새 비밀번호 확인"), v.password);
  await page.getByRole("button", { name: "설정하고 내 건강기록으로" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("heading", { name: `${v.name} 님, 안녕하세요.` })).toBeVisible();
}

export async function patientLogin(page: Page, v: VPatient) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await typeSecret(page.getByLabel("환자 코드"), v.code);
  await typeSecret(page.getByLabel("비밀번호", { exact: true }), v.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
}

/** 보호자·의료진 로그인 폼 (이메일 + 비밀번호) */
export async function memberLoginForm(page: Page, m: VMember) {
  await typeSecret(page.getByLabel("이메일"), m.email);
  await typeSecret(page.getByLabel("비밀번호", { exact: true }), m.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}

export async function fillCondition(page: Page | Locator, score: number) {
  await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: new RegExp(`^${score}점`) }).click();
  await page.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
  await page.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(3).click();
  await page.getByRole("group", { name: "식사량" }).getByRole("button", { name: "대부분" }).click();
  await page.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "좋음" }).click();
}

export const menu = (page: Page, name: string) => page.getByRole("navigation", { name: "메뉴" }).getByRole("button", { name, exact: true });

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

/**
 * 화면 확인용 캡처 — E2E_REMOTE_SHOTS_DIR 를 지정했을 때만 저장 (기본: 저장 안 함)
 * 초대 링크·환자 코드·생년월일·비밀번호가 보이는 화면에서는 호출하지 않음
 */
export async function shot(page: Page, name: string) {
  const dir = process.env.E2E_REMOTE_SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
