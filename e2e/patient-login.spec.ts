/**
 * 3단계 환자 로그인 화면·API 흐름 (실제 Supabase에 접속하지 않음)
 * - 개발 서버는 가짜 Supabase 설정으로 실행 (playwright.config.ts)
 * - 화면 흐름: 로그인 API를 브라우저 단에서 모의 응답으로 대체
 * - 서버 API: 가짜 프로젝트에 닿지 못할 때도 원인·입력값을 드러내지 않는지 확인
 */
import { expect, test, type Page } from "@playwright/test";
import { trackConsoleErrors } from "./helpers";

const MSG = {
  verifyFailed: "입력하신 정보로 처음 이용하기를 진행할 수 없습니다.",
  setupDone: "비밀번호를 설정했습니다. 환자 코드와 새 비밀번호로 로그인해 주세요.",
};

/** 가짜 Supabase Auth 호출은 "로그인 안 됨"으로 응답 (네트워크 오류 방지) */
async function stubSupabaseAuth(page: Page) {
  await page.route("https://e2efakeprojectrefxyz.supabase.co/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "no session" }) }),
  );
}

test("처음 이용하기: 확인 실패 → 확인 성공 → 비밀번호 규칙 안내 → 설정 완료 (API 모의)", async ({ page }) => {
  const console = trackConsoleErrors(page, [400, 401]); // 모의 API·가짜 Auth가 일부러 돌려주는 상태
  await stubSupabaseAuth(page);
  const bodies: { url: string; body: Record<string, string> }[] = [];
  let verifyCalls = 0;
  let setCalls = 0;
  await page.route("**/api/patient-auth/**", async (route) => {
    const req = route.request();
    bodies.push({ url: req.url(), body: req.postDataJSON() });
    if (req.url().endsWith("/verify")) {
      verifyCalls += 1;
      await new Promise((r) => setTimeout(r, 300));
      return verifyCalls === 1
        ? route.fulfill({ status: 401, json: { ok: false, message: `${MSG.verifyFailed} 환자 코드와 생년월일을 확인해 주세요.` } })
        : route.fulfill({ json: { ok: true, expiresInSeconds: 600 } });
    }
    if (req.url().endsWith("/set-password")) {
      setCalls += 1;
      return setCalls === 1
        ? route.fulfill({ status: 400, json: { ok: false, message: "비밀번호에 영문과 숫자를 모두 넣어 주세요." } })
        : route.fulfill({ json: { ok: true, signedIn: false } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "처음 이용하기" }).click();
  await page.getByLabel("환자 코드").fill("abcd-efgh-jkmn");
  await expect(page.getByLabel("환자 코드")).toHaveValue("ABCD-EFGH-JKMN");
  await page.getByLabel("생년월일 8자리").fill("1970-01-0x1"); // 숫자만 남음
  await expect(page.getByLabel("생년월일 8자리")).toHaveValue("19700101");

  // 연타해도 요청은 1번
  await page.getByRole("button", { name: "확인", exact: true }).dblclick();
  await expect(page.getByRole("alert").filter({ hasText: MSG.verifyFailed })).toBeVisible();
  expect(verifyCalls).toBe(1);
  await expect(page.getByLabel("생년월일 8자리")).toHaveValue(""); // 생년월일은 화면에 남기지 않음

  await page.getByLabel("생년월일 8자리").fill("19700101");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText("10분 안에 새 비밀번호를 설정해 주세요")).toBeVisible();
  await expect(page.getByLabel("생년월일 8자리")).toHaveCount(0);

  await page.getByLabel("새 비밀번호").fill("abcdefgh");
  await page.getByLabel("비밀번호 확인").fill("abcdefgh");
  await page.getByRole("button", { name: "비밀번호 설정하고 시작하기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "영문과 숫자" })).toBeVisible();

  await page.getByLabel("새 비밀번호").fill("carelog2026a");
  await page.getByLabel("비밀번호 확인").fill("carelog2026a");
  await page.getByRole("button", { name: "비밀번호 설정하고 시작하기" }).click();
  await expect(page.getByText(MSG.setupDone)).toBeVisible();
  await expect(page.getByRole("tab", { name: "로그인" })).toHaveAttribute("aria-selected", "true");

  // 브라우저 저장소에 건강기록·생년월일·비밀번호를 남기지 않음
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain("19700101");
  expect(stored).not.toContain("carelog2026a");
  expect(stored).not.toContain("carelog.demo-data");
  console.expectNone();
});

test("로그인 실패는 같은 안내 문구, 비밀번호 칸은 유지", async ({ page }) => {
  await stubSupabaseAuth(page);
  await page.route("**/api/patient-auth/login", (route) =>
    route.fulfill({ status: 401, json: { ok: false, message: "환자 코드 또는 비밀번호가 올바르지 않습니다. 계속 안 되면 잠시 후 다시 시도해 주세요." } }),
  );
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("환자 코드").fill("ABCD-EFGH-JKMN");
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-pass-1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "환자 코드 또는 비밀번호가 올바르지 않습니다" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("로그인하지 않고 /my 접근 → /login 으로 이동", async ({ page }) => {
  await stubSupabaseAuth(page);
  await page.goto("/my");
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
});

test("서버 API: DB에 닿지 못해도 원인·입력값 비노출, 다른 출처 요청 차단", async ({ request, baseURL }) => {
  const res = await request.post("/api/patient-auth/verify", {
    data: { loginCode: "ABCD-EFGH-JKMN", birthDate: "19700101" },
    headers: { Origin: baseURL! },
  });
  const body = await res.text();
  expect(res.status()).toBe(503);
  expect(body).toContain(MSG.verifyFailed);
  expect(body).not.toContain("19700101");
  expect(body).not.toContain("ABCD");
  expect(res.headers()["cache-control"]).toContain("no-store");

  const cross = await request.post("/api/patient-auth/login", {
    data: { loginCode: "ABCD-EFGH-JKMN", password: "x" },
    headers: { Origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);

  // 일회용 권한 쿠키 없이 비밀번호 설정 시도 → 만료 안내
  const noToken = await request.post("/api/patient-auth/set-password", {
    data: { password: "carelog2026a", passwordConfirm: "carelog2026a" },
    headers: { Origin: baseURL! },
  });
  expect(noToken.status()).toBe(401);
  expect(await noToken.text()).toContain("처음 이용하기를 다시 진행해 주세요");
});
