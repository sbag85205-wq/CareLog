/**
 * carelog-dev 실제 연동 검증 (브라우저 + Supabase Auth + 실제 RLS)
 *
 * - 검증용 가상 환자 A·B를 발급하고 테스트가 끝나면 삭제
 * - 가상 생년월일·환자 코드·비밀번호는 메모리에만 두고 출력하지 않음
 *   (민감 입력은 evaluate로 넣어 Playwright 오류 로그에 값이 남지 않게 함)
 * - 건강기록 조회·저장 검증은 환자 본인 세션(Publishable key + 로그인)으로 실행 → 실제 RLS 적용
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { todayISO } from "../src/lib/date";
import { generateLoginCode } from "../src/lib/patient-auth/rules";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DOMAIN = process.env.CARELOG_PATIENT_EMAIL_DOMAIN ?? "carelog.invalid";
const VERIFY_FAILED = "입력하신 정보로 처음 이용하기를 진행할 수 없습니다";

type V = { label: string; uid: string; pid: string; email: string; code: string; birth: string; wrongBirth: string; password: string };
const created: { uid?: string; pid?: string }[] = [];

function virtualBirth(): { birth: string; wrongBirth: string } {
  const t = Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 50 * 365) * 86_400_000;
  const f = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");
  return { birth: f(t), wrongBirth: f(t + 86_400_000 * (3 + Math.floor(Math.random() * 200))) };
}

async function provision(label: string): Promise<V> {
  const email = `patient-${randomUUID()}@${DOMAIN}`;
  const rec: { uid?: string; pid?: string } = {};
  created.push(rec);
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { display_name: `가상 검증 ${label}` },
  });
  if (ue) throw new Error(`Auth 계정 생성 실패: ${ue.status ?? ""} ${ue.code ?? ue.message}`);
  rec.uid = u.user.id;
  const { data: p, error: pe } = await admin
    .from("patients")
    .insert({ profile_id: u.user.id, display_name: `가상 검증 ${label} (자동 삭제)` })
    .select("id")
    .single();
  if (pe) throw new Error(`환자 생성 실패: ${pe.code} ${pe.message}`);
  rec.pid = p.id;
  const code = generateLoginCode();
  const { birth, wrongBirth } = virtualBirth();
  const { error: re } = await admin.rpc("svc_register_patient_credential", {
    p_patient_id: p.id,
    p_login_code: code,
    p_birth_date: `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`,
  });
  if (re) throw new Error(`환자 코드 등록 실패: ${re.code} ${re.message}`);
  return { label, uid: u.user.id, pid: p.id, email, code, birth, wrongBirth, password: `Cl${randomBytes(9).toString("base64url")}7` };
}

/** 환자 본인 세션 (실제 RLS 적용) */
async function userSession(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`사용자 세션 로그인 실패: ${error.status ?? ""} ${error.code ?? ""}`);
  return c;
}

/** 값이 로그에 남지 않게 입력 (React 제어 입력에 맞게 input 이벤트 발생) */
async function typeSecret(locator: Locator, value: string) {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function firstUse(page: Page, v: V, birth: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "처음 이용하기" }).click();
  await typeSecret(page.getByLabel("환자 코드"), v.code);
  await typeSecret(page.getByLabel("생년월일 8자리"), birth);
  await page.getByRole("button", { name: "확인", exact: true }).click();
}

async function setPasswordAndEnter(page: Page, v: V) {
  await expect(page.getByText("10분 안에 새 비밀번호를 설정해 주세요")).toBeVisible();
  await typeSecret(page.getByLabel("새 비밀번호"), v.password);
  await typeSecret(page.getByLabel("비밀번호 확인"), v.password);
  await page.getByRole("button", { name: "비밀번호 설정하고 시작하기" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("heading", { name: `가상 검증 ${v.label} (자동 삭제)님, 안녕하세요` })).toBeVisible();
}

async function fillCondition(page: Page, score: number) {
  await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: new RegExp(`^${score}점`) }).click();
  await page.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
  await page.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(3).click();
  await page.getByRole("group", { name: "식사량" }).getByRole("button", { name: "대부분" }).click();
  await page.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "좋음" }).click();
}

const todayRows = async (c: SupabaseClient, pid: string) => {
  const { data, error } = await c.from("health_records").select("id, condition").eq("patient_id", pid).eq("record_date", todayISO());
  if (error) throw new Error(`조회 실패: ${error.code}`);
  return data;
};

let A: V;
let B: V;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  A = await provision("A");
  B = await provision("B");
});

test.afterAll(async () => {
  // 검증용 가상 계정 삭제 (환자 행 삭제 → 기록·코드·설정 권한 연쇄 삭제, 이어서 Auth 계정 삭제)
  for (const r of created) {
    if (r.pid) await admin.from("patients").delete().eq("id", r.pid);
    if (r.uid) await admin.auth.admin.deleteUser(r.uid);
  }
});

test("1. 비밀번호 설정 전에는 세션이 있어도 기록 조회·저장 불가 (실제 RLS)", async () => {
  // 검증용: 관리자 키로 기록 1건과 임시 비밀번호를 넣어 "설정 전 세션"을 만듦
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  await admin.from("health_records").insert({
    patient_id: A.pid, record_date: yesterday, condition: 3, pain: 1, fatigue: 2, sleep: 3, meal_intake: 50, digestion: "good", recorded_in: "outpatient",
  });
  const temp = `Tmp${randomBytes(9).toString("base64url")}9`;
  await admin.auth.admin.updateUserById(A.uid, { password: temp });
  const pre = await userSession(A.email, temp);
  const { data: rows } = await pre.from("health_records").select("id").eq("patient_id", A.pid);
  expect(rows).toEqual([]);
  const { error } = await pre.rpc("upsert_health_record", {
    p_patient_id: A.pid, p_record_date: todayISO(), p_condition: 3, p_pain: 1, p_fatigue: 2, p_sleep: 3, p_meal_intake: 50, p_digestion: "good",
  });
  expect(error?.message ?? "").toMatch(/row-level security/);
  await pre.auth.signOut();
  await admin.from("health_records").delete().eq("patient_id", A.pid);
});

test("2. A: 코드+생년월일 → 비밀번호 설정 → 저장 → 같은 날 재저장 1건 → 새로고침 → 로그아웃 → 재로그인", async ({ page }) => {
  await firstUse(page, A, A.birth);
  await setPasswordAndEnter(page, A);

  await fillCondition(page, 4);
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByText("저장되었습니다")).toBeVisible();
  let session = await userSession(A.email, A.password);
  expect(await todayRows(session, A.pid)).toEqual([expect.objectContaining({ condition: 4 })]);

  await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ }).click();
  await page.getByRole("button", { name: "기록 수정" }).click();
  await expect(page.getByText("저장되었습니다")).toBeVisible();
  const afterEdit = await todayRows(session, A.pid);
  expect(afterEdit).toHaveLength(1); // 같은 한국 날짜는 1건만 (수정)
  expect(afterEdit[0].condition).toBe(2);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await typeSecret(page.getByLabel("환자 코드"), A.code);
  await typeSecret(page.getByLabel("비밀번호", { exact: true }), A.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);

  session = await userSession(A.email, A.password);
  expect(await todayRows(session, A.pid)).toHaveLength(1);
});

test("3. 설정 후에는 생년월일로 다시 설정할 수 없음 (같은 안내 문구)", async ({ page }) => {
  await firstUse(page, A, A.birth);
  await expect(page.getByRole("alert").filter({ hasText: VERIFY_FAILED })).toBeVisible();
  await expect(page.getByLabel("새 비밀번호")).toHaveCount(0);
  // 기존 비밀번호는 그대로 유효
  const s = await userSession(A.email, A.password);
  await s.auth.signOut();
});

test("4. B: 잘못된 생년월일은 같은 문구로 거부 → 올바르게 설정·저장, A·B 기록은 서로 보이지 않음", async ({ page }) => {
  await firstUse(page, B, B.wrongBirth);
  await expect(page.getByRole("alert").filter({ hasText: VERIFY_FAILED })).toBeVisible();

  await page.getByLabel("생년월일 8자리").waitFor();
  await typeSecret(page.getByLabel("생년월일 8자리"), B.birth);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await setPasswordAndEnter(page, B);
  await fillCondition(page, 3);
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByText("저장되었습니다")).toBeVisible();

  const sa = await userSession(A.email, A.password);
  const sb = await userSession(B.email, B.password);
  expect(await todayRows(sb, B.pid)).toHaveLength(1);
  expect(await todayRows(sa, B.pid)).toEqual([]); // A는 B 기록을 볼 수 없음
  expect(await todayRows(sb, A.pid)).toEqual([]); // B는 A 기록을 볼 수 없음
  const { data: patientsSeenByA } = await sa.from("patients").select("id");
  expect(patientsSeenByA?.map((p) => p.id)).toEqual([A.pid]);
  const { error } = await sa.rpc("upsert_health_record", {
    p_patient_id: B.pid, p_record_date: todayISO(), p_condition: 1, p_pain: 9, p_fatigue: 5, p_sleep: 1, p_meal_intake: 0, p_digestion: "nausea",
  });
  expect(error?.message ?? "").toMatch(/row-level security/); // A가 B 기록 작성 불가
  expect((await todayRows(sb, B.pid))[0].condition).toBe(3);
});

test("5. 로그인 사용자 세션으로 서버 전용 함수 호출 불가", async () => {
  const sa = await userSession(A.email, A.password);
  for (const [fn, args] of [
    ["svc_register_patient_credential", { p_patient_id: B.pid, p_login_code: generateLoginCode(), p_birth_date: "2000-01-01" }],
    ["svc_login_lookup", { p_login_code: B.code }],
    ["svc_verify_first_access", { p_login_code: B.code, p_birth_date: "2000-01-01" }],
    ["create_my_patient_profile", { p_display_name: "x" }],
  ] as const) {
    const { error } = await sa.rpc(fn, args);
    expect(error, fn).not.toBeNull();
  }
});
