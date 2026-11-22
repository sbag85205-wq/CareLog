/**
 * carelog-dev 역할별 실제 연동 검증 (브라우저 + Supabase Auth + 실제 RLS)
 *
 * 가상 환자 A·B, 간호사 S1(A 담당)·S2(B만 담당), 보호자 G1(A가 초대)·G2(초대 없음)·G3(A가 초대 후 철회)
 * 흐름: 통원 기록 → 내 약·진료 질문 → 보호자 초대 → 입원 전환 → 식사·생활 요청
 *      → 보호자 수락·확인 → 담당 간호사 검토·요청 처리 → 환자·보호자 상태 확인 → 재로그인 후 유지
 * 차단: 미배정 간호사·초대 없는 보호자·철회된 보호자 (각자의 세션으로 조회)
 * 모든 계정은 테스트가 끝나면 삭제
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, todayISO } from "../src/lib/date";
import {
  assignStaff,
  cleanup,
  expectNoHorizontalOverflow,
  fillCondition,
  memberLoginForm,
  menu,
  patientLogin,
  provisionMember,
  provisionPatient,
  shot,
  userSession,
  type VMember,
  type VPatient,
} from "./support";

let A: VPatient, B: VPatient;
let S1: VMember, S2: VMember, G1: VMember, G2: VMember, G3: VMember;
let linkG1 = "";
let linkG3 = "";
const MED_PUBLIC = "(가상) 공개약 10mg";
const MED_PRIVATE = "(가상) 비공개약 5mg";
const QUESTION = "(가상) 산책해도 되나요?";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  A = await provisionPatient("역할A");
  B = await provisionPatient("역할B");
  S1 = await provisionMember("간호사1", "staff");
  S2 = await provisionMember("간호사2", "staff");
  G1 = await provisionMember("보호자1", "guardian");
  G2 = await provisionMember("보호자2", "guardian");
  G3 = await provisionMember("보호자3", "guardian");
  await assignStaff(S1, A);
  await assignStaff(S2, B);
});

test.afterAll(async () => {
  await cleanup();
});

async function newPage(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  return ctx.newPage();
}

test("1. 환자 A: 통원 기록 → 내 약 → 진료 준비 → 보호자 초대 → 입원 전환 → 식사·생활 요청", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, A);

  // 통원: 오늘의 컨디션
  await fillCondition(page, 4);
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByText("저장되었습니다")).toBeVisible();

  // 내 약: 추가(공개·비공개) → 수정
  await menu(page, "내 약").click();
  for (const [name, pub] of [
    [MED_PUBLIC, true],
    [MED_PRIVATE, false],
  ] as const) {
    await page.getByRole("button", { name: "약 추가" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("약 이름").fill(name);
    await dlg.getByLabel("1회 복용량 (안내받은 대로)").fill("1회 1정");
    await dlg.getByLabel("복용 시간").fill("아침 식후");
    await dlg.getByRole("textbox", { name: "메모" }).fill("(가상) 물과 함께");
    if (pub) await dlg.getByRole("switch", { name: "보호자에게 공개" }).click();
    await dlg.getByRole("button", { name: "약 추가" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  const priv = page.getByRole("region", { name: MED_PRIVATE });
  await priv.getByRole("button", { name: "수정" }).click();
  await page.getByRole("dialog").getByLabel("복용 시간").fill("저녁 식후");
  await page.getByRole("dialog").getByRole("button", { name: "수정 저장" }).click();
  await expect(priv.getByText("1회 1정 · 저녁 식후")).toBeVisible();
  await shot(page, "m-patient-meds");
  await expectNoHorizontalOverflow(page);

  // 진료 준비: 다음 진료일 + 질문(의료진과 공유)
  await menu(page, "진료 준비").click();
  await page.getByRole("button", { name: "진료일 입력" }).click();
  await page.getByLabel("다음 진료일").fill(addDays(todayISO(), 14));
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("14일 남았어요")).toBeVisible();
  await page.getByLabel("새 질문").fill(QUESTION);
  await page.getByRole("button", { name: "질문 추가" }).click();
  const q = page.getByRole("list", { name: "진료 질문 목록" }).getByRole("listitem").filter({ hasText: QUESTION });
  await q.getByRole("switch", { name: "의료진과 공유" }).click();
  await expect(q.getByRole("switch", { name: "의료진과 공유" })).toHaveAttribute("aria-checked", "true");
  await shot(page, "m-patient-visit");
  await expectNoHorizontalOverflow(page);

  // 보호자 공유: G1(건강기록·약 정보·생활 요청), G3(건강기록)
  await menu(page, "보호자 공유").click();
  for (const [g, extra] of [
    [G1, ["약 정보", "생활 요청"]],
    [G3, []],
  ] as const) {
    await page.getByLabel("보호자 이메일").fill(g.email);
    for (const s of extra) await page.getByRole("group", { name: "공유할 항목" }).getByRole("button", { name: s }).click();
    await page.getByRole("button", { name: "초대 링크 만들기" }).click();
    await expect(page.getByText(`${g.email} 님에게 보낼 초대 링크`)).toBeVisible();
    const link = (await page.getByTestId("invite-link").textContent())!.trim();
    expect(link).toMatch(/\/invite#t=[0-9a-f]{64}$/);
    if (g === G1) linkG1 = link;
    else linkG3 = link;
    for (const s of extra) await page.getByRole("group", { name: "공유할 항목" }).getByRole("button", { name: s }).click(); // 다음 초대를 위해 원래대로
  }
  await expect(page.getByText(G1.email)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // 입원 전환 (자기기록) → 오늘 기록은 요약 카드로, 통원 기록은 그대로 이어짐
  await menu(page, "홈").click();
  await page.getByRole("group", { name: "이용 모드" }).getByRole("button", { name: "입원" }).click();
  const sheet = page.getByRole("dialog", { name: "입원 모드로 바꾸기" });
  await sheet.getByLabel("병동 (선택)").fill("가상 병동");
  await sheet.getByLabel("병실 (선택)").fill("302");
  await sheet.getByRole("button", { name: "입원으로 바꾸기" }).click();
  await expect(page.getByText("입원 중", { exact: true })).toBeVisible();
  await expect(page.getByText(/302호 · 자기기록/)).toBeVisible();
  await expect(page.getByText("통원 때의 기록도 그대로 이어져요.")).toBeVisible();

  // 오늘의 식사: 점심 섭취량·소화, 저녁 식사 형태 변경 요청
  const lunch = page.getByRole("region", { name: "점심 식사" });
  await lunch.getByRole("group", { name: "점심 섭취량" }).getByRole("button", { name: "대부분" }).click();
  await lunch.getByRole("group", { name: "점심 소화" }).getByRole("button", { name: "좋음" }).click();
  await expect(lunch.getByRole("group", { name: "점심 섭취량" }).getByRole("button", { name: "대부분" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("region", { name: "저녁 식사" }).getByRole("button", { name: "식사 형태 변경 요청" }).click();
  await page.getByRole("dialog").getByRole("group", { name: "바꿀 식사 형태" }).getByRole("button", { name: "죽" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "변경 요청 보내기" }).click();
  await expect(page.getByRole("region", { name: "저녁 식사" }).getByText("변경 요청 중")).toBeVisible();

  // 생활 요청: 물
  await page.getByRole("button", { name: "물", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "요청 보내기" }).click();
  await expect(page.getByRole("region", { name: "물 요청 접수" })).toBeVisible();
  await expect(page.getByRole("region", { name: "식사 변경 접수" })).toBeVisible();
  await shot(page, "m-patient-inpatient-home");
  await expectNoHorizontalOverflow(page);

  // 기록 보기: 입원 이력 + 기록 당시 모드
  await menu(page, "기록 보기").click();
  await expect(page.getByRole("heading", { name: "입원 이력" })).toBeVisible();
  await expect(page.getByText("가상 병동 · 302호 · 자기기록")).toBeVisible();
  await shot(page, "m-patient-records");
  await expect(page.getByText(/^통원 기록 · /)).toBeVisible(); // 오늘 기록은 통원 중에 작성

  // DB(본인 세션): 같은 사람의 기록 1건, recorded_in 유지, 입원 이력 1건
  const sa = await userSession(A.email, A.password);
  const { data: recs } = await sa.from("health_records").select("recorded_in").eq("patient_id", A.pid);
  expect(recs).toEqual([{ recorded_in: "outpatient" }]);
  const { data: adm } = await sa.from("admissions").select("ward, room, discharged_on, source").eq("patient_id", A.pid);
  expect(adm).toEqual([{ ward: "가상 병동", room: "302", discharged_on: null, source: "self_reported" }]);
  await page.context().close();
});

test("2. 보호자 G1·G3: 자기 계정으로 초대 수락 → G1은 최근 안부·생활 요청·공개 약만", async ({ browser }) => {
  for (const [g, link] of [
    [G1, linkG1],
    [G3, linkG3],
  ] as const) {
    const page = await newPage(browser);
    await page.goto(link, { waitUntil: "networkidle" });
    await expect(page.getByText("초대받은 이메일의 보호자 계정으로 로그인해 주세요.")).toBeVisible();
    await memberLoginForm(page, g);
    await page.getByRole("button", { name: "초대 수락하기" }).click();
    await expect(page).toHaveURL(/\/guardian$/);
    await expect(page.getByRole("heading", { name: `${A.name} 님의 안부` })).toBeVisible();
    if (g === G1) {
      // 그래프보다 먼저 최근 안부와 기록 시각
      await expect(page.getByRole("heading", { name: /^오늘 오[전후] \d{1,2}:\d{2}에 남긴 안부$/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "최근 안부" }).getByText("좋아요")).toBeVisible();
      await expect(page.getByRole("region", { name: "물 요청 접수" })).toBeVisible();
      await expect(page.getByRole("region", { name: MED_PUBLIC })).toBeVisible();
      await expect(page.getByText(MED_PRIVATE)).toHaveCount(0);
      await expect(page.getByText("오늘의 식사")).toHaveCount(0); // 식사는 공유하지 않음
      await shot(page, "m-guardian-home");
      await expectNoHorizontalOverflow(page);
    }
    await page.context().close();
  }
});

test("3. 담당 간호사 S1: 담당 환자·공유 질문·검토 저장, 생활 요청 처리(식사 형태 반영)", async ({ browser }) => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await page.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(page, S1);
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("button", { name: `${B.name} 상세 보기` })).toHaveCount(0); // 비담당 환자 없음
  await shot(page, "pc-staff-list");
  await page.getByRole("button", { name: `${A.name} 상세 보기` }).click();
  await expect(page.getByText(QUESTION)).toBeVisible();
  await expect(page.getByRole("region", { name: MED_PRIVATE })).toBeVisible(); // 의료진은 비공개 약도 확인
  await page.getByLabel("내부 메모 (선택)").fill("(가상) 내부 검토 메모");
  await page.getByRole("button", { name: "확인 완료" }).click();
  await expect(page.getByText("'확인 완료'(으)로 저장했어요.")).toBeVisible();
  await expect(page.getByText("내부 메모: (가상) 내부 검토 메모")).toBeVisible();
  await shot(page, "pc-staff-detail");
  await expectNoHorizontalOverflow(page);

  await menu(page, "생활 요청").click();
  await shot(page, "pc-staff-requests");
  for (const cat of ["물 요청", "식사 변경"]) {
    await page.getByRole("region", { name: `${cat} 접수` }).getByRole("button", { name: "직원 확인" }).click();
    await page.getByRole("region", { name: `${cat} 직원 확인` }).getByRole("button", { name: "처리 완료" }).click();
    await expect(page.getByRole("region", { name: new RegExp(`^${cat} `) })).toHaveCount(0); // 진행 중 목록에서 빠짐
  }
  await page.getByRole("group", { name: "요청 상태" }).getByRole("button", { name: "처리 완료" }).click();
  await expect(page.getByRole("region", { name: "물 요청 처리 완료" })).toBeVisible();

  // 식사 변경 완료 → 저녁 식사 형태 죽 (환자 본인 세션으로 확인)
  const sa = await userSession(A.email, A.password);
  const { data: meals } = await sa.from("meal_logs").select("slot, meal_type").eq("patient_id", A.pid).eq("meal_date", todayISO()).eq("slot", "dinner");
  expect(meals).toEqual([{ slot: "dinner", meal_type: "porridge" }]);
  await page.context().close();
});

test("4. 환자 A 재로그인: 처리 완료·식사 형태·약·질문 유지, 검토 메모는 안 보임 → G3 공유 철회", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, A);
  await expect(page.getByRole("region", { name: "물 요청 처리 완료" })).toBeVisible();
  await expect(page.getByRole("region", { name: "저녁 식사" }).getByText("죽", { exact: true })).toBeVisible();
  await expect(page.getByText("(가상) 내부 검토 메모")).toHaveCount(0);
  await menu(page, "내 약").click();
  await expect(page.getByRole("region", { name: MED_PUBLIC })).toBeVisible();
  await expect(page.getByRole("region", { name: MED_PRIVATE }).getByText("1회 1정 · 저녁 식후")).toBeVisible();
  await menu(page, "진료 준비").click();
  await expect(page.getByText(QUESTION)).toBeVisible();

  await menu(page, "보호자 공유").click();
  const g3 = page.getByRole("region", { name: `${G3.email} 공유 설정` });
  await g3.getByRole("button", { name: "공유 철회" }).click();
  await g3.getByRole("button", { name: "공유 멈추기" }).click();
  await expect(page.getByText(new RegExp(`${G3.email.replace(/[.]/g, "\\.")} · .* 철회`))).toBeVisible();
  await shot(page, "m-patient-share-after-revoke");

  const sa = await userSession(A.email, A.password);
  expect((await sa.from("staff_reviews").select("action").eq("patient_id", A.pid)).data).toEqual([{ action: "checked" }]);
  expect((await sa.from("staff_review_notes").select("note")).data).toEqual([]); // 내부 메모 비공개
  await page.context().close();
});

test("5. 보호자 G1: 처리 완료 상태 확인 / G3: 철회 후 같은 주소로 들어와도 데이터 없음", async ({ browser }) => {
  const p1 = await newPage(browser);
  await p1.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(p1, G1);
  await expect(p1).toHaveURL(/\/guardian$/);
  await expect(p1.getByRole("region", { name: "물 요청 처리 완료" })).toBeVisible();
  await p1.context().close();

  const p3 = await newPage(browser);
  await p3.goto("/login/member", { waitUntil: "networkidle" });
  await memberLoginForm(p3, G3);
  await expect(p3).toHaveURL(/\/guardian$/);
  await expect(p3.getByText("공유받은 정보가 없어요.")).toBeVisible();
  await p3.goto("/guardian", { waitUntil: "networkidle" });
  await expect(p3.getByText("공유받은 정보가 없어요.")).toBeVisible();
  await expect(p3.getByText(A.name)).toHaveCount(0);
  // 다른 역할 화면 주소로 들어와도 자기 화면으로 (권한이 생기지 않음)
  await p3.goto("/staff", { waitUntil: "networkidle" });
  await expect(p3).toHaveURL(/\/guardian$/);
  await p3.context().close();
});

test("6. 차단: 미배정 간호사·초대 없는 보호자·철회된 보호자·다른 환자 (각자의 세션)", async () => {
  const s2 = await userSession(S2.email, S2.password);
  for (const t of ["patients", "health_records", "life_requests", "medications", "meal_logs", "visit_questions", "admissions"]) {
    const col = t === "patients" ? "id" : "patient_id";
    const { data, error } = await s2.from(t).select("*").eq(col, A.pid);
    expect(error, t).toBeNull();
    expect(data, `S2 ${t}`).toEqual([]);
  }
  const { data: reqA } = await (await userSession(A.email, A.password)).from("life_requests").select("id, status").eq("patient_id", A.pid).limit(1);
  const adv = await s2.rpc("advance_request_status", { p_request_id: reqA![0].id, p_expected: "completed", p_to: "completed" });
  expect(adv.error?.message ?? "").toMatch(/not_found/);
  const rev = await s2.rpc("add_staff_review", { p_patient_id: A.pid, p_action: "checked", p_note: "" });
  expect(rev.error?.message ?? "").toMatch(/forbidden/);

  for (const g of [G2, G3]) {
    const s = await userSession(g.email, g.password);
    for (const t of ["patients", "health_records", "life_requests", "medications", "admissions"]) {
      const { data } = await s.from(t).select("*");
      expect(data, `${g.label} ${t}`).toEqual([]);
    }
  }

  const g1 = await userSession(G1.email, G1.password);
  expect((await g1.from("medications").select("name")).data).toEqual([{ name: MED_PUBLIC }]); // 공개 허용한 약만
  expect((await g1.from("meal_logs").select("id")).data).toEqual([]); // 식사는 미공유
  expect((await g1.from("visit_questions").select("id")).data).toEqual([]);
  expect((await g1.from("staff_reviews").select("id")).data).toEqual([]);
  expect((await g1.from("staff_review_notes").select("note")).data).toEqual([]);
  expect((await g1.from("health_records").select("patient_id")).data).toEqual([{ patient_id: A.pid }]);
  const write = await g1.from("life_requests").insert({ patient_id: A.pid, category: "water", detail: "x" });
  expect(write.error?.message ?? "").toMatch(/row-level security/);

  const { data: s1rows } = await (await userSession(S1.email, S1.password)).from("patients").select("id");
  expect(s1rows?.map((r) => r.id)).toEqual([A.pid]); // S1은 담당 A만
});

test("7. 환자 B: 아이디 로그인 후 자기 기록만, A·간호사1 화면 정보와 분리", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, B);
  await expect(page.getByText(A.name)).toHaveCount(0);
  await menu(page, "내 약").click();
  await expect(page.getByText("아직 등록한 약이 없어요.", { exact: false })).toBeVisible();
  const sb = await userSession(B.email, B.password);
  for (const t of ["health_records", "medications", "life_requests", "visit_questions", "access_grants"]) {
    const { data } = await sb.from(t).select("*").eq("patient_id", A.pid);
    expect(data, `B ${t}`).toEqual([]);
  }
  await page.context().close();
});
