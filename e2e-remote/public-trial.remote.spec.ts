/**
 * 공개 체험 배포 전 실제 DB(carelog-dev) 보안 검증 — 임시 가상 계정만 만들고 끝나면 삭제
 *
 * 1. 환자별 데이터 격리 (약 기록·경험·복용 체크·질문·건강기록)
 * 2. 선택 공유: 허가하지 않은 처방·항목·건강기록이 공유받은 사람에게 보이지 않음, 철회·연결 해제 즉시 차단
 * 3. 관리자 권한: 관리자도 RLS로 환자 기록을 직접 못 봄, 환자는 관리자 API를 못 씀
 * 4. 체험 계정 로그인: 오타로 계정이 잠기지 않음, 한도는 IP 단위, 관리자 재설정으로 복구
 * 5. 초기화 스크립트: 체험 계정 기록만 지우고 다른 계정은 그대로, 확인 실패 시 아무것도 안 지움
 * 6. 화면: 안내 띠(체험 사이트 설정 시) · 로그인 → 기록·경험 · 함께 보기 · 진료 준비
 */
import { expect, test } from "@playwright/test";
import { applyReset, countPlan, seedSample, verifyTargets } from "../scripts/trial/reset-core.mjs";
import { admin, cleanup, memberLoginForm, patientLogin, provisionAdmin, provisionMember, provisionPatient, userSession, type VPatient } from "./support";

test.describe.configure({ mode: "serial" });

const ITEMS = JSON.stringify([{ name: "(가상) 검증진통정", ingredients: "아세트아미노펜", strength: "500mg", categories: ["pain"], category_source: "mfds" }]);
const RX_ITEMS = JSON.stringify([{ name: "(가상) 검증코감기정", categories: ["cold"] }]);

/** 임시 체험 계정: 이름 '(체험)' + 테스트 계정 표시 */
async function trialPatient(label: string): Promise<VPatient> {
  const v = await provisionPatient(label);
  const name = `(체험) 검증 ${label} (자동 삭제)`;
  await admin.from("patients").update({ display_name: name }).eq("id", v.pid);
  return { ...v, name };
}

let A: VPatient, B: VPatient;
let aOtc = "",
  aRx = "";

test.afterAll(async () => {
  await cleanup();
});

test("1. 환자별 격리: 다른 환자의 약 기록·경험·복용 체크·질문·건강기록을 읽거나 쓸 수 없음", async () => {
  A = await trialPatient("A");
  B = await trialPatient("B");
  const a = await userSession(A.email, A.password);
  const b = await userSession(B.email, B.password);

  aOtc = (
    await a.rpc("create_med_record", {
      p_patient_id: A.pid,
      p_request_id: crypto.randomUUID(),
      p_kind: "otc",
      p_source: "search",
      p_date: "2026-11-20",
      p_department: "",
      p_clinic: "",
      p_guidance: "",
      p_items: JSON.parse(ITEMS),
    })
  ).data as string;
  aRx = (
    await a.rpc("create_med_record", {
      p_patient_id: A.pid,
      p_request_id: crypto.randomUUID(),
      p_kind: "prescription",
      p_source: "prescription",
      p_date: "2026-11-10",
      p_department: "이비인후과",
      p_clinic: "",
      p_guidance: "",
      p_items: JSON.parse(RX_ITEMS),
    })
  ).data as string;
  expect(aOtc).toMatch(/^[0-9a-f-]{36}$/);
  const item = (await a.from("prescription_items").select("id").eq("prescription_id", aOtc).single()).data!.id;
  expect(
    (await a.from("prescription_notes").insert({ prescription_id: aOtc, patient_id: A.pid, item_id: item, tags: ["속쓰림"], memo: "(가상) 검증 메모" })).error,
  ).toBeNull();
  expect((await a.from("intake_logs").insert({ patient_id: A.pid, item_id: item, taken_on: "2026-11-20", slot: "prn" })).error).toBeNull();
  expect((await a.from("visit_questions").insert({ patient_id: A.pid, text: "(가상) 검증 질문", prescription_id: aRx })).error).toBeNull();
  expect(
    (
      await a.rpc("upsert_health_record", {
        p_patient_id: A.pid,
        p_record_date: "2026-11-20",
        p_condition: 3,
        p_pain: 2,
        p_fatigue: 3,
        p_sleep: 3,
        p_meal_intake: 50,
        p_digestion: "normal",
        p_symptoms: [],
        p_memo: "(가상)",
      })
    ).error,
  ).toBeNull();

  for (const t of ["prescriptions", "prescription_items", "prescription_notes", "intake_logs", "visit_questions", "health_records", "record_shares"]) {
    const { data, error } = await b.from(t).select("*").eq("patient_id", A.pid);
    expect(error, t).toBeNull();
    expect(data, `${t}: B가 A의 기록을 봄`).toEqual([]);
  }
  expect((await b.from("patients").select("id").eq("id", A.pid)).data).toEqual([]);
  // 쓰기: B가 A의 환자 ID로 기록 만들기·바꾸기·지우기 불가
  expect(
    (
      await b.rpc("create_med_record", {
        p_patient_id: A.pid,
        p_request_id: crypto.randomUUID(),
        p_kind: "otc",
        p_source: "search",
        p_date: "2026-11-20",
        p_department: "",
        p_clinic: "",
        p_guidance: "",
        p_items: JSON.parse(ITEMS),
      })
    ).error?.message,
  ).toMatch(/row-level security/);
  expect((await b.from("prescription_notes").insert({ prescription_id: aOtc, patient_id: A.pid, tags: ["졸림"] })).error?.message).toMatch(
    /row-level security/,
  );
  expect((await b.from("intake_logs").insert({ patient_id: B.pid, item_id: item, taken_on: "2026-11-20", slot: "prn" })).error?.message).toMatch(
    /invalid_input|row-level/,
  );
  expect((await b.from("prescriptions").update({ starred: true }).eq("id", aOtc).select("id")).data).toEqual([]);
  expect((await b.from("prescription_notes").delete().eq("patient_id", A.pid).select("id")).data).toEqual([]);
  expect((await b.rpc("share_record", { p_prescription_id: aOtc, p_grantee_id: B.uid, p_fields: ["experience"], p_expires_at: null })).error?.message).toMatch(
    /not_found/,
  );
  // 로그인하지 않은 요청: 표·함수 모두 거부
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  expect((await anon.from("prescriptions").select("id")).error).not.toBeNull();
  expect((await anon.rpc("shared_records_for_me")).error).not.toBeNull();
});

test("2. 선택 공유: 고른 기록·항목만, 처방·건강기록은 허가 없이는 안 보임, 철회·연결 해제 즉시 차단", async () => {
  const a = await userSession(A.email, A.password);
  const G = await provisionMember("체험 공유 상대", "guardian");
  const inv = await a.rpc("invite_guardian", { p_patient_id: A.pid, p_email: G.email, p_scopes: ["medications"] });
  expect(inv.error).toBeNull();
  const g = await userSession(G.email, G.password);
  expect((await g.rpc("accept_guardian_invitation", { p_token: (inv.data as { token: string }).token })).error).toBeNull();

  // 공유 전: 아무 기록도 없음 (기본 비공개), 기록 표 직접 조회 0건
  expect((await g.rpc("shared_records_for_me")).data).toEqual([]);
  for (const t of ["prescriptions", "prescription_items", "prescription_notes", "intake_logs", "record_shares"])
    expect((await g.from(t).select("*")).data, t).toEqual([]);
  // 건강기록 공유 범위를 주지 않았으므로 건강기록 0건
  expect((await g.from("health_records").select("*").eq("patient_id", A.pid)).data).toEqual([]);

  // 일반약 1건만, 경험만 공유
  expect((await a.rpc("share_record", { p_prescription_id: aOtc, p_grantee_id: G.uid, p_fields: ["experience"], p_expires_at: null })).error).toBeNull();
  const shared = (await g.rpc("shared_records_for_me")).data as { kind: string; items: Record<string, unknown>[]; notes?: unknown[]; department?: string }[];
  expect(shared).toHaveLength(1);
  expect(shared[0].kind).toBe("otc");
  expect(Object.keys(shared[0].items[0]).sort()).toEqual(["categories", "name"]); // 성분·함량 없음
  expect(shared[0].notes).toHaveLength(1);
  expect(JSON.stringify(shared)).not.toContain("이비인후과"); // 공유하지 않은 처방은 없음
  expect((await g.from("prescriptions").select("*")).data).toEqual([]); // 여전히 표 직접 조회 불가
  expect((await g.from("prescription_notes").update({ memo: "바꿈" }).eq("patient_id", A.pid).select("id")).data).toEqual([]); // 수정 불가

  // 처방은 진료과를 켜야만 진료과가 보임
  expect((await a.rpc("share_record", { p_prescription_id: aRx, p_grantee_id: G.uid, p_fields: ["howto"], p_expires_at: null })).error).toBeNull();
  const two = (await g.rpc("shared_records_for_me")).data as { kind: string; department?: string }[];
  expect(two.find((r) => r.kind === "prescription")).not.toHaveProperty("department");

  // 공유 멈추기 → 그 기록만 사라짐
  const shares = (await a.from("record_shares").select("id, prescription_id").is("revoked_at", null)).data!;
  await a.rpc("revoke_record_share", { p_share_id: shares.find((s) => s.prescription_id === aOtc)!.id });
  expect(((await g.rpc("shared_records_for_me")).data as unknown[]).length).toBe(1);
  // 연결 해제 → 모두 사라짐
  const grant = (await a.from("access_grants").select("id").eq("grantee_id", G.uid).single()).data!.id;
  await a.rpc("revoke_guardian_access", { p_grant_id: grant });
  expect((await g.rpc("shared_records_for_me")).data).toEqual([]);
  // 연결이 없는 사람에게는 새로 공유할 수 없음
  expect((await a.rpc("share_record", { p_prescription_id: aOtc, p_grantee_id: G.uid, p_fields: ["experience"], p_expires_at: null })).error?.message).toMatch(
    /forbidden/,
  );
});

test("3. 관리자 권한: 관리자도 환자 기록을 직접 못 봄, 환자는 관리자 API를 못 씀, 관리자 지정은 서버 키만", async ({ page, baseURL }) => {
  const adm = await provisionAdmin("체험 검증 관리자");
  const as = await userSession(adm.email, adm.password);
  for (const t of ["prescriptions", "prescription_notes", "health_records", "visit_questions"])
    expect((await as.from(t).select("*").eq("patient_id", A.pid)).data, t).toEqual([]);
  // 환자 세션으로 관리자 지정 시도 → 거부
  const a = await userSession(A.email, A.password);
  expect((await a.from("admin_users").insert({ user_id: A.uid })).error).not.toBeNull();
  // 환자로 로그인한 브라우저에서 관리자 API → 거부
  await patientLogin(page, A);
  const r = await page.request.get("/api/admin/patients", { headers: { Origin: baseURL! } });
  expect([401, 403]).toContain(r.status());
});

test("4. 체험 계정 로그인: 오타로 잠기지 않음, 한도는 IP별(다른 IP는 영향 없음), 관리자 재설정으로 복구", async ({ page, baseURL }) => {
  const H = (ip: string) => ({ Origin: baseURL!, "x-forwarded-for": ip });
  const login = (password: string, ip: string) => page.request.post("/api/patient-auth/login", { data: { loginId: A.loginId, password }, headers: H(ip) });
  // 다른 방문자가 6번 틀려도 (같은 IP) 맞는 비밀번호로는 바로 로그인됨 — 계정 잠금 없음
  for (let i = 0; i < 6; i++) expect((await login("wrong-password-1234", "198.51.100.10")).status()).toBe(401);
  expect((await login(A.password, "198.51.100.10")).status()).toBe(200);
  // 같은 IP에서 10분 20회 한도를 넘기면 그 IP만 잠시 거부, 다른 IP는 정상
  let limited = 0;
  for (let i = 0; i < 16; i++) if ((await login("wrong-password-1234", "198.51.100.10")).status() === 429) limited++;
  expect(limited).toBeGreaterThan(0);
  expect((await login(A.password, "198.51.100.10")).status()).toBe(429);
  expect((await login(A.password, "198.51.100.11")).status()).toBe(200);

  // 복구: 관리자 화면의 비밀번호 재설정 (관리자 세션 · 같은 출처)
  const adm = await provisionAdmin("체험 복구 관리자");
  const ctx = await page.context().browser()!.newContext({ baseURL });
  const ap = await ctx.newPage();
  await ap.goto("/login/member");
  await memberLoginForm(ap, adm);
  await ap.waitForURL(/\/admin/);
  const newPw = `Cl${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}7`;
  const rr = await ap.request.post("/api/admin/patients", {
    data: { action: "reset-password", patientId: A.pid, password: newPw, passwordConfirm: newPw },
    headers: { Origin: baseURL! },
  });
  expect(rr.status()).toBe(200);
  expect((await login(A.password, "198.51.100.12")).status()).toBe(401); // 예전 비밀번호는 더 이상 안 됨
  expect((await login(newPw, "198.51.100.12")).status()).toBe(200);
  A = { ...A, password: newPw };
  await ctx.close();
});

test("5. 초기화 스크립트(실제 DB): 체험 계정 기록만 삭제, 이름만 '(체험)'인 일반 계정은 거부, 예시 기록 다시 넣기", async () => {
  // 일반(테스트 표시 없음) 계정에 '(체험)' 이름을 붙여도 거부되어야 함
  const N = await trialPatient("N-표시없음");
  await admin.auth.admin.updateUserById(N.uid, { app_metadata: { carelog_test: false } });
  const n = await userSession(N.email, N.password);
  await n.rpc("create_med_record", {
    p_patient_id: N.pid,
    p_request_id: crypto.randomUUID(),
    p_kind: "otc",
    p_source: "search",
    p_date: "2026-11-20",
    p_department: "",
    p_clinic: "",
    p_guidance: "",
    p_items: JSON.parse(ITEMS),
  });

  const bad = await verifyTargets(admin, [{ patientId: N.pid, authUserId: N.uid }]);
  expect(bad.ok).toBe(false);
  const mixed = await verifyTargets(admin, [
    { patientId: A.pid, authUserId: A.uid },
    { patientId: N.pid, authUserId: N.uid },
  ]);
  expect(mixed.ok).toBe(false); // 하나라도 실패 → 전체 거부

  const good = await verifyTargets(admin, [{ patientId: A.pid, authUserId: A.uid }]);
  expect(good.ok).toBe(true);
  const plan = await countPlan(admin, good.verified);
  expect(plan[A.pid].prescriptions).toBe(2);
  expect(plan[A.pid].health_records).toBe(1);
  const bBefore = (await admin.from("prescriptions").select("id", { count: "exact", head: true }).eq("patient_id", N.pid)).count;
  await applyReset(admin, good.verified);
  expect((await admin.from("prescriptions").select("id", { count: "exact", head: true }).eq("patient_id", A.pid)).count).toBe(0);
  expect((await admin.from("health_records").select("id", { count: "exact", head: true }).eq("patient_id", A.pid)).count).toBe(0);
  expect((await admin.from("prescriptions").select("id", { count: "exact", head: true }).eq("patient_id", N.pid)).count).toBe(bBefore); // 다른 계정 그대로
  expect((await admin.from("patients").select("id").eq("id", A.pid)).data).toHaveLength(1); // 계정·환자 행 유지

  await seedSample(admin, good.verified[0], "2026-11-23");
  const a = await userSession(A.email, A.password);
  expect(((await a.from("prescriptions").select("id")).data ?? []).length).toBe(2); // 본인 세션으로 예시 기록이 보임
  expect(((await a.from("prescription_notes").select("id")).data ?? []).length).toBe(3);
});

test("6. 화면(실제 DB): 로그인 → 기록·경험 → 함께 보기 → 진료 준비, 체험 안내 띠", async ({ page }) => {
  await patientLogin(page, A);
  if (process.env.NEXT_PUBLIC_CARELOG_TRIAL_NOTICE === "1") await expect(page.getByRole("note", { name: "체험용 사이트 안내" })).toBeVisible();
  await expect(page.getByText("나한테 어땠더라?")).toBeVisible();
  await expect(page.getByRole("region", { name: "오늘 한눈에" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "메뉴" });

  await nav.getByRole("button", { name: "나의 약 기록", exact: true }).click();
  await expect(page.getByRole("region", { name: "찾은 약" }).getByRole("button", { name: /^\(체험\) 가상진통정500밀리그램 · / })).toBeVisible();
  await page
    .getByRole("region", { name: "찾은 약" })
    .getByRole("button", { name: /^\(체험\) 가상진통정500밀리그램 · / })
    .click();
  const editor = page.getByLabel("복용 경험 남기기");
  await editor.getByLabel("느낀 점 (자유롭게)").fill("(가상) 먹고 나서 졸렸어. 약 때문인지는 모르겠어.");
  await editor.getByLabel("자동 정리 제안").getByRole("button", { name: "제안 태그 담기" }).click();
  await editor.getByRole("button", { name: "복용 경험 저장" }).click();
  await expect(page.getByRole("list", { name: "복용 경험 타임라인" }).getByText("(가상) 먹고 나서 졸렸어. 약 때문인지는 모르겠어.")).toBeVisible();

  await nav.getByRole("button", { name: "내 몸의 반응", exact: true }).click();
  await expect(page.getByRole("region", { name: "약별 요약", exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "함께 보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "함께 보기" })).toBeVisible();

  await nav.getByRole("button", { name: "진료 준비", exact: true }).click();
  await expect(page.getByRole("region", { name: "진료 핵심 정보" })).toBeVisible();
  // 새로고침 후에도 저장된 경험이 남아 있음 (실제 DB)
  const a = await userSession(A.email, A.password);
  expect(((await a.from("prescription_notes").select("memo")).data ?? []).some((x) => x.memo.includes("졸렸어"))).toBe(true);
});
