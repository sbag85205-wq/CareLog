/**
 * carelog-dev 실제 연동 검증 — 관리자 발급 아이디 로그인 (브라우저 + Supabase Auth + 실제 RLS)
 *
 * 관리자 등록 → 환자 로그인 → 기록 저장 → 관리자 비밀번호 재설정 → 재로그인 후 같은 기록
 * 이전 방식 환자 전환(같은 환자 ID·Auth ID, 기존 비밀번호) → 기록·약·질문·보호자 공유·간호사 배정 유지
 * 비활성화(로그인한 세션도 즉시 차단) → 복구 / 일반 계정의 관리자 기능 차단 / 간호사·보호자 로그인
 * 가상 테스트 계정만 영구 삭제 (연결 기록 수 표시·이름 확인)
 * 모든 검증 계정은 테스트가 끝나면 삭제. 아이디·비밀번호는 evaluate로 입력해 로그에 남기지 않음
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { todayISO } from "../src/lib/date";
import {
  admin,
  assignStaff,
  cleanup,
  expectNoHorizontalOverflow,
  expectTodayCondition,
  memberLoginForm,
  menu,
  patientLogin,
  provisionAdmin,
  provisionLegacyPatient,
  provisionMember,
  provisionPatient,
  openLegacyMeds,
  recordCondition,
  randLoginId,
  randPassword,
  shot,
  track,
  typeSecret,
  userSession,
  type VMember,
  type VPatient,
  openShareManagement,
} from "./support";

let AD: VMember, S: VMember, G: VMember;
let L: VPatient; // 이전 방식(아이디 없음) 환자
let P2: VPatient; // 일반 환자 (관리자 기능 차단 확인용)
const N: VPatient = { label: "신규", name: "가상 검증 신규 (자동 삭제)", uid: "", pid: "", email: "", loginId: randLoginId("n"), password: randPassword() };
const LEGACY_MED = "(가상) 이전 방식 약";
const LEGACY_Q = "(가상) 이전 방식 질문";
const FAILED = "아이디 또는 비밀번호가 올바르지 않습니다";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  AD = await provisionAdmin("관리자");
  S = await provisionMember("간호사", "staff");
  G = await provisionMember("보호자", "guardian");
  P2 = await provisionPatient("일반환자");
  L = await provisionLegacyPatient("이전방식");
  // 이전 방식 환자의 기존 데이터: 기록·약·진료 질문·보호자 공유·간호사 배정
  const sl = await userSession(L.email, L.password);
  const rec = await sl.rpc("upsert_health_record", {
    p_patient_id: L.pid, p_record_date: todayISO(), p_condition: 4, p_pain: 2, p_fatigue: 2, p_sleep: 4, p_meal_intake: 75, p_digestion: "good", p_memo: "(가상) 이전 방식 메모",
  });
  if (rec.error) throw new Error(`기록 준비 실패: ${rec.error.code}`);
  await sl.from("medications").insert({ patient_id: L.pid, name: LEGACY_MED, dosage: "1정" });
  await sl.from("visit_questions").insert({ patient_id: L.pid, text: LEGACY_Q, shared_with_staff: true });
  const inv = await sl.rpc("invite_guardian", { p_patient_id: L.pid, p_email: G.email, p_scopes: ["records"] });
  if (inv.error) throw new Error(`초대 준비 실패: ${inv.error.code}`);
  const sg = await userSession(G.email, G.password);
  const acc = await sg.rpc("accept_guardian_invitation", { p_token: (inv.data as { token: string }).token });
  if (acc.error) throw new Error(`초대 수락 실패: ${acc.error.code}`);
  await assignStaff(S, L);
});

test.afterAll(async () => {
  await cleanup();
});

async function newPage(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  return ctx.newPage();
}

async function adminPage(browser: Browser, viewport?: { width: number; height: number }) {
  const page = await newPage(browser, viewport);
  await page.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(page, AD);
  await expect(page).toHaveURL(/\/admin\/patients$/);
  await expect(page.getByRole("heading", { name: "환자 계정" })).toBeVisible();
  return page;
}

const card = (page: Page, name: string) => page.getByRole("region", { name: `${name} 계정` });

async function adminResetPassword(page: Page, v: VPatient, password: string) {
  await card(page, v.name).getByRole("button", { name: "비밀번호 재설정" }).click();
  const dlg = page.getByRole("dialog");
  await typeSecret(dlg.getByLabel("새 비밀번호", { exact: true }), password);
  await typeSecret(dlg.getByLabel("새 비밀번호 확인"), password);
  await dlg.getByRole("button", { name: "비밀번호 재설정" }).click();
  await expect(page.getByText(`${v.name} 님의 비밀번호를 재설정했어요.`)).toBeVisible();
}

async function patientLoginFails(page: Page, loginId: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await typeSecret(page.getByLabel("아이디"), loginId);
  await typeSecret(page.getByLabel("비밀번호", { exact: true }), password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: FAILED })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
}

test("1. 관리자: 웹에서 신규 환자 등록 (아이디·초기 비밀번호·테스트 계정)", async ({ browser }) => {
  const page = await adminPage(browser, { width: 1366, height: 900 });
  await page.getByRole("button", { name: "환자 등록" }).click();
  const dlg = page.getByRole("dialog", { name: "환자 등록" });
  await dlg.getByLabel("표시 이름").fill(N.name);
  await typeSecret(dlg.getByLabel("로그인 아이디"), N.loginId);
  await typeSecret(dlg.getByLabel("초기 비밀번호", { exact: true }), N.password);
  await typeSecret(dlg.getByLabel("초기 비밀번호 확인"), N.password);
  await expect(dlg.getByRole("switch", { name: "가상 테스트 계정" })).toHaveAttribute("aria-checked", "true");
  await dlg.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText(`${N.name} 님을 등록했어요.`)).toBeVisible();
  // 이후 단계가 실패해도 정리되도록 바로 등록
  const { data } = await admin.from("patients").select("id, profile_id").eq("display_name", N.name).single();
  N.pid = data!.id;
  N.uid = data!.profile_id;
  N.email = (await admin.auth.admin.getUserById(N.uid)).data.user!.email!;
  track(N.uid, N.pid);
  const c = card(page, N.name);
  await expect(c.getByText(N.loginId)).toBeVisible();
  await expect(c.getByText("활성", { exact: true })).toBeVisible();
  await expect(c.getByText("테스트", { exact: true })).toBeVisible();
  // 같은 아이디는 다시 쓸 수 없음
  await page.getByRole("button", { name: "환자 등록" }).click();
  await page.getByRole("dialog").getByLabel("표시 이름").fill("가상 검증 중복 (자동 삭제)");
  await typeSecret(page.getByRole("dialog").getByLabel("로그인 아이디"), N.loginId);
  await typeSecret(page.getByRole("dialog").getByLabel("초기 비밀번호", { exact: true }), N.password);
  await typeSecret(page.getByRole("dialog").getByLabel("초기 비밀번호 확인"), N.password);
  await page.getByRole("dialog").getByRole("button", { name: "등록" }).click();
  await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: "이미 사용 중인 아이디" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shot(page, "pc-admin-patients");

  await page.context().close();
});

test("2. 신규 환자: 배포 주소 → 아이디 로그인 → 기록 저장 → 관리자 비밀번호 재설정 → 이전 비밀번호 거부 → 새 비밀번호로 같은 기록", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, N);
  await recordCondition(page, 4);
  await expectNoHorizontalOverflow(page);
  const before = (await (await userSession(N.email, N.password)).from("health_records").select("id, condition").eq("patient_id", N.pid)).data;
  expect(before).toEqual([expect.objectContaining({ condition: 4 })]);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const ap = await adminPage(browser);
  const newPassword = randPassword();
  await adminResetPassword(ap, N, newPassword);
  await ap.context().close();

  await patientLoginFails(page, N.loginId, N.password);
  N.password = newPassword;
  await patientLogin(page, N);
  await expectTodayCondition(page, 4);
  const after = (await (await userSession(N.email, N.password)).from("health_records").select("id, condition").eq("patient_id", N.pid)).data;
  expect(after).toEqual(before); // 같은 기록 (ID 동일)
  await page.context().close();
});

test("3. 이전 방식 환자 전환: 아이디 지정 → 새 아이디 + 기존 비밀번호 → 환자 ID·Auth ID·기록·약·질문·공유·배정 유지", async ({ browser }) => {
  const ap = await adminPage(browser);
  const c = card(ap, L.name);
  await expect(c.getByText("아이디 없음 · 이전 방식")).toBeVisible();
  await expect(c.getByRole("button", { name: "영구 삭제" })).toHaveCount(0); // 테스트 계정으로 등록하지 않은 환자는 삭제 불가
  await c.getByRole("button", { name: "아이디 지정" }).click();
  L.loginId = randLoginId("l");
  await typeSecret(ap.getByRole("dialog").getByLabel("로그인 아이디"), L.loginId);
  await ap.getByRole("dialog").getByRole("button", { name: "아이디 저장" }).click();
  await expect(ap.getByText(`${L.name} 님의 아이디를`)).toBeVisible();
  await expect(card(ap, L.name).getByText(L.loginId)).toBeVisible();
  await ap.context().close();

  const { data: p } = await admin.from("patients").select("id, profile_id").eq("id", L.pid).single();
  expect(p).toEqual({ id: L.pid, profile_id: L.uid }); // 환자 ID·Auth 사용자 ID 그대로

  const page = await newPage(browser);
  await patientLogin(page, L); // 새 아이디 + 기존 비밀번호
  await expectTodayCondition(page, 4);
  await openLegacyMeds(page); // 예전 방식 약은 '예전 방식으로 적어 둔 약'에 그대로
  await expect(page.getByRole("region", { name: LEGACY_MED })).toBeVisible();
  await menu(page, "진료 준비").click();
  await expect(page.getByRole("list", { name: "진료 질문 목록" }).getByText(LEGACY_Q)).toBeVisible();
  await menu(page, "함께 보기").click();
  await openShareManagement(page); // 초대·공유 범위는 접힌 영역 안
  await expect(page.getByText(G.email).first()).toBeVisible();
  await page.context().close();

  // 보호자·간호사는 기존 계정(/login/member)으로 그대로 확인
  const gp = await newPage(browser);
  await gp.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(gp, G);
  await expect(gp).toHaveURL(/\/guardian$/);
  await expect(gp.getByRole("heading", { name: `${L.name} 님의 안부` })).toBeVisible();
  await gp.context().close();
  const sp = await newPage(browser, { width: 1366, height: 900 });
  await sp.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(sp, S);
  await expect(sp).toHaveURL(/\/staff$/);
  await sp.getByRole("button", { name: `${L.name} 상세 보기` }).click();
  await expect(sp.getByText(LEGACY_Q)).toBeVisible();
  await sp.context().close();
});

test("4. 비활성화: 이미 로그인한 기기·세션도 즉시 차단, 새 로그인 거부 → 복구하면 같은 기록", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, N);
  const live = await userSession(N.email, N.password); // 비활성화 전에 로그인해 둔 세션
  expect((await live.from("health_records").select("id").eq("patient_id", N.pid)).data).toHaveLength(1);

  const ap = await adminPage(browser);
  await card(ap, N.name).getByRole("button", { name: "비활성화" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "비활성화" }).click();
  await expect(card(ap, N.name).getByText("비활성", { exact: true })).toBeVisible();

  expect((await live.from("health_records").select("id").eq("patient_id", N.pid)).data).toEqual([]);
  expect((await live.from("patients").select("id")).data).toEqual([]);
  const write = await live.rpc("upsert_health_record", {
    p_patient_id: N.pid, p_record_date: todayISO(), p_condition: 1, p_pain: 9, p_fatigue: 5, p_sleep: 1, p_meal_intake: 0, p_digestion: "nausea",
  });
  expect(write.error?.message ?? "").toMatch(/row-level security/);
  // 로그인해 둔 기기: 새로고침하면 Auth가 세션을 거부해 로그인 화면으로, 또는(토큰이 남아 있으면) 비활성화 안내 — 어느 쪽이든 데이터 없음
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("비활성화된 계정입니다").or(page.getByLabel("아이디"))).toBeVisible();
  await expect(page.getByRole("group", { name: "오늘 컨디션" })).toHaveCount(0);
  await patientLoginFails(page, N.loginId, N.password);

  await card(ap, N.name).getByRole("button", { name: "복구" }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "복구" }).click();
  await expect(card(ap, N.name).getByText("활성", { exact: true })).toBeVisible();
  await ap.context().close();
  await page.context().close();

  // 복구 후: 같은 아이디·비밀번호로 다시 로그인, 기록 그대로
  const fresh = await newPage(browser);
  await patientLogin(fresh, N);
  await expectTodayCondition(fresh, 4);
  expect((await live.from("health_records").select("id").eq("patient_id", N.pid)).data).toHaveLength(1);
  await fresh.context().close();
});

test("5. 일반 계정(환자·간호사·보호자)은 관리자 화면·API 사용 불가, 관리자도 환자 데이터 직접 조회 불가", async ({ browser }) => {
  const pp = await newPage(browser);
  await patientLogin(pp, P2);
  await pp.goto("/admin/patients", { waitUntil: "networkidle" });
  await expect(pp.getByText("관리자만 사용할 수 있습니다.")).toBeVisible();
  for (const body of [
    { action: "register", displayName: "x", loginId: randLoginId(), password: "carelog2026a", passwordConfirm: "carelog2026a" },
    { action: "reset-password", patientId: L.pid, password: "carelog2026a", passwordConfirm: "carelog2026a" },
    { action: "disable", patientId: L.pid },
  ]) {
    const r = await pp.request.post("/api/admin/patients", { data: body, headers: { Origin: new URL(pp.url()).origin } });
    expect(r.status(), body.action).toBe(403);
  }
  expect((await pp.request.get("/api/admin/patients")).status()).toBe(403);
  await pp.context().close();

  for (const m of [S, G]) {
    const p = await newPage(browser);
    await p.goto("/login/member", { waitUntil: "networkidle" });
    await memberLoginForm(p, m);
    await expect(p).toHaveURL(m === S ? /\/staff$/ : /\/guardian$/);
    expect((await p.request.get("/api/admin/patients")).status()).toBe(403);
    await p.context().close();
  }
  // 환자 화면 주소로 들어온 관리자는 관리자 화면으로, RLS로는 환자 데이터 0건
  const ap = await adminPage(browser);
  await ap.goto("/my", { waitUntil: "networkidle" });
  await expect(ap).toHaveURL(/\/admin\/patients$/);
  await ap.context().close();
  const sa = await userSession(AD.email, AD.password);
  for (const t of ["patients", "health_records", "medications"]) expect((await sa.from(t).select("id")).data, t).toEqual([]);
  // 일반 환자는 /login/member, 관리자는 /login 으로 로그인할 수 없음
  const sp2 = await newPage(browser);
  await sp2.goto("/login/member", { waitUntil: "networkidle" });
  await typeSecret(sp2.getByLabel("이메일"), P2.email);
  await typeSecret(sp2.getByLabel("비밀번호", { exact: true }), P2.password);
  await sp2.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(sp2.getByRole("alert")).toBeVisible();
  await sp2.context().close();
});

test("6. 영구 삭제: 가상 테스트 계정만, 연결 기록 수 표시 → 이름 확인 후 삭제 (이전 방식 환자는 API도 거부)", async ({ browser }) => {
  const ap = await adminPage(browser);
  await card(ap, N.name).getByRole("button", { name: "영구 삭제" }).click();
  const dlg = ap.getByRole("dialog");
  const list = dlg.getByRole("list", { name: "삭제될 연결 기록" });
  await expect(list.getByRole("listitem").filter({ hasText: "컨디션 기록" })).toContainText("1건");
  await expect(dlg.getByRole("button", { name: "영구 삭제" })).toBeDisabled();
  await dlg.getByLabel(`확인: 표시 이름 "${N.name}" 입력`).fill(N.name);
  await dlg.getByRole("button", { name: "영구 삭제" }).click();
  await expect(ap.getByText(`${N.name} 테스트 계정을 영구 삭제했어요.`)).toBeVisible();
  await expect(card(ap, N.name)).toHaveCount(0);
  expect((await admin.from("patients").select("id").eq("id", N.pid)).data).toEqual([]);
  expect((await admin.from("health_records").select("id").eq("patient_id", N.pid)).data).toEqual([]);
  expect((await admin.auth.admin.getUserById(N.uid)).data.user).toBeNull();

  const origin = new URL(ap.url()).origin;
  const pv = await ap.request.post("/api/admin/patients", { data: { action: "delete-preview", patientId: L.pid }, headers: { Origin: origin } });
  expect(pv.status()).toBe(403);
  const del = await ap.request.post("/api/admin/patients", { data: { action: "delete", patientId: L.pid, confirm: L.name }, headers: { Origin: origin } });
  expect(del.status()).toBe(403);
  expect((await admin.from("patients").select("id").eq("id", L.pid)).data).toHaveLength(1);
  await ap.context().close();
});
