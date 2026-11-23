/**
 * UI·UX 개선 (Soft Glass 유지) — 공개 데모, 가상 데이터
 * 홈 한눈에·복용 체크 접기 · 약 검색 상세 필터 · 내 몸의 반응 약별/타임라인 · 진료 준비 핵심·접기
 * (함께 보기 단계별 흐름은 demo-regression 의 데모 E 에서 확인)
 */
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, menu, openApp, trackConsoleErrors } from "./helpers";

test("홈: 오늘 한눈에 · 복용 중 더 보기 · 복용 체크 접기(새로고침 후에도 기억)", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  const glance = page.getByRole("region", { name: "오늘 한눈에" });
  await expect(glance.getByRole("button", { name: "지금 복용 중 6개" })).toBeVisible();
  await expect(glance.getByRole("button", { name: "오늘 복용 체크 0 / 5" })).toBeVisible();
  await expect(glance.getByRole("button", { name: /^진료 때 물어볼 질문 \d+개$/ })).toBeVisible();

  // 지금 복용 중: 3개만 보이고 '3개 더 보기'
  const current = page.getByRole("region", { name: "지금 복용 중" });
  await expect(current.getByLabel(/^복용 중: /)).toHaveCount(3);
  const more = current.getByRole("button", { name: "3개 더 보기" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(current.getByLabel(/^복용 중: /)).toHaveCount(6);
  await current.getByRole("button", { name: "접기" }).click();
  await expect(current.getByLabel(/^복용 중: /)).toHaveCount(3);

  // 오늘 복용 체크: 기록 → 요약 갱신 → 접어도 요약은 보임 → 새로고침 후에도 접힘
  const check = page.getByLabel("오늘 복용 체크", { exact: true });
  await check.getByLabel("복용 체크: 가상혈압정5밀리그램").getByRole("button", { name: "아침 · 기록 없음" }).click();
  await expect(glance.getByRole("button", { name: "오늘 복용 체크 1 / 5" })).toBeVisible();
  const toggle = check.getByRole("button", { name: /^오늘 복용 체크/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(check.getByText("시간대 1 / 5 기록")).toBeVisible();
  await expect(check.getByLabel("복용 체크: 가상혈압정5밀리그램")).toBeHidden();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByLabel("오늘 복용 체크", { exact: true }).getByRole("button", { name: /^오늘 복용 체크/ })).toHaveAttribute("aria-expanded", "false");
  await expectNoHorizontalOverflow(page);
  console.expectNone();
});

test("나의 약 기록: 상세 필터 접기·펼치기, 적용한 조건 칩으로 빼기, 보기별 개수", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await menu(page, "나의 약 기록").click();
  const filterBtn = page.getByRole("button", { name: /^상세 필터/ });
  await expect(filterBtn).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("group", { name: "복용 상태" })).toBeHidden();
  await filterBtn.click();
  await page.getByRole("group", { name: "약 종류" }).getByRole("button", { name: "진통·해열제" }).click();
  await page.getByRole("group", { name: "진료과" }).getByRole("button", { name: "정형외과" }).click();
  const applied = page.getByLabel("적용한 조건");
  await expect(applied.getByRole("button", { name: /^조건 빼기:/ })).toHaveCount(2);
  await expect(page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "약별로 1" })).toBeVisible();
  await filterBtn.click(); // 접어도 조건은 칩으로 보임
  await expect(page.getByRole("group", { name: "약 종류" })).toBeHidden();
  await applied.getByRole("button", { name: "조건 빼기: 정형외과" }).click();
  await expect(page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "약별로 4" })).toBeVisible();
  await page.getByLabel("제품명·성분으로 찾기").fill("이부펜");
  await expect(page.getByRole("region", { name: "찾은 약" }).getByRole("heading", { name: "찾은 약 · 1개" })).toBeVisible();
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await applied.getByRole("button", { name: "조건 지우기" }).click();
  await expect(applied).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  console.expectNone();
});

test("내 몸의 반응: 약별 요약(펼치면 날짜별) · 날짜별 타임라인(달마다) · 묶음 필터", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await menu(page, "내 몸의 반응").click();
  const summary = page.getByRole("region", { name: "약별 요약" });
  const pain = summary.getByLabel("약별 요약: 가상진통정500밀리그램");
  await expect(pain.getByText(/^경험 2건/)).toBeVisible(); // 같은 품목기준코드 두 번 등록 → 한 묶음
  const timeline = pain.getByRole("list", { name: "가상진통정500밀리그램 날짜별 경험" });
  await expect(timeline).toBeHidden();
  await pain.getByRole("button", { name: "날짜별 기록 보기" }).click();
  await expect(timeline.getByRole("listitem")).toHaveCount(2);
  // 처방 전체 기록은 따로 묶이고 원인 미확인 안내
  await expect(
    summary
      .getByLabel(/약별 요약: .*함께 먹은 약 전체/)
      .first()
      .getByText("어느 약 때문인지는 확인되지 않은 기록이에요"),
  ).toBeVisible();

  await page.getByRole("group", { name: "경험 묶음" }).getByRole("button", { name: "복용 후 불편" }).click();
  await expect(summary.getByLabel("약별 요약: 가상진통정500밀리그램")).toHaveCount(0); // 불편 기록 없음
  await expect(summary.getByLabel("약별 요약: 가상이부펜정200밀리그램")).toBeVisible();

  await page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "날짜별 타임라인" }).click();
  const tl = page.getByLabel("날짜별 타임라인");
  await expect(tl.getByRole("heading", { level: 3, name: /^\d{4}년 \d{1,2}월$/ }).first()).toBeVisible();
  await expect(tl.getByLabel(/^경험: /).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  console.expectNone();
});

test("진료 준비: 핵심 정보 한 장 + 상세 섹션 접기·펼치기", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await menu(page, "진료 준비").click();
  const key = page.getByRole("region", { name: "진료 핵심 정보" });
  await expect(key.getByText("지금 복용 중 3개")).toBeVisible();
  await expect(key.getByText(/^기억해 둔 불편 경험 \d+건$/)).toBeVisible();
  await expect(key.getByText(/경험했다고 기록함/)).toBeVisible();
  await expect(key.getByRole("button", { name: "진료용 요약 열기" })).toBeVisible();

  // 기본: 복용 중·불편 경험은 펼침, 이전 처방·2주 요약은 접힘
  await expect(page.getByRole("button", { name: /^현재 복용 중이라고 기록한 약/ })).toHaveAttribute("aria-expanded", "true");
  const history = page.getByRole("button", { name: /^진료 때 보여주기 · 이전 처방 이력/ });
  await expect(history).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^최근 2주 컨디션 요약/ })).toHaveAttribute("aria-expanded", "false");
  await history.click();
  // 최근 4건만 보여 줌 (가장 오래된 이비인후과 처방은 진료 핵심의 '최근 처방'이 아님)
  await page
    .getByRole("region", { name: "진료 때 보여주기 · 이전 처방 이력" })
    .getByRole("button", { name: /처방 · 정형외과 · 약 2개$/ })
    .click();
  await expect(page.getByRole("dialog", { name: "진료 때 보여주기" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();

  await key.getByRole("button", { name: "최근 처방 보여주기" }).click();
  await expect(page.getByRole("dialog", { name: "진료 때 보여주기" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await key.getByRole("button", { name: "진료용 요약 열기" }).click();
  await expect(page.getByRole("dialog", { name: "진료용 요약" }).getByRole("button", { name: "인쇄 또는 PDF로 저장" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  console.expectNone();
});

test("[PC] 개선한 화면들 가로 넘침 없음 · 홈 한눈에 4칸", async ({ page }) => {
  const console = trackConsoleErrors(page);
  await openApp(page);
  await expect(page.getByRole("region", { name: "오늘 한눈에" }).getByRole("button")).toHaveCount(4);
  for (const m of ["나의 약 기록", "내 몸의 반응", "함께 보기", "진료 준비"]) {
    await menu(page, m).click();
    await expectNoHorizontalOverflow(page);
  }
  console.expectNone();
});
