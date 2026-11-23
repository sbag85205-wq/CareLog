/**
 * 공개 데모 (/demo, 포스터 QR) — 로그인 없이, 가상 데이터는 이 브라우저에만
 * 새 방향: 지난 처방과 복용 후 느낀 점을 기록해 다음 진료에서 바로 보여 주기
 * 예제 처방전 등록 → 태그·메모 → ★ 보관 → 이비인후과 + 태그로 찾기 → 진료 때 보여주기
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, menu, openApp, switchRole, trackConsoleErrors } from "./helpers";

const NEW_RX = "2026/11/20 처방 · 이비인후과 · 약 5개";

/** 예제 처방전 → 처방 정보·약 확인 → 한 번에 등록 (연타해도 1건) */
async function registerExamplePrescription(page: Page, from: "home" | "meds" = "home") {
  if (from === "meds") await menu(page, "내 약").click();
  await page.getByRole("button", { name: "예제 처방전 불러오기" }).first().click();
  const dlg = page.getByRole("dialog", { name: "예제 처방전 불러오기" });
  await expect(dlg.getByRole("figure", { name: "예제 처방전 (가상)" })).toBeVisible();
  await dlg.getByRole("button", { name: "예제 처방전 읽기" }).click();
  await expect(dlg.getByText("예제 처방전(가상)을 읽었어요 · 약 5개 · 확인 필요 2개")).toBeVisible();

  // 처방 정보: 처방일·진료과는 처방전에서 읽고, 고칠 수 있음
  const info = dlg.getByRole("region", { name: "처방 정보" }).or(dlg.getByLabel("처방 정보"));
  await expect(info.getByLabel("처방일")).toHaveValue("2026-11-20");
  await expect(info.getByLabel("진료과")).toHaveValue("이비인후과");
  await expect(info.getByText("출처: 처방전·복약 안내")).toBeVisible();

  const rows = dlg.getByRole("list", { name: "처방전에서 읽은 약" });
  const row = (n: number) => rows.getByRole("listitem").nth(n);
  await expect(row(0).getByLabel("1회 복용량")).toHaveValue("1회 1정");
  await expect(row(0).getByLabel("횟수")).toHaveValue("하루 3회");
  await expect(row(0).getByLabel("시점")).toHaveValue("식후 30분");
  await expect(row(0).getByLabel("기간")).toHaveValue("5일분");
  await expect(row(4).getByText("검색 결과 없음 · 직접 입력")).toBeVisible();

  const button = dlg.getByRole("button", { name: /선택한 약 \d+개 한 번에 등록/ });
  await expect(button).toBeDisabled(); // 확인 필요가 남아 있음
  await row(1).getByRole("radio", { name: "케어가상캡슐10밀리그램 · 다른가상약품" }).check();
  await expect(row(1).getByLabel("약 이름")).toHaveValue("케어가상캡슐10밀리그램");
  await expect(row(1).getByText("출처: 식약처 제품 정보")).toBeVisible(); // 고른 제품의 식약처 주의사항
  await row(3).getByRole("radio", { name: "후보 사용 안 함 · 직접 입력" }).check();
  await row(3).getByLabel("1회 복용량").fill("1회 반 정");
  await expect(button).toHaveText("선택한 약 5개 한 번에 등록");
  await button.click();
  await button.click({ force: true, timeout: 1000 }).catch(() => {}); // 연타해도 한 번만
  await expect(dlg.getByText("처방 1건 · 약 5개를 등록했어요")).toBeVisible();
  await dlg.getByRole("button", { name: "닫기" }).click();
  await expect(dlg).toHaveCount(0);
}

const history = (page: Page) => page.getByRole("region", { name: "날짜별 처방" });

test.describe("공개 데모 — 모바일", () => {
  test("첫 화면: 지금 복용 중 중심 홈, 병동 기능 없음, 환자·보호자 역할", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await expect(page.getByText("가상 데이터 데모", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "데모 역할" }).getByRole("tab")).toHaveText(["환자", "보호자"]);
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님, 안녕하세요." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "지금 복용 중" })).toBeVisible();
    await expect(page.getByRole("article", { name: /^복용 중: / }).first()).toBeVisible();
    // 통원·입원 전환, 병동·호실, 식사, 생활 요청은 새 홈에 없음
    await expect(page.getByRole("group", { name: "이용 모드" })).toHaveCount(0);
    await expect(page.getByText("오늘의 식사")).toHaveCount(0);
    await expect(page.getByText("생활 요청")).toHaveCount(0);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector("div.bg-ivory")!).backgroundColor);
    expect(bg).toBe("rgb(248, 246, 240)");
    await expectNoHorizontalOverflow(page);

    for (const name of ["내 약", "진료 준비", "건강 기록", "보호자 공유"]) {
      await menu(page, name).click();
      await expectNoHorizontalOverflow(page);
    }
    await expect(page.getByText("김보호 (가상 보호자)")).toBeVisible();
    await expect(page.getByRole("group", { name: /공유 항목/ }).first().getByRole("button")).toHaveText(["건강기록", "약 정보"]);

    // 건강 기록은 홈에서 열 수 있음
    await menu(page, "홈").click();
    await page.getByRole("button", { name: /^오늘 (컨디션 기록|기록 수정)$/ }).click();
    await expect(page.getByRole("dialog", { name: "오늘 컨디션 기록" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();

    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님의 안부" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "공유된 처방" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    console.expectNone();
  });

  test("예제 처방 등록 → 태그·메모 → ★ 보관 → 이비인후과 + 속쓰림으로 찾기 → 진료 때 보여주기 → 새로고침 유지", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await registerExamplePrescription(page, "home");

    // 등록한 처방 상세가 바로 열림 (모바일)
    const detail = page.getByLabel("처방 상세");
    await expect(detail.getByRole("heading", { name: "2026년 11월 20일 처방" })).toBeVisible();
    await expect(detail.getByRole("region", { name: "그때 받은 약" }).getByRole("region", { name: /^처방 약: / })).toHaveCount(5);
    await expectNoHorizontalOverflow(page);

    // 복용 후 느낀 점: 좋은 점·불편한 점 함께 + 메모, 특정 약에 연결
    const editor = detail.getByLabel("복용 경험 남기기");
    await editor.getByLabel("기록 대상").selectOption({ label: "케어가상정500밀리그램(가상성분)" });
    await editor.getByRole("group", { name: "도움이 된 점" }).getByRole("button", { name: "증상이 줄었어요" }).click();
    await editor.getByRole("group", { name: "불편했던 점" }).getByRole("button", { name: "속쓰림" }).click();
    await editor.getByRole("textbox", { name: "메모" }).fill("(가상) 콧물은 줄었는데 저녁 약 먹고 속이 쓰렸어요");
    await editor.getByRole("button", { name: "복용 경험 저장" }).click();
    const note = detail.getByLabel("복용 경험: 케어가상정500밀리그램(가상성분)");
    await expect(note.getByText("환자 본인이 남긴 경험")).toBeVisible();
    await expect(note.getByText("(가상) 콧물은 줄었는데 저녁 약 먹고 속이 쓰렸어요")).toBeVisible();

    // 메모 → 다음 진료 질문 (고칠 수 있고 작성·수정 시각 표시)
    await note.getByRole("button", { name: "다음 진료 질문에 담기" }).click();
    const qs = detail.getByRole("region", { name: "이 처방에서 담은 질문" });
    await expect(qs.getByText(/^2026\/11\/20 이비인후과 처방 케어가상정500밀리그램\(가상성분\): 증상이 줄었어요, 속쓰림/)).toBeVisible();
    await qs.getByRole("button", { name: "질문 고치기" }).click();
    await qs.getByLabel("질문 수정").fill("(가상) 저녁 약을 식후 바로 먹어도 될까요?");
    await qs.getByRole("button", { name: "저장" }).click();
    await expect(qs.getByText("(가상) 저녁 약을 식후 바로 먹어도 될까요?")).toBeVisible();
    await expect(qs.getByText(/^작성 /)).toBeVisible();

    // ★ 보관
    await detail.getByRole("button", { name: "처방 보관 (★)" }).click();
    await expect(detail.getByRole("button", { name: "보관 해제" })).toHaveAttribute("aria-pressed", "true");

    // 목록으로 → 이비인후과 → ★ 보관한 처방만 → 속쓰림
    await detail.getByRole("button", { name: "처방 목록" }).click();
    await expect(history(page).getByRole("button", { name: NEW_RX, exact: true })).toBeVisible();
    // 처방일 최신순
    const labels = await history(page).getByRole("listitem").getByRole("button").filter({ hasText: "처방 ·" }).allTextContents();
    expect(labels[0]).toContain("2026/11/20");
    await page.getByRole("group", { name: "진료과" }).getByRole("button", { name: "이비인후과" }).click();
    await page.getByRole("switch", { name: "★ 보관한 처방만" }).click();
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "속쓰림" }).click();
    const found = history(page).getByRole("button", { name: /처방 · 이비인후과 · 약 \d개$/ });
    await expect(found).toHaveCount(2); // 새 처방 + 이전에 보관한 9/1 이비인후과 처방
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "졸림" }).click();
    await expect(found).toHaveCount(1); // 졸림까지 있는 건 이전 처방만
    await expect(history(page).getByRole("button", { name: "2026/9/1 처방 · 이비인후과 · 약 3개", exact: true })).toBeVisible();

    // 이전 처방도 그대로 열림
    await history(page).getByRole("button", { name: "2026/9/1 처방 · 이비인후과 · 약 3개", exact: true }).click();
    await expect(detail.getByRole("heading", { name: "2026년 9월 1일 처방" })).toBeVisible();
    await expect(detail.getByRole("region", { name: /^처방 약: / })).toHaveCount(3);
    await detail.getByRole("button", { name: "처방 목록" }).click();

    // 진료 때 보여주기 (새 처방)
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "졸림" }).click();
    await history(page).getByRole("button", { name: NEW_RX, exact: true }).click();
    await detail.getByRole("button", { name: "진료 때 보여주기" }).click();
    const show = page.getByRole("dialog", { name: "진료 때 보여주기" });
    await expect(show.getByText("2026년 11월 20일 · 이비인후과")).toBeVisible();
    await expect(show.getByText("당시 약 (5개)")).toBeVisible();
    await expect(show.getByText("복용 경험 (환자 본인 기록)")).toBeVisible();
    await expect(show.getByText("증상이 줄었어요 · 속쓰림")).toBeVisible();
    await expect(show.getByText("(가상) 저녁 약을 식후 바로 먹어도 될까요?")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await show.getByRole("button", { name: "닫기" }).click();

    // 새로고침해도 ★·메모·질문 유지
    await page.reload({ waitUntil: "networkidle" });
    await menu(page, "내 약").click();
    await page.getByRole("group", { name: "내 약 보기" }).getByRole("button", { name: "처방 이력" }).click();
    await expect(page.getByRole("region", { name: "★ 보관한 처방" }).getByRole("button", { name: NEW_RX, exact: true })).toBeVisible();
    await history(page).getByRole("button", { name: NEW_RX, exact: true }).click();
    await expect(detail.getByText("(가상) 콧물은 줄었는데 저녁 약 먹고 속이 쓰렸어요")).toBeVisible();
    await expect(detail.getByRole("button", { name: "보관 해제" })).toBeVisible();

    // 진료 준비에서도 질문 수정·진료 때 보여주기
    await menu(page, "진료 준비").click();
    await expect(page.getByText(`${NEW_RX} · 작성`, { exact: false })).toBeVisible();
    console.expectNone();
  });

  test("다시 불러오면 이미 등록된 약은 빠지고, 지금 복용 중에서 처방으로 이동", async ({ page }) => {
    await openApp(page);
    await registerExamplePrescription(page, "meds");
    await page.getByRole("group", { name: "내 약 보기" }).getByRole("button", { name: "지금 복용 중" }).click();
    await expect(page.getByRole("article", { name: "복용 중: 케어가상서방정75밀리그램" })).toBeVisible();
    await expect(page.getByRole("article", { name: "복용 중: 케어가상서방정75밀리그램" }).getByText("1회 반 정 · 하루 1회 · 취침 전")).toBeVisible();

    await page.getByRole("button", { name: "예제 처방전 불러오기" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "예제 처방전 읽기" }).click();
    await expect(dlg.getByText("이미 등록된 약").first()).toBeVisible();
    await expect(dlg.getByRole("button", { name: /선택한 약 0개/ })).toBeDisabled();
    await dlg.getByRole("button", { name: "닫기" }).click();

    await page.getByRole("article", { name: "복용 중: 케어가상서방정75밀리그램" }).getByRole("button", { name: /2026\/11\/20 이비인후과 처방/ }).click();
    await expect(page.getByLabel("처방 상세").getByRole("heading", { name: "2026년 11월 20일 처방" })).toBeVisible();
  });

  test("보호자: 공유를 켠 처방만, 약 정보 공유 범위가 있을 때만 보임 → 초기화", async ({ page }) => {
    await openApp(page);
    await registerExamplePrescription(page, "home");
    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "공유된 처방" })).toBeVisible();
    await expect(page.getByText("공유받은 처방이 없어요.")).toBeVisible();

    await switchRole(page, "환자");
    await menu(page, "내 약").click();
    await page.getByRole("group", { name: "내 약 보기" }).getByRole("button", { name: "처방 이력" }).click();
    await history(page).getByRole("button", { name: NEW_RX, exact: true }).click();
    await page.getByLabel("처방 상세").getByRole("switch", { name: "보호자와 공유" }).click();
    await expect(page.getByLabel("처방 상세").getByRole("switch", { name: "보호자와 공유" })).toHaveAttribute("aria-checked", "true");

    await switchRole(page, "보호자");
    const shared = page.getByRole("region", { name: "날짜별 처방" });
    await expect(shared.getByRole("button", { name: NEW_RX, exact: true })).toBeVisible();
    await expect(shared.getByRole("button", { name: /2026\/9\/1/ })).toHaveCount(0); // 공유 안 한 처방은 안 보임
    await shared.getByRole("button", { name: NEW_RX, exact: true }).click();
    await expect(page.getByLabel("복용 경험 남기기")).toHaveCount(0); // 읽기 전용
    await expect(page.getByRole("button", { name: "처방 보관 (★)" })).toHaveCount(0);

    // 환자가 '약 정보' 공유 범위를 끄면 처방도 안 보임
    await switchRole(page, "환자");
    await menu(page, "보호자 공유").click();
    const grant = page.getByRole("region", { name: "김보호 (가상 보호자) 공유 설정" });
    await grant.getByRole("group").getByRole("button", { name: "약 정보" }).click();
    await grant.getByRole("button", { name: "공유 항목 저장" }).click();
    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "공유된 처방" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: NEW_RX, exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "초기화" }).click();
    await page.getByRole("dialog", { name: "데모 데이터 초기화" }).getByRole("button", { name: "처음 상태로 되돌리기" }).click();
    await switchRole(page, "환자");
    await menu(page, "내 약").click();
    await page.getByRole("group", { name: "내 약 보기" }).getByRole("button", { name: "처방 이력" }).click();
    await expect(history(page).getByRole("button", { name: NEW_RX, exact: true })).toHaveCount(0);
    await expect(history(page).getByRole("button", { name: "2026/9/1 처방 · 이비인후과 · 약 3개", exact: true })).toBeVisible();
  });

  test("약 직접 추가: 가상 식약처 검색으로 고르거나 직접 입력 (실제 API 호출 없음)", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/medications/") || r.url().includes("apis.data.go.kr")) calls.push(r.url());
    });
    await openApp(page);
    await menu(page, "내 약").click();
    await page.getByRole("button", { name: "약 직접 추가" }).click();
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
  test("처방 이력: 왼쪽 날짜 목록·★ 보관한 처방, 오른쪽 상세 · 필터 조합 · 화면 잘림 없음", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await expect(page.getByRole("button", { name: "데모 데이터 초기화" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await registerExamplePrescription(page, "meds");
    const detail = page.getByLabel("처방 상세");
    // PC: 목록과 상세가 함께 보임
    await expect(history(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "★ 보관한 처방" })).toBeVisible();
    await expect(detail.getByRole("heading", { name: "2026년 11월 20일 처방" })).toBeVisible();
    await expect(history(page).getByRole("button", { name: NEW_RX, exact: true })).toHaveAttribute("aria-current", "true");

    await detail.getByLabel("복용 경험 남기기").getByRole("group", { name: "불편했던 점" }).getByRole("button", { name: "알약이 커서 삼키기 어려웠어요" }).click();
    await detail.getByLabel("복용 경험 남기기").getByRole("button", { name: "복용 경험 저장" }).click();
    await history(page).getByRole("button", { name: `${NEW_RX} 보관` }).click(); // 목록에서 바로 ★
    await expect(page.getByRole("region", { name: "★ 보관한 처방" }).getByRole("button", { name: NEW_RX, exact: true })).toBeVisible();

    await page.getByRole("group", { name: "진료과" }).getByRole("button", { name: "이비인후과" }).click();
    await page.getByRole("switch", { name: "★ 보관한 처방만" }).click();
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "알약이 커서 삼키기 어려웠어요" }).click();
    await expect(history(page).getByRole("button", { name: /처방 · .*개$/ })).toHaveCount(1);
    await history(page).getByRole("button", { name: NEW_RX, exact: true }).click();
    await detail.getByRole("button", { name: "진료 때 보여주기" }).click();
    await expect(page.getByRole("dialog", { name: "진료 때 보여주기" }).getByText("알약이 커서 삼키기 어려웠어요")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expectNoHorizontalOverflow(page);

    // 이전 처방도 오른쪽에서 열림
    await page.getByRole("group", { name: "진료과" }).getByRole("button", { name: "전체" }).click();
    await page.getByRole("switch", { name: "★ 보관한 처방만" }).click();
    await history(page).getByRole("button", { name: /처방 · 내과 · 약 \d개$/ }).click();
    await expect(detail.getByText("가상혈압정", { exact: false }).first()).toBeVisible();

    await menu(page, "홈").click();
    await expect(page.getByRole("heading", { name: "지금 복용 중" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await switchRole(page, "보호자");
    await expect(page.getByRole("heading", { name: "김하늘 (가상) 님의 안부" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    console.expectNone();
  });
});
