/**
 * 공개 체험 첫 화면 (/start) — 구름이 소개 4단계, 건너뛰기·다음·체험 시작하기, 모바일 우선
 * Supabase 는 가짜 주소 — 익명 로그인 요청을 가로채 '아직 꺼져 있음'·'요청 많음' 안내를 확인 (실제 체험 생성은 원격 검증)
 */
import { expect, test, type Page } from "@playwright/test";
import { E2E_FAKE_SUPABASE_URL } from "../playwright.config";
import { expectNoHorizontalOverflow, hideDevOverlay, trackConsoleErrors } from "../e2e/helpers";

async function mockAnonymous(page: Page, status: number, code: string) {
  let calls = 0;
  await page.route(`${E2E_FAKE_SUPABASE_URL}/auth/v1/signup**`, async (route) => {
    calls++;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: status, error_code: code, msg: code }) });
  });
  return () => calls;
}

test("첫 접속: '/' → 구름이 소개, 다음·건너뛰기, 마지막에 체험 시작하기와 안내", async ({ page }) => {
  const console = trackConsoleErrors(page, [422, 429]);
  await hideDevOverlay(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("note", { name: "체험용 사이트 안내" })).toBeVisible();
  const intro = page.getByLabel(/^소개 \d \/ 4$/);
  await expect(intro).toHaveAccessibleName("소개 1 / 4");
  await expect(page.getByRole("heading", { name: "안녕하세요, 저는 구름이예요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "건너뛰기" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(intro).toHaveAccessibleName("소개 2 / 4");
  await expect(page.getByRole("heading", { name: "약은 사진이나 이름으로 등록해요" })).toBeVisible();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await expect(intro).toHaveAccessibleName("소개 4 / 4");
  await expect(page.getByRole("button", { name: "건너뛰기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "체험 시작하기" })).toBeVisible();
  const info = page.getByRole("list", { name: "체험 안내" });
  await expect(info).toContainText("회원가입·아이디·비밀번호 없이 시작해요");
  await expect(info).toContainText("24시간 뒤 자동으로 지워져요");
  await expect(info).toContainText("실제 이름·연락처·건강정보는 입력하지 마세요");
  // 점으로 원하는 단계로
  await page.getByRole("button", { name: "1단계로" }).click();
  await expect(intro).toHaveAccessibleName("소개 1 / 4");
  await expectNoHorizontalOverflow(page);
  console.expectNone();
});

test("체험 시작하기: 익명 로그인이 꺼져 있으면 친절한 안내, 요청이 많으면 잠시 후 안내 (로그인 화면으로 보내지 않음)", async ({ page }) => {
  const console = trackConsoleErrors(page, [422, 429]);
  await hideDevOverlay(page);
  const calls = await mockAnonymous(page, 422, "anonymous_provider_disabled");
  await page.goto("/start", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "체험 시작하기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "체험 기능이 아직 켜지지 않았어요. 잠시 후 다시 시도해 주세요." })).toBeVisible();
  expect(calls()).toBe(1);
  await expect(page).toHaveURL(/\/start$/);

  await page.unroute(`${E2E_FAKE_SUPABASE_URL}/auth/v1/signup**`);
  await mockAnonymous(page, 429, "over_request_rate_limit");
  await page.getByRole("button", { name: "체험 시작하기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "지금 체험을 시작하려는 분이 많아요. 잠시 후 다시 시도해 주세요." })).toBeVisible();
  console.expectNone();
});

test("로그인 화면에도 '로그인 없이 체험하기', 로그인 안 한 /my 는 /start 로", async ({ page }) => {
  await hideDevOverlay(page);
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "로그인 없이 체험하기" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await page.goto("/my", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/start$/);
});

test("[PC] 첫 화면: 가운데 카드, 가로 넘침 없음", async ({ page }) => {
  await hideDevOverlay(page);
  await page.goto("/start", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "안녕하세요, 저는 구름이예요" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
