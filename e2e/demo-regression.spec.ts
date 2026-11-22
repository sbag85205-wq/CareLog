/**
 * 공개 데모 (/demo, 포스터 QR) — 로그인 없이, 가상 데이터는 이 브라우저에만
 * 로그인 버전과 같은 화면(아이보리·세이지 디자인)으로 역할 전환·통원/입원·예제 처방전·초기화를 체험
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, menu, openApp, switchMode, switchRole, trackConsoleErrors } from "./helpers";

async function registerExamplePrescription(page: Page) {
  await menu(page, "내 약").click();
  await page.getByRole("button", { name: "예제 처방전 불러오기" }).click();
  const dlg = page.getByRole("dialog", { name: "예제 처방전 불러오기" });
  await expect(dlg.getByRole("figure", { name: "예제 처방전 (가상)" })).toBeVisible();
  await dlg.getByRole("button", { name: "예제 처방전 읽기" }).click();
  await expect(dlg.getByText("예제 처방전(가상)을 읽었어요 · 약 5개 · 확인 필요 2개")).toBeVisible();
  const rows = dlg.getByRole("list", { name: "처방전에서 읽은 약" });
  const row = (n: number) => rows.getByRole("listitem").nth(n);
  // 확인됨(보험코드) · 확인 필요(비슷한 이름·다른 함량) · 확인됨(이름) · 확인 필요(함량 다름) · 결과 없음
  await expect(row(0).getByText("확인됨")).toBeVisible();
  await expect(row(1).getByText("확인 필요")).toBeVisible();
  await expect(row(2).getByText("확인됨")).toBeVisible();
  await expect(row(3).getByText("확인 필요")).toBeVisible();
  await expect(row(4).getByText("검색 결과 없음 · 직접 입력")).toBeVisible();
  // 미리보기: 처방전에 있는 값만 채움
  await expect(row(0).getByLabel("1회 복용량")).toHaveValue("1회 1정");
  await expect(row(0).getByLabel("횟수·복용 시간")).toHaveValue("하루 3회 · 식후 30분");
  await expect(row(0).getByLabel("기간")).toHaveValue("5일분");
  await expect(row(2).getByLabel("함량")).toHaveValue("");

  const button = dlg.getByRole("button", { name: /선택한 약 \d+개 한 번에 등록/ });
  await expect(button).toBeDisabled(); // 확인 필요가 남아 있음
  await expect(dlg.getByText("확인 필요 2개 — 제품 후보를 고르거나")).toBeVisible();
  // 비슷한 이름: 같은 함량·다른 업체 중 고르기 / 함량 다름: 후보 쓰지 않고 직접 입력
  await row(1).getByRole("radio", { name: "케어가상캡슐10밀리그램 · 다른가상약품" }).check();
  await expect(row(1).getByLabel("약 이름")).toHaveValue("케어가상캡슐10밀리그램");
  await row(3).getByRole("radio", { name: "후보 사용 안 함 · 직접 입력" }).check();
  await row(3).getByLabel("1회 복용량").fill("1회 반 정");
  await expect(button).toHaveText("선택한 약 5개 한 번에 등록");
  await button.click();
  await button.click({ force: true, timeout: 1000 }).catch(() => {}); // 연타해도 한 번만 등록
  await expect(page.getByText("약 5개를 등록했어요").or(page.getByText("처방전에서 약 5개를 등록했어요."))).toBeVisible();
  if (await dlg.isVisible()) await dlg.getByRole("button", { name: "닫기" }).click();
}

test.describe("공개 데모 — 모바일", () => {
  test("첫 화면: 가상 데이터 데모 표시·역할 전환이 바로 보이고, 새 디자인으로 환자·의료진·보호자", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await expect(page.getByText("가상 데이터 데모", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "데모 역할" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "초기화" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님, 안녕하세요." })).toBeVisible();
    // 로그인 버전과 같은 배경(아이보리)·버튼(짙은 세이지)
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector("div.bg-ivory")!).backgroundColor);
    expect(bg).toBe("rgb(248, 246, 240)");
    await expectNoHorizontalOverflow(page);

    for (const name of ["기록 보기", "내 약", "진료 준비", "보호자 공유"]) {
      await menu(page, name).click();
      await expectNoHorizontalOverflow(page);
    }
    await expect(page.getByText("김보호 (가상 보호자)")).toBeVisible(); // 공유 중인 가상 보호자

    await switchRole(page, "의료진");
    await expect(page.getByRole("heading", { name: "담당 환자" })).toBeVisible();
    await page.getByRole("button", { name: "김하늘 (가상) 상세 보기" }).click();
    await expect(page.getByRole("heading", { name: "검토 상태" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님의 안부" })).toBeVisible();
    await expect(page.getByRole("region", { name: "최근 안부" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    console.expectNone();
  });

  test("통원↔입원 전환·오늘 기록·생활 요청 → 의료진 처리 → 환자·보호자 확인 → 새로고침 유지 → 초기화", async ({ page }) => {
    await openApp(page);
    // 오늘 컨디션 기록
    await page.getByRole("group", { name: "오늘 컨디션" }).getByRole("button", { name: /^4점/ }).click();
    await page.getByRole("group", { name: "피로도" }).getByRole("button").nth(1).click();
    await page.getByRole("group", { name: "수면 상태" }).getByRole("button").nth(3).click();
    await page.getByRole("group", { name: "식사량" }).getByRole("button", { name: "대부분" }).click();
    await page.getByRole("group", { name: "소화 상태" }).getByRole("button", { name: "좋음" }).click();
    await page.getByRole("button", { name: /^기록 (저장|수정)$/ }).click();
    await expect(page.getByText("저장되었습니다")).toBeVisible();

    await switchMode(page, "입원");
    await expect(page.getByText("통원 때의 기록도 그대로 이어져요.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "오늘의 식사" })).toBeVisible();
    await page.getByRole("button", { name: "물", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "요청 보내기" }).click();
    await expect(page.getByRole("region", { name: "물 요청 접수" }).first()).toBeVisible();

    await switchRole(page, "의료진");
    await menu(page, "생활 요청").click();
    const req = page.getByRole("region", { name: "물 요청 접수" }).filter({ hasText: "김하늘 (가상)" }).first();
    await req.getByRole("button", { name: "직원 확인" }).click();
    await page.getByRole("region", { name: "물 요청 직원 확인" }).filter({ hasText: "김하늘 (가상)" }).first().getByRole("button", { name: "처리 완료" }).click();

    await switchRole(page, "보호자");
    await expect(page.getByRole("region", { name: "물 요청 처리 완료" }).first()).toBeVisible();
    await switchRole(page, "환자");
    await expect(page.getByRole("region", { name: "물 요청 처리 완료" }).first()).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("입원 중", { exact: true })).toBeVisible(); // 이 브라우저에 저장
    await switchMode(page, "통원");
    await menu(page, "기록 보기").click();
    await expect(page.getByRole("heading", { name: "입원 이력" })).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await page.getByRole("dialog", { name: "데모 데이터 초기화" }).getByRole("button", { name: "처음 상태로 되돌리기" }).click();
    await expect(page.getByText("통원 중", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "물 요청 처리 완료" })).toHaveCount(0);
  });

  test("예제 처방전: 약 목록 확인 → 제품 후보 선택 → 여러 약 한 번에 등록 → 다시 불러오면 이미 등록됨 → 보호자 공개 → 초기화", async ({ page }) => {
    await openApp(page);
    await registerExamplePrescription(page);
    for (const name of ["케어가상정500밀리그램(가상성분)", "케어가상캡슐10밀리그램", "케어가상코프시럽(가상성분)", "케어가상서방정75밀리그램", "없는가상연고"]) {
      await expect(page.getByRole("region", { name })).toHaveCount(1); // 중복 없이 1개씩
    }
    await expect(page.getByText("처방전에서 약 5개를 등록했어요.")).toBeVisible();
    await expect(page.getByRole("region", { name: "케어가상서방정75밀리그램" }).getByText("1회 반 정 · 하루 1회 · 취침 전 · 30일분")).toBeVisible();

    // 다시 불러오면 이미 등록된 약은 기본으로 빠짐
    await page.getByRole("button", { name: "예제 처방전 불러오기" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "예제 처방전 읽기" }).click();
    await expect(dlg.getByText("이미 등록된 약").first()).toBeVisible();
    await expect(dlg.getByRole("button", { name: /선택한 약 0개/ })).toBeDisabled();
    await dlg.getByRole("button", { name: "닫기" }).click();

    // 처방전으로 등록한 약은 기본 비공개 → 공개하면 보호자에게 보임
    await switchRole(page, "보호자");
    await expect(page.getByText("케어가상코프시럽(가상성분)")).toHaveCount(0);
    await switchRole(page, "환자");
    await menu(page, "내 약").click();
    await page.getByRole("region", { name: "케어가상코프시럽(가상성분)" }).getByRole("switch", { name: "보호자에게 공개" }).click();
    await switchRole(page, "보호자");
    await expect(page.getByRole("region", { name: "케어가상코프시럽(가상성분)" })).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "처음 상태로 되돌리기" }).click();
    await switchRole(page, "환자");
    await menu(page, "내 약").click();
    await expect(page.getByRole("region", { name: "케어가상코프시럽(가상성분)" })).toHaveCount(0);
  });

  test("약 직접 추가: 가상 식약처 검색으로 고르거나 직접 입력 (실제 API 호출 없음)", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/medications/search") || r.url().includes("apis.data.go.kr")) calls.push(r.url());
    });
    await openApp(page);
    await menu(page, "내 약").click();
    await page.getByRole("button", { name: "약 추가" }).click();
    const dlg = page.getByRole("dialog", { name: "약 추가" });
    await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("케어가상캡슐");
    await dlg.getByRole("button", { name: "검색", exact: true }).click();
    await dlg.getByRole("button", { name: "케어가상캡슐10밀리그램 (다른가상약품) 선택" }).click();
    await dlg.getByLabel("1회 복용량 (안내받은 대로)").fill("1캡슐");
    await dlg.getByRole("button", { name: "약 추가" }).click();
    await expect(page.getByRole("region", { name: "케어가상캡슐10밀리그램" })).toBeVisible();
    expect(calls).toEqual([]);
  });
});

test.describe("[PC] 공개 데모 — 데스크톱", () => {
  test("왼쪽 메뉴·역할 전환·예제 처방전, 화면 잘림 없음", async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole("button", { name: "데모 데이터 초기화" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await registerExamplePrescription(page);
    await expectNoHorizontalOverflow(page);
    await switchRole(page, "의료진");
    await expect(page.getByRole("heading", { name: "담당 환자" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님의 안부" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
