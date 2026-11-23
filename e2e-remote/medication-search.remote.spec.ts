/**
 * 내 약 → 약 추가 — 식약처 의약품 검색 (carelog-dev 실제 저장·RLS + 검색 응답 시나리오)
 *
 * - 검색 성공·결과 없음: 서버 검색 API 응답을 브라우저에서 모의 (공식 응답 필드를 변환한 형식)
 * - API 사용 불가: 로컬에는 MFDS_SERVICE_KEY 가 없어 실제 서버 경로가 "사용할 수 없음"을 돌려줌 → 직접 입력 저장
 * - 저장·보호자 공유는 실제 carelog-dev (환자·보호자 각자의 세션)
 * - 검색어는 요청 본문으로만 보내고 주소에는 남기지 않는지 확인
 */
import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import { cleanup, patientLogin, provisionMember, provisionPatient, userSession, menu, type VMember, type VPatient } from "./support";

let P: VPatient;
let G: VMember;

const ITEMS = [
  {
    itemSeq: "200000001", name: "가상정10밀리그램", company: "가상제약(주)", ingredient: "가상성분A", category: "전문의약품",
    productType: "가상 분류", permitDate: "20200101", canceled: false,
  },
  {
    itemSeq: "200000002", name: "가상정10밀리그램", company: "다른가상약품", ingredient: "가상성분A", category: "일반의약품",
    productType: "가상 분류", permitDate: "20100505", canceled: false,
  },
];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  P = await provisionPatient("약검색");
  G = await provisionMember("약검색보호자", "guardian");
  const sp = await userSession(P.email, P.password);
  const inv = await sp.rpc("invite_guardian", { p_patient_id: P.pid, p_email: G.email, p_scopes: ["medications"] });
  if (inv.error) throw new Error(`초대 실패: ${inv.error.code}`);
  const sg = await userSession(G.email, G.password);
  const acc = await sg.rpc("accept_guardian_invitation", { p_token: (inv.data as { token: string }).token });
  if (acc.error) throw new Error(`수락 실패: ${acc.error.code}`);
});

test.afterAll(async () => cleanup());

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  return ctx.newPage();
}

async function openAdd(page: Page) {
  await menu(page, "내 약").click();
  await page.getByRole("button", { name: "약 직접 추가" }).click();
  return page.getByRole("dialog");
}

async function finishAndSave(page: Page, dosage: string, schedule: string, pub = false) {
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("1회 복용량 (안내받은 대로)").fill(dosage);
  await dlg.getByLabel("복용 시간").fill(schedule);
  if (pub) await dlg.getByRole("switch", { name: "보호자에게 공개" }).click();
  await dlg.getByRole("button", { name: "약 추가" }).click();
  await expect(dlg).toHaveCount(0);
}

const meds = async () =>
  (await (await userSession(P.email, P.password)).from("medications").select("name, dosage, schedule, source, external_item_seq, visible_to_guardian").eq("patient_id", P.pid).order("created_at")).data ?? [];

test("검색 성공: 비슷한 이름을 제조사·전문/일반·품목기준코드로 구분 → 선택하면 이름만 채움, 복용량·시간은 직접 입력 → 저장·보호자 공개", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P);
  const sent: { url: string; body: unknown }[] = [];
  await page.route("**/api/medications/search", (route: Route) => {
    sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true, items: ITEMS, total: 2 } });
  });
  const dlg = await openAdd(page);
  await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("가상정");
  await dlg.getByLabel("식약처 의약품 검색 (선택)").press("Enter"); // Enter는 검색 (약 저장 아님)
  const results = dlg.getByRole("list", { name: "식약처 검색 결과" });
  await expect(results.getByRole("article")).toHaveCount(2);
  await expect(results.getByRole("article", { name: "가상정10밀리그램 · 가상제약(주)" }).getByText("전문의약품")).toBeVisible();
  await expect(results.getByRole("article", { name: "가상정10밀리그램 · 다른가상약품" }).getByText("일반의약품")).toBeVisible();
  await expect(results.getByText("품목기준코드 200000002")).toBeVisible();
  // 검색어는 본문으로만 — 주소에 없음
  expect(sent).toHaveLength(1);
  expect(new URL(sent[0].url).search).toBe("");
  expect(sent[0].body).toEqual({ q: "가상정" });

  await results.getByRole("button", { name: "가상정10밀리그램 (다른가상약품) 선택" }).click();
  await expect(dlg.getByLabel("약 이름")).toHaveValue("가상정10밀리그램");
  await expect(dlg.getByText("선택한 제품: 가상정10밀리그램 · 다른가상약품 · 일반의약품")).toBeVisible();
  await expect(dlg.getByLabel("1회 복용량 (안내받은 대로)")).toHaveValue(""); // 복용량은 채우지 않음
  await finishAndSave(page, "1회 1정", "아침 식후", true);

  expect(await meds()).toEqual([
    { name: "가상정10밀리그램", dosage: "1회 1정", schedule: "아침 식후", source: "mfds_permit", external_item_seq: "200000002", visible_to_guardian: true },
  ]);
  await expect(page.getByText("식약처 허가정보에서 선택한 제품")).toBeVisible();
  // 보호자: 공개 허용한 약만 그대로 보임
  const sg = await userSession(G.email, G.password);
  expect((await sg.from("medications").select("name").eq("patient_id", P.pid)).data).toEqual([{ name: "가상정10밀리그램" }]);
  await page.context().close();
});

test("결과 없음 → 직접 입력해 저장 / 고른 뒤 이름을 직접 고치면 직접 입력으로 저장", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P);
  let mode: "none" | "items" = "none";
  await page.route("**/api/medications/search", (route) =>
    route.fulfill({ json: mode === "none" ? { ok: true, items: [], total: 0 } : { ok: true, items: ITEMS, total: 2 } }),
  );
  let dlg = await openAdd(page);
  await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("없는가상약");
  await dlg.getByRole("button", { name: "검색", exact: true }).click();
  await expect(dlg.getByText("‘없는가상약’ 검색 결과가 없어요.")).toBeVisible();
  await dlg.getByLabel("약 이름").fill("(가상) 병원에서 받은 약");
  await finishAndSave(page, "반 알", "저녁 식후");

  mode = "items";
  dlg = await openAdd(page);
  await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("가상정");
  await dlg.getByRole("button", { name: "검색", exact: true }).click();
  await dlg.getByRole("button", { name: "가상정10밀리그램 (가상제약(주)) 선택" }).click();
  await dlg.getByLabel("약 이름").fill("가상정10밀리그램 (반쪽)");
  await expect(dlg.getByText(/^선택한 제품:/)).toHaveCount(0);
  await finishAndSave(page, "반 정", "점심");

  const rows = await meds();
  expect(rows.slice(1)).toEqual([
    { name: "(가상) 병원에서 받은 약", dosage: "반 알", schedule: "저녁 식후", source: "manual", external_item_seq: null, visible_to_guardian: false },
    { name: "가상정10밀리그램 (반쪽)", dosage: "반 정", schedule: "점심", source: "manual", external_item_seq: null, visible_to_guardian: false },
  ]);
  // 보호자: 공개하지 않은 약은 보이지 않음 (기존 공유 규칙 유지)
  const sg = await userSession(G.email, G.password);
  expect((await sg.from("medications").select("name").eq("patient_id", P.pid)).data).toHaveLength(1);
  await page.context().close();
});

test("API 사용 불가(실제 서버 경로, 키 없음)·오류 응답 → 안내 후 직접 입력해 저장, 비로그인 검색 거부", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P);
  // 1) 실제 서버 경로 — 이 검증 서버에는 MFDS_SERVICE_KEY 가 없음
  let dlg = await openAdd(page);
  await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("가상정");
  await dlg.getByRole("button", { name: "검색", exact: true }).click();
  await expect(dlg.getByRole("alert").filter({ hasText: "직접 입력해 저장할 수 있어요" })).toBeVisible();
  await dlg.getByLabel("약 이름").fill("(가상) 키 없을 때 직접 입력");
  await finishAndSave(page, "1정", "자기 전");

  // 2) 외부 API 오류 응답 (서버가 돌려주는 형식)
  await page.route("**/api/medications/search", (route) =>
    route.fulfill({ status: 503, json: { ok: false, reason: "upstream", message: "식약처 검색이 잠시 응답하지 않아요. 약 이름을 직접 입력해 저장할 수 있어요." } }),
  );
  dlg = await openAdd(page);
  await dlg.getByLabel("식약처 의약품 검색 (선택)").fill("가상정");
  await dlg.getByRole("button", { name: "검색", exact: true }).click();
  await expect(dlg.getByRole("alert").filter({ hasText: "잠시 응답하지 않아요" })).toBeVisible();
  await dlg.getByLabel("약 이름").fill("(가상) 오류 때 직접 입력");
  await finishAndSave(page, "2정", "아침");
  expect((await meds()).map((m) => [m.name, m.source])).toEqual(
    expect.arrayContaining([
      ["(가상) 키 없을 때 직접 입력", "manual"],
      ["(가상) 오류 때 직접 입력", "manual"],
    ]),
  );
  await page.context().close();

  // 3) 로그인하지 않으면 검색 API 거부 (공공 API 사용량 보호)
  const anon = await newPage(browser);
  await anon.goto("/login");
  const r = await anon.request.post("/api/medications/search", { data: { q: "가상정" }, headers: { Origin: new URL(anon.url()).origin } });
  expect(r.status()).toBe(401);
  await anon.context().close();
});

