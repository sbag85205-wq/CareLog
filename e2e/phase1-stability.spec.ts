/**
 * 1단계 안정성 개선 검증 (A~E) — 가상 데이터만 사용
 * 화면 크기와 무관한 로직이라 모바일 화면에서만 실행합니다 (playwright.config.ts의 grep).
 */
import { expect, test, type Page } from "@playwright/test";
import { openApp, setDevFlags, switchMode, switchRole, tab, trackConsoleErrors } from "./helpers";

const queue = (page: Page) => page.locator("section", { hasText: "입원 환자 생활 요청" });

test("A. 의료진에게는 담당 환자의 생활 요청만 표시", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await switchRole(page, "의료진");
  await page.getByText("담당 환자 목록").waitFor();

  await expect(queue(page).getByText("담당 환자 · 미처리 3건")).toBeVisible();
  await expect(page.getByText("한다른 (가상)")).toHaveCount(0); // 다른 병동 담당 환자
  await expect(page.getByText(/다른 병동 환자의 물 요청/)).toHaveCount(0);
  console.expectNone();
});

test("B. 새로 만든 요청이 기존 요청보다 위에 (실제 시각 기준 정렬)", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await switchMode(page, "입원");
  await tab(page, "생활 요청").click();
  await page.getByRole("button", { name: /기타 요청/ }).click();
  await page.getByPlaceholder("요청 내용을 적어 주세요").fill("(데모) 정렬 확인용 요청");
  await page.getByRole("button", { name: "요청 보내기" }).click();
  await expect(page.getByText("요청이 접수되었습니다")).toBeVisible();

  await switchRole(page, "의료진");
  const firstItem = queue(page).locator("li").first();
  await expect(firstItem).toContainText("정렬 확인용 요청");
  await expect(firstItem).toContainText("김하늘 (가상)");
  console.expectNone();
});

test("C. 상태는 한 단계씩만 — 더블클릭해도 '처리 완료'로 건너뛰지 않음", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await switchRole(page, "의료진");
  const item = queue(page).locator("li", { hasText: "따뜻한 물 한 병" });
  await item.getByRole("button", { name: "직원 확인" }).dblclick();

  await expect(item.getByRole("button", { name: /처리 완료/ })).toBeVisible();
  await expect(item.getByLabel("진행 상태: 직원 확인")).toBeVisible();
  await expect(queue(page).getByText("담당 환자 · 미처리 3건")).toBeVisible(); // 완료로 빠지지 않음
  console.expectNone();
});

test("D. 퇴원 후 재입원하면 새 입원 이력(새 병실) 사용, 기존 기록 유지", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await expect(page.getByText("환자 자기기록 모드")).toBeVisible();

  const hero = page.locator("h1").locator("..");
  await switchMode(page, "입원");
  await expect(hero).toContainText("701호 입원 중");

  await switchMode(page, "통원");
  await expect(hero).not.toContainText("입원 중");

  await switchMode(page, "입원");
  await expect(hero).toContainText("702호 입원 중"); // 이전 병실(701호)이 남지 않음

  await tab(page, "건강기록").click();
  await expect(page.getByText(/^총 \d+건$/)).toBeVisible();
  // 과거 통원 기록이 그대로 남아 있음
  await expect(page.locator("li").filter({ hasText: "컨디션" }).getByText("통원", { exact: true }).first()).toBeVisible();
  console.expectNone();
});

test.describe("E. 입원 식사 기록 버튼 — 가상 네트워크 지연·실패", () => {
  test("지연 1.5초: 누르는 즉시 선택 표시, 저장 후 새로고침해도 유지", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await setDevFlags(page, { latencyMs: 1500 });
    await openApp(page);
    await switchMode(page, "입원");
    await tab(page, "식사").click();

    const lunch = page.getByRole("group", { name: "점심 섭취량" });
    const started = Date.now();
    await lunch.getByRole("button", { name: "절반" }).click();
    await expect(lunch.getByRole("button", { name: "절반" })).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(1500); // 응답을 기다리지 않고 반영
    await expect(page.getByText("저장 중").first()).toBeVisible();
    await expect(page.getByText("저장 중")).toHaveCount(0, { timeout: 5000 });

    await page.reload({ waitUntil: "networkidle" });
    await tab(page, "식사").click();
    await expect(page.getByRole("group", { name: "점심 섭취량" }).getByRole("button", { name: "절반" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    console.expectNone();
  });

  test("연속 클릭: 마지막 선택만 남음", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await setDevFlags(page, { latencyMs: 800 });
    await openApp(page);
    await switchMode(page, "입원");
    await tab(page, "식사").click();
    const dinner = page.getByRole("group", { name: "저녁 섭취량" });
    for (const label of ["조금", "전부", "대부분", "대부분"]) await dinner.getByRole("button", { name: label }).click();
    await expect(page.getByText("저장 중")).toHaveCount(0, { timeout: 8000 });
    await page.reload({ waitUntil: "networkidle" });
    await tab(page, "식사").click();
    const pressed = page.getByRole("group", { name: "저녁 섭취량" }).locator('[aria-pressed="true"]');
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveText("대부분");
    console.expectNone();
  });

  test("저장 실패: 이전 선택으로 복구 + 오류 안내", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await setDevFlags(page, { latencyMs: 600, failWrites: true });
    await openApp(page);
    await page.evaluate(() => localStorage.setItem("carelog.dev.failWrites", "0"));
    await switchMode(page, "입원"); // 모드 전환은 성공시킨 뒤
    await tab(page, "식사").click();
    await page.evaluate(() => localStorage.setItem("carelog.dev.failWrites", "1"));

    const breakfast = page.getByRole("group", { name: "아침 섭취량" });
    await breakfast.getByRole("button", { name: "전부" }).click();
    await expect(breakfast.getByRole("button", { name: "전부" })).toHaveAttribute("aria-pressed", "true");
    const alert = page.getByRole("alert").filter({ hasText: "가상 네트워크 오류" });
    await expect(alert).toContainText("이전 선택으로 되돌렸습니다");
    await expect(breakfast.getByRole("button", { name: "전부" })).toHaveAttribute("aria-pressed", "false");
    console.expectNone();
  });

  test("저장 중 '요청 보내기' 연타해도 1건만 등록", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await setDevFlags(page, { latencyMs: 1000 });
    await openApp(page);
    await switchMode(page, "입원");
    await tab(page, "생활 요청").click();
    await page.getByRole("button", { name: /침구 교체/ }).click();
    await page.getByRole("button", { name: "요청 보내기" }).dblclick();
    await expect(page.getByText("요청이 접수되었습니다")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("li", { hasText: "침구 교체 부탁드립니다." })).toHaveCount(1);
    console.expectNone();
  });
});
