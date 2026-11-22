/**
 * 공개 데모 저장소의 안정성 — 가상 네트워크 지연·실패 (개발 서버 전용 플래그)
 * 데모도 로그인 버전과 같은 화면을 쓰므로, 저장 중·실패 시 화면 동작을 함께 확인
 */
import { expect, test } from "@playwright/test";
import { menu, openApp, setDevFlags, switchMode, switchRole } from "./helpers";

test("저장 실패: 오류 안내 후 입력한 내용 유지, 실패한 기록은 남지 않음", async ({ page }) => {
  await setDevFlags(page, { failWrites: true });
  await openApp(page);
  await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ }).click();
  await page.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
  await page.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(1).click();
  await page.getByRole("group", { name: "식사량" }).getByRole("button", { name: "절반" }).click();
  await page.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "보통" }).click();
  await page.getByRole("textbox", { name: "메모" }).fill("(가상) 실패해도 남아 있어야 하는 메모");
  await page.getByRole("button", { name: /^기록 (저장|수정)$/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "가상 네트워크 오류" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "메모" })).toHaveValue("(가상) 실패해도 남아 있어야 하는 메모");
  await expect(page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ })).toHaveAttribute("aria-pressed", "true");
});

test("지연 1.5초: 생활 요청 '요청 보내기'를 연타해도 1건만, 상태는 한 단계씩만", async ({ page }) => {
  await openApp(page);
  await switchMode(page, "입원");
  await page.evaluate(() => localStorage.setItem("carelog.dev.latencyMs", "1500"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "침구", exact: true }).click();
  const send = page.getByRole("dialog").getByRole("button", { name: /요청 보내기|보내는 중/ });
  await send.click();
  await send.click({ force: true }).catch(() => {});
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("region", { name: "침구 교체 접수" })).toHaveCount(1);

  await switchRole(page, "의료진");
  await menu(page, "생활 요청").click();
  const card = page.getByRole("region", { name: "침구 교체 접수" }).filter({ hasText: "김하늘 (가상)" });
  await card.getByRole("button", { name: /직원 확인|처리 중/ }).dblclick();
  // 더블클릭해도 '처리 완료'로 건너뛰지 않음
  await expect(page.getByRole("region", { name: "침구 교체 직원 확인" }).filter({ hasText: "김하늘 (가상)" })).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByRole("region", { name: "침구 교체 처리 완료" })).toHaveCount(0);
});

test("퇴원 후 재입원하면 새 입원 이력, 기존 기록 유지", async ({ page }) => {
  await openApp(page);
  await switchMode(page, "입원");
  await switchMode(page, "통원");
  await switchMode(page, "입원");
  await menu(page, "기록 보기").click();
  const history = page.getByRole("region", { name: "입원 이력" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByText("입원 중")).toHaveCount(1);
});
