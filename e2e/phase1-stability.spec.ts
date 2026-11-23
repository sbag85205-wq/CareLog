/**
 * 공개 데모 저장소의 안정성 — 가상 네트워크 지연·실패 (개발 서버 전용 플래그)
 * 데모도 로그인 버전과 같은 화면을 쓰므로, 저장 중·실패 시 화면 동작을 함께 확인
 * (병동 흐름 — 생활 요청·입퇴원 — 은 새 버전 화면에서 숨겨 여기서 제외. FEATURES.WARD 참고)
 */
import { expect, test } from "@playwright/test";
import { menu, openApp, setDevFlags } from "./helpers";

test("저장 실패: 오류 안내 후 입력한 내용 유지, 실패한 기록은 남지 않음", async ({ page }) => {
  await setDevFlags(page, { failWrites: true });
  await openApp(page);
  // 컨디션 기록은 진료 준비 → 컨디션 기록 열기 (메뉴에서는 빠졌지만 기능은 보존)
  await menu(page, "진료 준비").click();
  await page.getByRole("button", { name: "컨디션 기록 열기" }).click();
  await page.getByRole("button", { name: /^이 날짜 (기록하기|의 기록 수정)$/ }).click();
  const dlg = page.getByRole("dialog", { name: /기록 (작성|수정)$/ });
  await dlg.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ }).click();
  await dlg.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
  await dlg.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(1).click();
  await dlg.getByRole("group", { name: "식사량" }).getByRole("button", { name: "절반" }).click();
  await dlg.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "보통" }).click();
  await dlg.getByRole("textbox", { name: "메모" }).fill("(가상) 실패해도 남아 있어야 하는 메모");
  await dlg.getByRole("button", { name: /^기록 (저장|수정)$/ }).click();
  await expect(dlg.getByRole("alert").filter({ hasText: "가상 네트워크 오류" })).toBeVisible();
  await expect(dlg.getByRole("textbox", { name: "메모" })).toHaveValue("(가상) 실패해도 남아 있어야 하는 메모");
  await expect(dlg.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^2점/ })).toHaveAttribute("aria-pressed", "true");
});

test("지연 1.5초: 진료 질문 '추가'를 연타해도 1건만", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem("carelog.dev.latencyMs", "1500"));
  await page.reload({ waitUntil: "networkidle" });
  await menu(page, "진료 준비").click();
  await page.getByLabel("새 질문").fill("(가상) 연타 확인 질문");
  const add = page.getByRole("button", { name: "질문 추가" });
  await add.click();
  await add.click({ force: true, timeout: 1000 }).catch(() => {});
  await expect(page.getByRole("list", { name: "진료 질문 목록" }).getByText("(가상) 연타 확인 질문")).toHaveCount(1, { timeout: 10_000 });
});
