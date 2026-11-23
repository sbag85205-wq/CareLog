/**
 * 원격 검증 공용 도구 — 가상 계정 발급·정리, 비밀값을 로그에 남기지 않는 입력, 사용자 세션
 * (값은 메모리에만 두고 출력하지 않음)
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";
import { loginIdToEmail } from "../src/lib/patient-auth/login-id";
import { generateLoginCode } from "../src/lib/patient-auth/rules";

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DOMAIN = process.env.CARELOG_PATIENT_EMAIL_DOMAIN ?? "carelog.invalid";

export type VPatient = { label: string; name: string; uid: string; pid: string; email: string; loginId: string; password: string };
export type VMember = { label: string; name: string; uid: string; email: string; password: string };

const created: { uid?: string; pid?: string }[] = [];
export const randPassword = () => `Cl${randomBytes(12).toString("base64url")}7`;
export const randLoginId = (prefix = "t") => `${prefix}${randomBytes(6).toString("hex")}`;

/** 정리 대상으로 등록 (관리자 화면에서 만든 계정 등) */
export function track(uid?: string, pid?: string) {
  created.push({ uid, pid });
}

/** 관리자가 아이디로 발급하는 환자 (테스트 계정 표시) */
export async function provisionPatient(label: string): Promise<VPatient> {
  const loginId = randLoginId();
  const email = loginIdToEmail(loginId);
  const name = `가상 검증 ${label} (자동 삭제)`;
  const password = randPassword();
  const rec: { uid?: string; pid?: string } = {};
  created.push(rec);
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata: { carelog_test: true },
  });
  if (ue) throw new Error(`Auth 계정 생성 실패: ${ue.status ?? ""} ${ue.code ?? ue.message}`);
  rec.uid = u.user.id;
  const { data: p, error: pe } = await admin.from("patients").insert({ profile_id: u.user.id, display_name: name }).select("id").single();
  if (pe) throw new Error(`환자 생성 실패: ${pe.code}`);
  rec.pid = p.id;
  return { label, name, uid: u.user.id, pid: p.id, email, loginId, password };
}

/** 이전 방식(환자 코드) 환자 — 아이디 없음, 비밀번호는 이미 설정한 상태 */
export async function provisionLegacyPatient(label: string): Promise<VPatient> {
  const email = `patient-${randomUUID()}@${DOMAIN}`;
  const name = `가상 검증 ${label} (자동 삭제)`;
  const password = randPassword();
  const rec: { uid?: string; pid?: string } = {};
  created.push(rec);
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (ue) throw new Error(`Auth 계정 생성 실패: ${ue.status ?? ""} ${ue.code ?? ue.message}`);
  rec.uid = u.user.id;
  const { data: p, error: pe } = await admin.from("patients").insert({ profile_id: u.user.id, display_name: name }).select("id").single();
  if (pe) throw new Error(`환자 생성 실패: ${pe.code}`);
  rec.pid = p.id;
  const { error: re } = await admin.rpc("svc_register_patient_credential", { p_patient_id: p.id, p_login_code: generateLoginCode(), p_birth_date: "1970-01-01" });
  if (re) throw new Error(`코드 등록 실패: ${re.code}`);
  const { error: me } = await admin.rpc("svc_mark_password_set", { p_patient_id: p.id });
  if (me) throw new Error(`설정 완료 표시 실패: ${me.code}`);
  return { label, name, uid: u.user.id, pid: p.id, email, loginId: "", password };
}

/** 관리자 계정 (admin_users 는 서버 키로만 추가) */
export async function provisionAdmin(label: string): Promise<VMember> {
  const email = `admin-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  const name = `가상 검증 ${label}`;
  const password = randPassword();
  const rec: { uid?: string } = {};
  created.push(rec);
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw new Error(`Auth 계정 생성 실패: ${error.status ?? ""} ${error.code ?? error.message}`);
  rec.uid = u.user.id;
  const { error: ae } = await admin.from("admin_users").insert({ user_id: u.user.id });
  if (ae) throw new Error(`관리자 지정 실패: ${ae.code}`);
  return { label, name, uid: u.user.id, email, password };
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

/** 배포 주소(/) → /login → 아이디 + 비밀번호 → /my */
export async function patientLogin(page: Page, v: VPatient, password = v.password) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login$/);
  await typeSecret(page.getByLabel("아이디"), v.loginId);
  await typeSecret(page.getByLabel("비밀번호", { exact: true }), password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByText(`${v.name} 님의 복약 경험 기록장`)).toBeVisible();
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

/** 컨디션 기록 화면 열기: 진료 준비 → '최근 2주 컨디션 요약' 펼치기 → 컨디션 기록 열기 (오늘 날짜가 선택됨) */
export async function openConditionRecords(page: Page) {
  await menu(page, "진료 준비").click();
  const toggle = page.getByRole("button", { name: /^최근 2주 컨디션 요약/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await page.getByRole("button", { name: "컨디션 기록 열기" }).click();
}

/** 오늘 컨디션 기록 저장 */
export async function recordCondition(page: Page, score: number) {
  await openConditionRecords(page);
  await page.getByRole("button", { name: /^이 날짜 (기록하기|의 기록 수정)$/ }).click();
  const dlg = page.getByRole("dialog", { name: /기록 (작성|수정)$/ });
  await fillCondition(dlg, score);
  await dlg.getByRole("button", { name: /^기록 (저장|수정)$/ }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 날짜의 기록 수정" })).toBeVisible();
}

/** 오늘 기록의 점수 확인 (창을 열어 보고 닫음) */
export async function expectTodayCondition(page: Page, score: number) {
  await openConditionRecords(page);
  await page.getByRole("button", { name: "이 날짜의 기록 수정" }).click();
  const dlg = page.getByRole("dialog", { name: /기록 수정$/ });
  await expect(dlg.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: new RegExp(`^${score}점`) })).toHaveAttribute("aria-pressed", "true");
  await dlg.getByRole("button", { name: "닫기" }).click();
  await expect(dlg).toHaveCount(0);
}

/** 나의 약 기록 → '예전 방식으로 적어 둔 약'(직접 추가한 약 목록) 펼치기 */
export async function openLegacyMeds(page: Page) {
  await menu(page, "나의 약 기록").click();
  await page.locator("details", { hasText: "예전 방식으로 적어 둔 약" }).evaluate((el) => ((el as HTMLDetailsElement).open = true));
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
