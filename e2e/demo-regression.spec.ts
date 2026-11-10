/**
 * 기존 데모 시나리오 17개 (최초 프로토타입 검증 항목) — 회귀 테스트
 * 모든 데이터는 가상 데이터입니다.
 */
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openApp, switchMode, switchRole, tab, trackConsoleErrors } from "./helpers";

test.describe("모바일 데모 흐름 (시나리오 1~13)", () => {
  test("환자 → 입원 → 의료진 → 보호자 → 새로고침 → 초기화", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);

    await test.step("1. 환자 홈 가로 스크롤 없음", () => expectNoHorizontalOverflow(page));
    await test.step("2. 그래프 표시", async () => {
      await expect(page.locator(".recharts-surface").first()).toBeVisible();
    });

    await test.step("3. 오늘 컨디션 기록 저장", async () => {
      await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^4점/ }).click();
      await page.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
      await page.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(3).click();
      await page.getByRole("group", { name: "식사량" }).getByRole("button", { name: "대부분" }).click();
      await page.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "좋음" }).click();
      await page.getByRole("group", { name: "불편한 증상" }).getByRole("button", { name: "두통" }).click();
      await page.getByRole("button", { name: "기록 저장" }).click();
      await expect(page.getByText("오늘 기록을 완료했어요")).toBeVisible();
    });

    await test.step("4. 입원 모드 전환 시 식사 메뉴 표시", async () => {
      await switchMode(page, "입원");
      await expect(tab(page, "식사")).toBeVisible();
    });

    await test.step("5. 생활 요청 등록", async () => {
      await tab(page, "생활 요청").click();
      await page.getByRole("button", { name: /물 요청/ }).click();
      await page.getByRole("button", { name: "요청 보내기" }).click();
      await expect(page.getByText("요청이 접수되었습니다")).toBeVisible();
    });

    await test.step("6. 식사 형태 변경 요청 → 직원 확인 대기", async () => {
      await tab(page, "식사").click();
      await page.getByRole("button", { name: "식사 형태 변경 요청" }).first().click();
      await page.getByRole("button", { name: "요청 보내기" }).click();
      await expect(page.getByText("직원 확인 대기").first()).toBeVisible();
    });

    await test.step("7. 의료진: 검토 대상 분류 표시", async () => {
      await switchRole(page, "의료진");
      await page.getByText("담당 환자 목록").waitFor();
      expect(await page.getByText("검토 대상").count()).toBeGreaterThan(1);
    });

    await test.step("8. 의료진: 요청 '직원 확인' 처리", async () => {
      const ack = page.getByRole("button", { name: "직원 확인" });
      const before = await ack.count();
      await ack.first().click();
      await expect(ack).toHaveCount(before - 1);
    });

    await test.step("9. 의료진: 후속 조치 기록", async () => {
      await page.getByRole("button", { name: /박데모/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "진료 상담 필요" }).click();
      await expect(page.getByText("진료 상담 필요’로 기록")).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    });

    await test.step("10. 보호자: 비공개 약 숨김", async () => {
      await switchRole(page, "보호자");
      await page.getByText("허용된 약 정보").waitFor();
      await expect(page.getByText("예시 영양제 C")).toHaveCount(0);
    });

    await test.step("11. 보호자: 입원 생활 요청 상태 표시", async () => {
      await expect(page.getByText("생활 요청 처리 상태")).toBeVisible();
    });

    await test.step("12. 새로고침 후 입원 모드 유지", async () => {
      await page.reload({ waitUntil: "networkidle" });
      await page.getByText("님, 안녕하세요").waitFor();
      await expect(page.getByRole("radio", { name: /입원 모드/ })).toHaveAttribute("aria-checked", "true");
    });

    await test.step("13. 데모 데이터 초기화 → 통원 모드", async () => {
      await page.getByRole("button", { name: "초기화" }).click();
      await expect(page.getByRole("radio", { name: /통원 모드/ })).toHaveAttribute("aria-checked", "true");
    });

    console.expectNone();
  });
});

test.describe("[PC] 데모 흐름 (시나리오 14~17)", () => {
  test("환자 홈 · 의료진 · 건강기록 달력", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);

    await test.step("14. PC 환자 홈 가로 스크롤 없음", () => expectNoHorizontalOverflow(page));
    await test.step("15. PC 그래프 표시", async () => {
      await expect(page.locator(".recharts-surface").first()).toBeVisible();
    });
    await test.step("16. PC 의료진 화면 가로 스크롤 없음", async () => {
      await switchRole(page, "의료진");
      await page.getByText("담당 환자 목록").waitFor();
      await expectNoHorizontalOverflow(page);
    });
    await test.step("17. PC 건강기록 달력·30일 그래프", async () => {
      await switchRole(page, "환자");
      await tab(page, "건강기록").click();
      await expect(page.getByText("최근 30일 기록 달력")).toBeVisible();
      await page.getByRole("button", { name: "최근 30일" }).first().click();
      await expect(page.getByText(/30일 중 \d+일 기록/)).toBeVisible();
    });

    console.expectNone();
  });
});
