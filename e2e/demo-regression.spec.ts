/**
 * 공개 데모 (/demo, 포스터 QR) — FeelPill(가칭) · 로그인 없이, 가상 데이터는 이 브라우저에만
 * "그때 먹었던 약, 나한테 어땠더라?"
 *
 * 데모 A 일반약 상자 등록 · B 복용 경험(자동 태그 제안) · C 약 종류로 과거 약 찾기 · D 진료 때 보여주기 · E 선택 공유
 * + 처방전 등록 후 이전 이력 보존 · 일반약 등록 ≠ 복용 · 복용 체크 · 복용 중인 약이 없어도 사용 · PC 배치
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, menu, openApp, switchRole, trackConsoleErrors } from "./helpers";

const RX_KEY = "carelog.demo-rx.v2";
const dialog = (page: Page) => page.getByRole("dialog");
const detail = (page: Page) => page.getByLabel("기록 상세");

async function openRegister(page: Page, option: RegExp) {
  await page.getByRole("button", { name: "약 등록하기" }).first().click();
  const dlg = page.getByRole("dialog", { name: "약 등록하기" });
  await expect(dlg.getByRole("list", { name: "등록 방법" }).getByRole("button")).toHaveCount(5);
  await dlg.getByRole("button", { name: option }).click();
}

/** 데모 A — 예제 일반약 상자 → 후보 2개 중 고르기 → 자동 분류 확인 → 등록 (복용으로 처리 안 함) */
async function registerExampleBox(page: Page) {
  await openRegister(page, /^일반약 상자 촬영·업로드/);
  const dlg = dialog(page);
  await expect(dlg.getByRole("figure", { name: "예제 일반약 상자 (가상)" })).toBeVisible();
  await dlg.getByRole("button", { name: "예제 상자 사진 읽기" }).click();
  await expect(dlg.getByText("데모용 예시 · 상자에서 읽은 제품명으로 찾았어요")).toBeVisible();
  const line = dlg.getByLabel("읽은 줄: 가상진통정500밀리그램");
  await expect(line.getByText("후보 2개 · 골라 주세요")).toBeVisible(); // 같은 이름·다른 회사 → 앱이 정하지 않음
  const button = dlg.getByRole("button", { name: /확인한 제품|제품을 골라/ });
  await expect(button).toBeDisabled();
  await line.getByRole("radio", { name: "가상진통정500밀리그램 · 가상제약(주)" }).check();
  const confirm = dlg.getByLabel("등록할 제품: 가상진통정500밀리그램");
  await expect(confirm.getByText("진통·해열제")).toBeVisible();
  await expect(confirm.getByText(/식약처 약효 분류 기준/)).toBeVisible();
  await expect(confirm.getByText(/성분 아세트아미노펜/)).toBeVisible();
  await expect(dlg.getByRole("checkbox", { name: /지금 먹고 있어요/ })).not.toBeChecked();
  await expect(button).toHaveText("확인한 제품 1개 등록");
  await button.click();
  await button.click({ force: true, timeout: 1000 }).catch(() => {}); // 연타해도 한 건
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText("일반약 1개를 등록했어요. 복용으로 처리하지 않았어요.")).toBeVisible();
}

test.describe("공개 데모 — 모바일", () => {
  test("첫 화면: 핵심 문구·두 버튼, 병동 기능 없음, 나·함께 보는 사람 역할", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await expect(page.getByText("가상 데이터 데모", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "데모 역할" }).getByRole("tab")).toHaveText(["나", "함께 보는 사람"]);
    await expect(page.getByRole("heading", { name: /그때 먹었던 약,\s*나한테 어땠더라\?/ })).toBeVisible();
    await expect(page.getByText("약 이름은 잊어도, 내 몸의 경험은 잊지 않도록.")).toBeVisible();
    await expect(page.getByRole("button", { name: "약 등록하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "내가 먹었던 약 찾기" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "메뉴" }).getByRole("button")).toHaveText(["홈", "나의 약 기록", "내 몸의 반응", "함께 보기", "진료 준비"]);
    for (const hidden of ["통원 중", "입원 중", "생활 요청", "오늘 식사"]) await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    console.expectNone();
  });

  test("데모 A·B: 일반약 상자 등록 → 같은 제품 묶기 → 메모 자동 태그 제안 → 확인 후 저장 (원본 메모 보존) → 새로고침 유지", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await registerExampleBox(page);

    // 등록한 기록 상세: 일반약 · 복용 중 아님
    await expect(detail(page).getByRole("heading", { name: /등록$/ })).toBeVisible();
    const product = detail(page).getByLabel("제품: 가상진통정500밀리그램");
    await expect(product.getByRole("switch", { name: "지금 복용 중" })).toHaveAttribute("aria-checked", "false");

    // 데모 B: 자유 메모 → '속쓰림' 제안 → 담기 → 좋은 점도 함께 → 저장
    const editor = detail(page).getByLabel("복용 경험 남기기");
    const memo = "지난번에 먹었을 때 속이 쓰렸어.";
    await editor.getByLabel("느낀 점 (자유롭게)").fill(memo);
    const suggest = editor.getByLabel("자동 정리 제안");
    await expect(suggest.getByText("속쓰림")).toBeVisible();
    await expect(suggest.getByText(/외부 AI 사용 안 함/)).toBeVisible();
    await suggest.getByRole("button", { name: "제안 태그 담기" }).click();
    await expect(editor.getByRole("group", { name: "복용 후 느낀 불편함" }).getByRole("button", { name: "속쓰림" })).toHaveAttribute("aria-pressed", "true");
    await editor.getByRole("group", { name: "도움이 된 점" }).getByRole("button", { name: "복용하기 편했어요" }).click();
    await expect(editor.getByLabel("자동 정리한 요약")).toHaveValue(/속쓰림을 경험했다고 기록함\. 약과의 관련성은 확인되지 않음\./);
    await editor.getByRole("button", { name: "복용 경험 저장" }).click();
    const card = detail(page).getByRole("list", { name: "복용 경험 목록" }).getByLabel("복용 경험: 가상진통정500밀리그램");
    await expect(card.getByText(memo, { exact: true })).toBeVisible(); // 원본 그대로
    await expect(card.getByText("내가 쓴 메모 (원본)")).toBeVisible();
    await expect(card.getByText(/자동 정리 \(규칙 기반\)/)).toBeVisible();
    await expect(card.getByText("속쓰림", { exact: true })).toBeVisible();
    await expect(card.getByText("복용하기 편했어요", { exact: true })).toBeVisible();

    // 자동 분류할 수 없는 메모 → 지어내지 않고 직접 고르도록 안내
    await editor.getByLabel("느낀 점 (자유롭게)").fill("그냥 그랬다");
    await expect(editor.getByText("메모에서 고를 만한 태그를 찾지 못했어요. 아래에서 직접 골라 주세요.")).toBeVisible();
    await editor.getByLabel("느낀 점 (자유롭게)").fill("");

    // 같은 제품(품목기준코드)만 묶임: 이번 등록 + 이전 두 번 = 3번, 날짜별 경험 누적
    await product.getByRole("button", { name: /이 약의 경험 모아 보기/ }).click();
    const item = page.getByLabel("약 상세");
    await expect(item.getByRole("heading", { name: "이 제품을 등록한 날 (3번)" })).toBeVisible();
    await expect(item.getByText("품목기준코드 900000101")).toBeVisible();
    const timeline = item.getByRole("list", { name: "복용 경험 타임라인" }).getByRole("listitem");
    await expect(timeline).toHaveCount(3);
    await expect(timeline.first()).toContainText("속쓰림");

    // 새로고침 후에도 유지
    await page.reload({ waitUntil: "networkidle" });
    await menu(page, "나의 약 기록").click();
    await page.getByLabel("제품명·성분으로 찾기").fill("가상진통정");
    await expect(page.getByRole("region", { name: "찾은 약" }).getByRole("button", { name: /^가상진통정500밀리그램 · / })).toHaveCount(3);
    console.expectNone();
  });

  test("데모 C: 진통·해열제 → 과거 약 → 복용 경험, 조건 함께 걸기(약 종류 + 태그 / 진료과 + ★ + 태그)", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await page.getByRole("region", { name: "빠르게 다시 찾기" }).getByRole("button", { name: "진통·해열제" }).click();
    const found = page.getByRole("region", { name: "찾은 약" });
    await expect(found.getByRole("heading", { name: "찾은 약 · 4개" })).toBeVisible();
    await expect(found.getByRole("button", { name: /^가상이부펜정200밀리그램 · / })).toBeVisible();
    await expect(found.getByRole("button", { name: /^가상소염진통정 · / })).toBeVisible();
    await expect(found.getByRole("button", { name: /^가상혈압정/ })).toHaveCount(0);
    await found.getByRole("button", { name: /^가상이부펜정200밀리그램 · / }).click();
    const item = page.getByLabel("약 상세");
    await expect(item.getByText("속쓰림").first()).toBeVisible();
    await expect(item.getByText(/약 때문인지는 모르겠어요/)).toBeVisible();
    await expect(item.getByText("식약처 약효 분류 기준")).toBeVisible();
    await item.getByRole("button", { name: "목록으로" }).click();

    // 약 종류(진통·해열제) + 경험 태그(속쓰림) 함께 → 이부펜정만
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "속쓰림" }).click();
    await expect(found.getByRole("heading", { name: "찾은 약 · 1개" })).toBeVisible();
    await expect(found.getByRole("button", { name: /^가상이부펜정200밀리그램 · / })).toBeVisible();

    // 처방·등록별로: 진료과 + ★ + 태그
    await page.getByRole("button", { name: "조건 지우기" }).click();
    await page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "처방·등록별로" }).click();
    await page.getByRole("group", { name: "진료과" }).getByRole("button", { name: "이비인후과" }).click();
    await page.getByRole("switch", { name: "★ 보관한 약·기록만" }).click();
    await page.getByRole("group", { name: "복용 경험 태그" }).getByRole("button", { name: "속쓰림" }).click();
    const list = page.getByRole("region", { name: "날짜별 기록" });
    await expect(list.getByRole("button", { name: /처방 · 이비인후과 · 약 3개$/ })).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    console.expectNone();
  });

  test("데모 D: 과거 처방 → 복용 경험 → 질문 담기 → 진료 때 보여주기 · 진료용 요약(인쇄)", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await page.getByRole("button", { name: "내가 먹었던 약 찾기" }).click();
    await page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "처방·등록별로" }).click();
    await page.getByRole("region", { name: "날짜별 기록" }).getByRole("button", { name: /처방 · 이비인후과 · 약 3개$/ }).click();
    const d = detail(page);
    const whole = d.getByRole("list", { name: "복용 경험 목록" }).getByLabel("복용 경험: 처방 전체");
    await whole.getByRole("button", { name: "다음 진료 질문에 담기" }).click();
    await expect(d.getByText(/다음 진료 질문에 담았어요/)).toBeVisible();
    await d.getByRole("button", { name: "진료 때 보여주기" }).first().click();
    const show = page.getByRole("dialog", { name: "진료 때 보여주기" });
    await expect(show.getByText(/처방받은 약들을 복용한 날\(.+\) 속쓰림을 경험했다고 기록함\./)).toBeVisible();
    await expect(show.getByText(/원인 약물은 확인되지 않음/).first()).toBeVisible();
    await expect(show.getByText(/출처: 환자가 직접 남긴 경험/)).toBeVisible();
    await expect(show.getByText(/병원 시스템으로 전송되지 않아요/)).toBeVisible();
    await expect(show.getByText(/원인 미확인 — .*괜찮을까요\?/)).toBeVisible(); // 담은 질문
    await show.getByRole("button", { name: "닫기" }).click();

    await menu(page, "진료 준비").click();
    await expect(page.getByRole("region", { name: "현재 복용 중이라고 기록한 약" }).getByText("가상혈압정5밀리그램")).toBeVisible();
    await page.getByRole("button", { name: "진료용 요약 · 인쇄" }).click();
    const sum = page.getByRole("dialog", { name: "진료용 요약" });
    await expect(sum.getByText("기억해 둔 불편 경험")).toBeVisible();
    await expect(sum.getByText(/가상이부펜정200밀리그램을 복용한 날\(.+\) 속쓰림을 경험했다고 기록함\. 약과의 관련성은 확인되지 않음\./)).toBeVisible();
    await expect(sum.getByRole("button", { name: "인쇄 또는 PDF로 저장" })).toBeVisible();
    console.expectNone();
  });

  test("데모 E: 일반약 기록 하나만 · 허용 항목만 공유 → 상대 화면 확인 → 공유 멈추기 → 연결 끊기", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    // 공유 전: 상대에게 아무 기록도 없음 (기본 비공개)
    await switchRole(page, "함께 보는 사람");
    await expect(page.getByText("공유받은 약 기록이 없어요.")).toBeVisible();
    await switchRole(page, "나");

    await menu(page, "함께 보기").click();
    await page.getByLabel("공유할 기록").selectOption("OTC-DEMO-2");
    const fields = page.getByRole("group", { name: "보여 줄 항목" });
    await expect(fields.getByRole("button", { name: "복용 경험 (태그·메모)" })).toHaveAttribute("aria-pressed", "true");
    await expect(fields.getByRole("button", { name: "진료과·병원 (처방)" })).toHaveCount(0); // 일반약에는 없음
    const preview = page.getByLabel("상대에게 보이는 내용 미리 보기");
    await expect(preview.getByText("가상이부펜정200밀리그램", { exact: true })).toBeVisible();
    await expect(preview.getByText(/성분 /)).toHaveCount(0);
    await page.getByRole("button", { name: "이 기록 공유하기" }).click();
    await expect(page.getByText(/공유했어요/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "공유 중인 기록 · 1건" })).toBeVisible();

    await switchRole(page, "함께 보는 사람");
    const shared = page.getByRole("region", { name: "공유받은 약 기록" });
    await expect(shared.getByRole("article")).toHaveCount(1);
    await expect(shared.getByRole("article", { name: "공유받은 기록: 가상이부펜정200밀리그램" })).toBeVisible();
    await expect(shared.getByText("속쓰림")).toBeVisible();
    await expect(shared.getByText(/이부프로펜/)).toHaveCount(0); // 성분은 허용 안 함
    await expect(shared.getByText(/가상진통정|가상혈압정|이비인후과/)).toHaveCount(0); // 고르지 않은 기록
    await expect(shared.getByRole("button")).toHaveCount(0); // 읽기 전용

    // 공유 멈추기 → 즉시 안 보임
    await switchRole(page, "나");
    await page.getByRole("button", { name: "이 공유 멈추기" }).click();
    await expect(page.getByRole("heading", { name: "공유 중인 기록 · 0건" })).toBeVisible();
    await switchRole(page, "함께 보는 사람");
    await expect(page.getByText("공유받은 약 기록이 없어요.")).toBeVisible();

    // 다시 공유한 뒤 연결 자체를 끊으면 모든 공유가 멈춤
    await switchRole(page, "나");
    await page.getByLabel("공유할 기록").selectOption("OTC-DEMO-1");
    await page.getByRole("button", { name: "이 기록 공유하기" }).click();
    await expect(page.getByRole("heading", { name: "공유 중인 기록 · 1건" })).toBeVisible();
    await page.getByText("사람 초대 · 연결 관리").click();
    await page.getByRole("button", { name: "공유 철회" }).click();
    await page.getByRole("button", { name: "공유 멈추기", exact: true }).click();
    await switchRole(page, "함께 보는 사람");
    await expect(page.getByText("공유받은 약 기록이 없어요.").or(page.getByText("공유받은 정보가 없어요."))).toBeVisible();
    await expect(page.getByRole("article", { name: /공유받은 기록/ })).toHaveCount(0);
    console.expectNone();
  });

  test("처방전 등록 후 이전 처방 보존 · 일반약 등록은 복용 체크에 안 들어감 · 오늘 복용 체크", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await openRegister(page, /^처방전 촬영·업로드/);
    const dlg = dialog(page);
    await dlg.getByRole("button", { name: "예제 처방전 읽기" }).click();
    await expect(dlg.getByText(/예제 처방전\(가상\)을 읽었어요/)).toBeVisible();
    await expect(dlg.getByText("출처: 처방전·복약 안내에 기재된 정보")).toBeVisible();
    const rows = dlg.getByRole("list", { name: "처방전에서 읽은 약" });
    await rows.getByRole("listitem").nth(1).getByRole("radio", { name: "케어가상캡슐10밀리그램 · 다른가상약품" }).check();
    await rows.getByRole("listitem").nth(3).getByRole("radio", { name: "후보 사용 안 함 · 직접 입력" }).check();
    await dlg.getByRole("button", { name: "선택한 약 5개 한 번에 등록" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/처방 1건 · 약 5개를 등록했어요/)).toBeVisible();
    await expect(detail(page).getByRole("heading", { name: "2026년 11월 20일 처방" })).toBeVisible();
    await expect(detail(page).getByText("미분류 · 확인 필요").first()).toBeVisible(); // 제품을 고르지 않은 약은 지어내지 않음

    // 이전 처방(이비인후과)도 그대로 열림
    await page.getByRole("button", { name: "목록으로" }).click();
    await page.getByRole("region", { name: "날짜별 기록" }).getByRole("button", { name: /처방 · 이비인후과 · 약 3개$/ }).click();
    await expect(detail(page).getByText("(가상) 아침까지 졸렸어요.")).toBeVisible();

    // 오늘 복용 체크: 정기 약만 시간대 칸, 일반약 등록은 없음
    await menu(page, "홈").click();
    const check = page.getByLabel("오늘 복용 체크");
    await expect(check.getByText(/안 먹었다는 뜻이 아니에요/)).toBeVisible();
    await expect(check.getByText("가상진통정500밀리그램")).toHaveCount(0);
    const bp = check.getByLabel("복용 체크: 가상혈압정5밀리그램");
    await bp.getByRole("button", { name: "아침 · 기록 없음" }).click();
    await expect(bp.getByRole("button", { name: "아침 · 복용했어요" })).toHaveAttribute("aria-pressed", "true");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("복용 체크: 가상혈압정5밀리그램").getByRole("button", { name: "아침 · 복용했어요" })).toBeVisible();
    console.expectNone();
  });

  test("지금 복용 중인 약이 없어도 홈·찾기·경험이 동작, 초기화하면 처음 상태", async ({ page }) => {
    await openApp(page);
    // 예전 방식으로 적어 둔 약을 화면에서 삭제
    await menu(page, "나의 약 기록").click();
    await page.getByText(/예전 방식으로 적어 둔 약/).click();
    const legacy = page.getByRole("list", { name: "약 목록" });
    while ((await legacy.getByRole("button", { name: / 삭제$/ }).count()) > 0) {
      await legacy.getByRole("button", { name: / 삭제$/ }).first().click();
      await legacy.getByRole("button", { name: "삭제", exact: true }).click();
    }
    // ★ 한 번으로 약 기록을 브라우저에 저장한 뒤, '복용 중'을 모두 끔 (가상 데이터, 이 브라우저만)
    await page.getByRole("region", { name: "찾은 약" }).getByRole("button", { name: / 보관$/ }).first().click();
    await page.evaluate((key) => {
      const d = JSON.parse(localStorage.getItem(key) ?? "null");
      d.items = d.items.map((i: { active: boolean }) => ({ ...i, active: false }));
      localStorage.setItem(key, JSON.stringify(d));
    }, RX_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/지금 먹는 약이 없어도 괜찮아요/)).toBeVisible();
    await expect(page.getByLabel("오늘 복용 체크")).toHaveCount(0);
    await page.getByRole("button", { name: "내가 먹었던 약 찾기" }).click();
    await page.getByRole("group", { name: "복용 상태" }).getByRole("button", { name: "과거 복용 기록" }).click();
    await expect(page.getByRole("region", { name: "찾은 약" }).getByRole("heading", { name: /찾은 약 · \d+개/ })).toBeVisible();
    await menu(page, "내 몸의 반응").click();
    await expect(page.getByRole("region", { name: "같은 약을 여러 번 기록" }).getByLabel("가상진통정500밀리그램 날짜별 경험")).toBeVisible();

    await page.getByRole("button", { name: "초기화" }).click();
    await page.getByRole("button", { name: "처음 상태로 되돌리기" }).click();
    await expect(page.getByText(/지금 먹는 약이 없어도 괜찮아요/)).toHaveCount(0);
  });
});

test.describe("공개 데모 — PC", () => {
  test("[PC] 홈 두 버튼, 나의 약 기록: 왼쪽 목록 + 오른쪽 상세, 가로 넘침 없음", async ({ page }) => {
    const console = trackConsoleErrors(page);
    await openApp(page);
    await expect(page.getByRole("button", { name: "약 등록하기" }).first()).toBeVisible();
    await menu(page, "나의 약 기록").click();
    await page.getByRole("group", { name: "보는 방법" }).getByRole("button", { name: "처방·등록별로" }).click();
    const list = page.getByRole("region", { name: "날짜별 기록" });
    await expect(list).toBeVisible();
    await expect(detail(page)).toBeVisible(); // 고르기 전에도 첫 기록을 오른쪽에
    await list.getByRole("button", { name: /처방 · 이비인후과 · 약 3개$/ }).click();
    await expect(list).toBeVisible(); // PC에서는 목록이 계속 보임
    await expect(detail(page).getByRole("heading", { name: /처방$/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await menu(page, "함께 보기").click();
    await expectNoHorizontalOverflow(page);
    console.expectNone();
  });
});
