/**
 * 로그인 없는 공개 체험 — 실제 DB (migration 12 적용 + Supabase 'Allow anonymous sign-ins' 켜진 프로젝트에서만)
 * 방문자는 모두 이 테스트가 만든 익명 세션 — 끝나면 체험 기록을 지우고 익명 Auth 계정을 삭제
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";
import { admin, cleanup, provisionPatient, PUB, URL, userSession } from "./support";

test.describe.configure({ mode: "serial" });

/** 서버 정리와 같은 순서 (src/server/trial/cleanup.ts — server-only 라 여기서 직접): 정리 함수 → 익명 계정만 삭제 */
async function cleanupExpiredTrials(a: SupabaseClient, limit: number) {
  await a.rpc("svc_purge_expired_trials", { p_limit: limit });
  const { data: ids } = await a.rpc("svc_trial_users_to_delete", { p_limit: limit });
  let deleted = 0;
  for (const id of (ids ?? []) as string[]) {
    const { data } = await a.auth.admin.getUserById(id);
    if (data?.user?.is_anonymous !== true) continue;
    if (!(await a.auth.admin.deleteUser(id)).error) deleted++;
  }
  return { deleted };
}

const visitors: SupabaseClient[] = [];
const anonIds = new Set<string>();

async function anonVisitor(): Promise<SupabaseClient> {
  const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(`익명 로그인 실패: ${error.code ?? error.status ?? ""} — 대시보드에서 Anonymous sign-ins 를 켰는지 확인`);
  anonIds.add(data.user!.id);
  visitors.push(c);
  return c;
}

async function browserVisitor(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/start$/);
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "체험 시작하기" }).click();
  await expect(page).toHaveURL(/\/my$/, { timeout: 30_000 });
  await expect(page.getByText("나한테 어땠더라?")).toBeVisible();
  const uid = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes("auth-token"));
    return k ? (JSON.parse(localStorage.getItem(k) ?? "{}").user?.id ?? null) : null;
  });
  if (uid) anonIds.add(uid);
  return { ctx, page };
}

test.afterAll(async () => {
  for (const c of visitors)
    await c.rpc("end_trial").then(
      () => undefined,
      () => undefined,
    );
  await cleanupExpiredTrials(admin, 500); // 정리 끝난 익명 체험 계정 삭제
  for (const id of anonIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.is_anonymous) await admin.auth.admin.deleteUser(id); // 이 테스트가 만든 익명 계정만
  }
  await cleanup();
});

test("1. 화면: 방문자 두 명이 각자 '체험 시작하기' → 예시 기록, 서로의 기록은 안 보임", async ({ browser }) => {
  const a = await browserVisitor(browser);
  const b = await browserVisitor(browser);
  for (const v of [a, b]) {
    await expect(v.page.getByRole("region", { name: "체험 안내" })).toContainText("자동으로 지워져요");
    await v.page.getByRole("navigation", { name: "메뉴" }).getByRole("button", { name: "나의 약 기록", exact: true }).click();
    await expect(v.page.getByRole("region", { name: "찾은 약" }).getByRole("button", { name: /^\(체험\) 가상진통정500밀리그램 · / })).toBeVisible();
  }
  // A만 직접 입력 약 등록
  await a.page.getByRole("button", { name: "약 등록하기" }).first().click();
  await a.page
    .getByRole("dialog", { name: "약 등록하기" })
    .getByRole("button", { name: /^약 이름 직접 검색/ })
    .click();
  const dlg = a.page.getByRole("dialog");
  await dlg.getByLabel("제품명 검색어").fill("체험방문자A약");
  await dlg.getByRole("button", { name: "식약처 제품 정보에서 찾기" }).click();
  await dlg.getByRole("button", { name: "이름만 직접 입력해 등록" }).click();
  await dlg.getByRole("button", { name: "확인한 제품 1개 등록" }).click();
  await expect(a.page.getByLabel("제품: 체험방문자A약")).toBeVisible();
  await b.page.reload({ waitUntil: "networkidle" });
  await b.page.getByRole("navigation", { name: "메뉴" }).getByRole("button", { name: "나의 약 기록", exact: true }).click();
  await b.page.getByLabel("제품명·성분으로 찾기").fill("체험방문자A약");
  await expect(b.page.getByRole("region", { name: "찾은 약" }).getByRole("heading", { name: "찾은 약 · 0개" })).toBeVisible();

  // 같은 브라우저로 다시 오면 같은 체험 (재사용)
  await a.page.goto("/start", { waitUntil: "networkidle" });
  await a.page.getByRole("button", { name: "건너뛰기" }).click();
  await a.page.getByRole("button", { name: "이어서 체험하기" }).click();
  await expect(a.page).toHaveURL(/\/my$/);
  await a.page.getByRole("navigation", { name: "메뉴" }).getByRole("button", { name: "나의 약 기록", exact: true }).click();
  await a.page.getByLabel("제품명·성분으로 찾기").fill("체험방문자A약");
  await expect(a.page.getByRole("region", { name: "찾은 약" }).getByRole("heading", { name: "찾은 약 · 1개" })).toBeVisible();

  // 체험 끝내기 → 기록 삭제 → /start
  await a.page.getByRole("button", { name: "체험 끝내기" }).first().click();
  await a.page.getByRole("button", { name: "기록 지우고 끝내기" }).click();
  await expect(a.page).toHaveURL(/\/start$/);
  await a.ctx.close();
  await b.ctx.close();
});

test("2. 동시에 5명: 각자 독립된 환자·기록, 서로의 환자 ID로 읽기·쓰기 불가", async () => {
  const cs = await Promise.all(Array.from({ length: 5 }, () => anonVisitor()));
  const ts = await Promise.all(cs.map((c) => c.rpc("start_trial")));
  for (const t of ts) expect(t.error).toBeNull();
  const pids = ts.map((t) => (t.data as { patient_id: string }).patient_id);
  expect(new Set(pids).size).toBe(5);
  for (const [i, c] of cs.entries()) {
    const own = await c.from("prescriptions").select("patient_id");
    expect(own.data!.every((r) => r.patient_id === pids[i])).toBe(true);
    expect(own.data!.length).toBe(3);
    const other = pids[(i + 1) % 5];
    for (const t of ["patients", "prescriptions", "health_records", "visit_questions", "prescription_notes"]) {
      const col = t === "patients" ? "id" : "patient_id";
      expect((await c.from(t).select("*").eq(col, other)).data, t).toEqual([]);
    }
    expect((await c.from("visit_questions").insert({ patient_id: other, text: "x" })).error?.message).toMatch(/row-level security/);
  }
});

test("3. 재사용·만료·정리: 같은 세션은 같은 체험, 끝낸 체험은 다시 쓸 수 없고 정리하면 익명 계정만 삭제", async () => {
  const c = await anonVisitor();
  const first = (await c.rpc("start_trial")).data as { patient_id: string; resumed: boolean };
  const again = (await c.rpc("start_trial")).data as { patient_id: string; resumed: boolean };
  expect(again).toMatchObject({ patient_id: first.patient_id, resumed: true });
  expect((await c.rpc("trial_status")).data).toMatchObject({ is_trial: true, expired: false });
  expect((await c.rpc("end_trial")).error).toBeNull();
  expect((await c.from("prescriptions").select("id")).data).toEqual([]);
  expect((await c.rpc("start_trial")).error?.message).toMatch(/expired/);
  const id = [...anonIds].at(-1)!;
  const r = await cleanupExpiredTrials(admin, 500);
  expect(r.deleted).toBeGreaterThanOrEqual(1);
  expect((await admin.auth.admin.getUserById(id)).data?.user ?? null).toBeNull();
  expect((await admin.from("patients").select("id").eq("id", first.patient_id)).data).toEqual([]);
});

test("4. 기존 계정은 그대로: 일반 환자는 체험을 만들 수 없고 기록도 섞이지 않음, 로그인 안 하면 실행 불가", async () => {
  const P = await provisionPatient("체험과 무관한 환자");
  const p = await userSession(P.email, P.password);
  expect((await p.rpc("start_trial")).error?.message).toMatch(/forbidden/);
  expect((await p.rpc("trial_status")).data).toEqual({ is_trial: false });
  const anon = createClient(URL, PUB, { auth: { persistSession: false } });
  expect((await anon.rpc("start_trial")).error).not.toBeNull();
  expect((await anon.rpc("svc_purge_expired_trials", { p_limit: 1 })).error).not.toBeNull();
  const v = await anonVisitor();
  await v.rpc("start_trial");
  expect((await v.from("patients").select("id").eq("id", P.pid)).data).toEqual([]);
});
