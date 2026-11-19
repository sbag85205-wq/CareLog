/**
 * 환자 아이디 로그인·관리자 화면 접근 (실제 Supabase에 접속하지 않음)
 * - 개발 서버는 가짜 Supabase 설정으로 실행 (playwright.config.ts)
 * - 화면 흐름: 로그인 API를 브라우저 단에서 모의 응답으로 대체
 * - 서버 API: 가짜 프로젝트에 닿지 못할 때도 원인·입력값을 드러내지 않는지, 권한 없는 요청을 막는지 확인
 */
import { expect, test, type Page } from "@playwright/test";
import { trackConsoleErrors } from "./helpers";

const FAILED = "아이디 또는 비밀번호가 올바르지 않습니다";

/** 가짜 Supabase Auth 호출은 "로그인 안 됨"으로 응답 (네트워크 오류 방지) */
async function stubSupabaseAuth(page: Page) {
  await page.route("https://e2efakeprojectrefxyz.supabase.co/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "no session" }) }),
  );
}

test("아이디 로그인: 실패는 같은 안내 문구 → 성공하면 /my 로 이동 (API 모의), 입력값을 브라우저에 남기지 않음", async ({ page }) => {
  const console = trackConsoleErrors(page, [401]);
  await stubSupabaseAuth(page);
  const bodies: Record<string, string>[] = [];
  await page.route("**/api/patient-auth/login", async (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 401, json: { ok: false, message: `${FAILED}. 계속 안 되면 병원(관리자)에 문의해 주세요.` } })
      : route.fulfill({ json: { ok: true } });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab")).toHaveCount(0); // 환자 코드·처음 이용하기 탭 없음
  await page.getByLabel("아이디").fill("haneul01");
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-pass-1");
  await page.getByRole("button", { name: "로그인", exact: true }).dblclick(); // 연타해도 요청 1번
  await expect(page.getByRole("alert").filter({ hasText: FAILED })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toEqual({ loginId: "haneul01", password: "wrong-pass-1" });
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("비밀번호", { exact: true }).fill("carelog2026a");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(/\/my$/);

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain("carelog2026a");
  expect(stored).not.toContain("haneul01");
  console.expectNone();
});

test("로그인하지 않고 /my·/admin/patients 접근 → 로그인 화면", async ({ page }) => {
  await stubSupabaseAuth(page);
  await page.goto("/my");
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\/member$/, { timeout: 15_000 });
});

test("서버 API: 원인·입력값 비노출, 다른 출처 차단, 이전 코드 방식 종료, 관리자 API는 로그인 필요", async ({ request, baseURL }) => {
  const res = await request.post("/api/patient-auth/login", { data: { loginId: "haneul01", password: "carelog2026a" }, headers: { Origin: baseURL! } });
  const body = await res.text();
  expect(res.status()).toBe(401); // 가짜 프로젝트에 닿지 못해도 같은 문구
  expect(body).toContain(FAILED);
  expect(body).not.toContain("haneul01");
  expect(body).not.toContain("carelog2026a");
  expect(res.headers()["cache-control"]).toContain("no-store");

  const bad = await request.post("/api/patient-auth/login", { data: { loginId: "Bad Id!", password: "x" }, headers: { Origin: baseURL! } });
  expect(bad.status()).toBe(401);

  const cross = await request.post("/api/patient-auth/login", { data: { loginId: "haneul01", password: "x" }, headers: { Origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);

  for (const old of ["/api/patient-auth/verify", "/api/patient-auth/set-password"]) {
    const r = await request.post(old, { data: {}, headers: { Origin: baseURL! } });
    expect(r.status(), old).toBe(410);
  }

  const list = await request.get("/api/admin/patients", { headers: { Origin: baseURL! } });
  expect(list.status()).toBe(401);
  const register = await request.post("/api/admin/patients", {
    data: { action: "register", displayName: "x", loginId: "abcd1", password: "carelog2026a", passwordConfirm: "carelog2026a" },
    headers: { Origin: baseURL! },
  });
  expect(register.status()).toBe(401);
  const crossAdmin = await request.post("/api/admin/patients", { data: { action: "register" }, headers: { Origin: "https://evil.example" } });
  expect(crossAdmin.status()).toBe(403);
});

test("배포 주소(/) → 로그인 전에는 /login, 기존 데모는 /demo", async ({ page }) => {
  await stubSupabaseAuth(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("아이디")).toBeVisible();
  await page.getByRole("link", { name: "가상 데이터 데모" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("님, 안녕하세요").first()).toBeVisible();
});
