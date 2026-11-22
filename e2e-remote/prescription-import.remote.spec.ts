/**
 * 처방전 불러오기 → 약 일괄 등록 (carelog-dev 실제 저장·RLS, 환자 본인 세션)
 *
 * 가상 처방전 파일은 테스트 중에 만듦 (HTML 표 → 사진 PNG / 텍스트 PDF / 스캔 PDF(이미지만))
 * - 텍스트 PDF: PDF.js 글자 추출 / 사진·스캔 PDF: 브라우저 안 OCR(Tesseract, 한국어+영어)
 * - 식약처 검색: 서버 검색 API 응답을 가상 카탈로그로 모의 (외부로 보내는 값이 약 이름·보험코드뿐인지 확인)
 *   검색 실패는 실제 서버 경로 (이 검증 서버에는 MFDS_SERVICE_KEY 없음)
 * 실제 휴대폰 카메라 촬영은 사용자가 직접 확인 (여기서는 카메라 입력칸에 사진 파일을 넣어 같은 경로를 검증)
 */
import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import { demoDrugSearch } from "../src/lib/demo/drug-catalog";
import { EXAMPLE_PRESCRIPTION } from "../src/lib/demo/example-prescription";
import { cleanup, menu, patientLogin, provisionMember, provisionPatient, shot, userSession, type VMember, type VPatient } from "./support";

type Files = { png: Buffer; textPdf: Buffer; scanPdf: Buffer };
let files: Files;
let P1: VPatient, P2: VPatient, P3: VPatient, P4: VPatient;
let G: VMember;

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

function prescriptionHtml(): string {
  const p = EXAMPLE_PRESCRIPTION;
  const rows = p.rows
    .map((r) => `<tr><td>${r.edi}</td><td>${r.name}</td><td>${r.dose}</td><td>${r.times}</td><td>${r.days}</td><td>${r.usage}</td></tr>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><body style="margin:40px;font-family:sans-serif;color:#000;background:#fff">
  <h1 style="font-size:40px;text-align:center;letter-spacing:12px">처 방 전</h1>
  <p style="font-size:26px">의료기관 명칭 ${p.clinic}</p><p style="font-size:26px">환자 성명 ${p.patient}</p>
  <table style="border-collapse:collapse;font-size:28px" cellpadding="10" border="1">
  <tr><th>보험코드</th><th>처방 의약품의 명칭</th><th>1회 투약량</th><th>1일 투여횟수</th><th>총 투약일수</th><th>용법</th></tr>${rows}</table>
  <p style="font-size:24px">교부 연월일 ${p.issuedOn}</p></body>`;
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.setContent(prescriptionHtml());
  const png = await page.screenshot({ fullPage: true });
  const textPdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, scale: 0.6 });
  await page.setContent(`<!doctype html><body style="margin:0"><img src="data:image/png;base64,${png.toString("base64")}" style="width:100%"></body>`);
  const scanPdf = await page.pdf({ format: "A4", landscape: true });
  await page.close();
  files = { png, textPdf, scanPdf };

  P1 = await provisionPatient("처방전PDF");
  P2 = await provisionPatient("처방전카메라");
  P3 = await provisionPatient("처방전스캔");
  P4 = await provisionPatient("처방전검색실패");
  G = await provisionMember("처방전보호자", "guardian");
  const sp = await userSession(P1.email, P1.password);
  const inv = await sp.rpc("invite_guardian", { p_patient_id: P1.pid, p_email: G.email, p_scopes: ["medications"] });
  if (inv.error) throw new Error(`초대 실패: ${inv.error.code}`);
  const acc = await (await userSession(G.email, G.password)).rpc("accept_guardian_invitation", { p_token: (inv.data as { token: string }).token });
  if (acc.error) throw new Error(`수락 실패: ${acc.error.code}`);
});

test.afterAll(async () => cleanup());

async function newPage(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  return ctx.newPage();
}

/** 서버 검색 API를 가상 카탈로그로 모의 — 보낸 본문을 기록 */
async function mockSearch(page: Page, sent: unknown[]) {
  await page.route("**/api/medications/search", async (route: Route) => {
    const body = route.request().postDataJSON() as { q?: string; edi?: string };
    sent.push(body);
    const r = await demoDrugSearch(body.edi ? { edi: body.edi } : { q: body.q ?? "" });
    return route.fulfill({ json: r });
  });
}

async function openImport(page: Page) {
  await menu(page, "내 약").click();
  await page.getByRole("button", { name: "처방전 불러오기" }).click();
  return page.getByRole("dialog", { name: "처방전 불러오기" });
}

const meds = async (v: VPatient) =>
  (await (await userSession(v.email, v.password)).from("medications").select("name, dosage, schedule, source, external_item_seq, visible_to_guardian").eq("patient_id", v.pid).order("created_at")).data ?? [];

/** OCR 결과처럼 확인이 필요한 줄은 '직접 입력', 이름이 빈 줄은 빼고 등록 */
async function resolveAndRegister(page: Page) {
  const dlg = page.getByRole("dialog");
  const list = dlg.getByRole("list", { name: "처방전에서 읽은 약" });
  await expect(dlg.getByText("제품 찾는 중")).toHaveCount(0, { timeout: 60_000 });
  const items = list.getByRole("listitem");
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if ((await it.getByText("확인 필요").count()) > 0) await it.getByRole("radio", { name: "후보 사용 안 함 · 직접 입력" }).check();
    if (!(await it.getByLabel("약 이름").inputValue()).trim()) await it.getByRole("checkbox").uncheck();
  }
  const button = dlg.getByRole("button", { name: /선택한 약 \d+개 한 번에 등록/ });
  const count = Number((await button.textContent())!.match(/(\d+)개/)![1]);
  await button.click();
  await expect(dlg.getByText(`약 ${count}개를 등록했어요`)).toBeVisible();
  return count;
}

test("텍스트 PDF(파일 선택): 글자 추출 → 약 5개 → 확인됨·확인 필요·결과 없음 → 후보 선택 → 5개 한 번에 등록, 외부로는 약 이름·보험코드만", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P1);
  const sent: unknown[] = [];
  await mockSearch(page, sent);
  const dlg = await openImport(page);
  await expect(dlg.getByRole("button", { name: "사진 찍기", exact: true })).toBeVisible();
  await dlg.getByLabel("처방전 사진·PDF 파일 선택").setInputFiles({ name: "가상처방전.pdf", mimeType: "application/pdf", buffer: files.textPdf });
  await expect(dlg.getByText("PDF 글자를 읽었어요 · 약 5개 · 확인 필요 2개")).toBeVisible({ timeout: 60_000 });
  const rows = dlg.getByRole("list", { name: "처방전에서 읽은 약" }).getByRole("listitem");
  await expect(rows.nth(0).getByText("확인됨")).toBeVisible();
  await expect(rows.nth(4).getByText("검색 결과 없음 · 직접 입력")).toBeVisible();
  // 비슷한 이름·다른 함량: 함량 일치 표시, 사용자가 선택
  await expect(rows.nth(1).getByRole("radio", { name: "케어가상캡슐20밀리그램 · 가상제약(주)" })).toBeVisible();
  await rows.nth(1).getByRole("radio", { name: "케어가상캡슐10밀리그램 · 가상제약(주)" }).check();
  await rows.nth(3).getByRole("radio", { name: "후보 사용 안 함 · 직접 입력" }).check();
  await rows.nth(4).getByLabel("1회 복용량").fill("얇게 1회");
  await shot(page, "m-rx-review");
  const button = dlg.getByRole("button", { name: "선택한 약 5개 한 번에 등록" });
  await button.click();
  await button.click({ force: true, timeout: 1000 }).catch(() => {}); // 연타
  await expect(page.getByText("약 5개를 등록했어요").or(page.getByText("처방전에서 약 5개를 등록했어요."))).toBeVisible();

  expect(await meds(P1)).toEqual([
    { name: "케어가상정500밀리그램(가상성분)", dosage: "1회 1정", schedule: "하루 3회 · 식후 30분 · 5일분", source: "mfds_permit", external_item_seq: "900000011", visible_to_guardian: false },
    { name: "케어가상캡슐10밀리그램", dosage: "1회 1캡슐", schedule: "하루 2회 · 아침 저녁 식후 · 7일분", source: "mfds_permit", external_item_seq: "900000021", visible_to_guardian: false },
    { name: "케어가상코프시럽(가상성분)", dosage: "1회 10mL", schedule: "하루 3회 · 5일분", source: "mfds_permit", external_item_seq: "900000031", visible_to_guardian: false },
    { name: "케어가상서방정75밀리그램", dosage: "1회 0.5정", schedule: "하루 1회 · 취침 전 · 30일분", source: "manual", external_item_seq: null, visible_to_guardian: false },
    { name: "없는가상연고", dosage: "얇게 1회", schedule: "하루 2회 · 7일분", source: "manual", external_item_seq: null, visible_to_guardian: false },
  ]);
  // 외부(검색)로는 보험코드 또는 약 이름만 — 처방전 원문·환자 정보 없음
  for (const b of sent) {
    expect(Object.keys(b as object)).toHaveLength(1);
    expect(JSON.stringify(b)).not.toMatch(/김하늘|케어가상의원|식후|처 방 전/);
  }
  expect(sent).toContainEqual({ edi: "600000011" });

  // 같은 처방전을 다시 불러오면 이미 등록된 약은 빠짐 (중복 등록 없음)
  if (await dlg.isVisible()) await dlg.getByRole("button", { name: "닫기" }).click();
  const again = await openImport(page);
  await again.getByLabel("처방전 사진·PDF 파일 선택").setInputFiles({ name: "가상처방전.pdf", mimeType: "application/pdf", buffer: files.textPdf });
  await expect(again.getByText("이미 등록된 약").first()).toBeVisible({ timeout: 60_000 });
  await expect(again.getByText("제품 찾는 중")).toHaveCount(0, { timeout: 60_000 });
  await expect(again.getByRole("button", { name: "선택한 약 0개 한 번에 등록" })).toBeDisabled();
  expect(await meds(P1)).toHaveLength(5);
  await page.context().close();
});

test("보호자 공유: 처방전으로 등록한 약은 기본 비공개, 환자가 공개한 약만 보호자에게", async ({ browser }) => {
  const sg = await userSession(G.email, G.password);
  expect((await sg.from("medications").select("name").eq("patient_id", P1.pid)).data).toEqual([]);
  const page = await newPage(browser);
  await patientLogin(page, P1);
  await menu(page, "내 약").click();
  await page.getByRole("region", { name: "케어가상코프시럽(가상성분)" }).getByRole("switch", { name: "보호자에게 공개" }).click();
  await expect(page.getByRole("region", { name: "케어가상코프시럽(가상성분)" }).getByRole("switch", { name: "보호자에게 공개" })).toHaveAttribute("aria-checked", "true");
  expect((await sg.from("medications").select("name").eq("patient_id", P1.pid)).data).toEqual([{ name: "케어가상코프시럽(가상성분)" }]);
  await page.context().close();
});

test("모바일 '사진 찍기'(카메라 입력) → 사진 OCR → 약 목록 → 일괄 등록", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P2);
  await mockSearch(page, []);
  const dlg = await openImport(page);
  const camera = dlg.getByLabel("처방전 사진 찍기");
  await expect(camera).toHaveAttribute("capture", "environment");
  await expect(camera).toHaveAttribute("accept", "image/*");
  await camera.setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: files.png });
  await expect(dlg.getByText(/사진에서 글자를 읽었어요 · 약 \d+개/)).toBeVisible({ timeout: 180_000 });
  const rows = dlg.getByRole("list", { name: "처방전에서 읽은 약" }).getByRole("listitem");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(rows.first().getByLabel("약 이름")).toHaveValue(/케어가상정/);
  const n = await resolveAndRegister(page);
  expect(await meds(P2)).toHaveLength(n);
  await page.context().close();
});

test("스캔 PDF(이미지뿐) → 이미지로 OCR / 사진 파일 선택(PC) → OCR", async ({ browser }) => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await patientLogin(page, P3);
  await mockSearch(page, []);
  let dlg = await openImport(page);
  await dlg.getByLabel("처방전 사진·PDF 파일 선택").setInputFiles({ name: "스캔처방전.pdf", mimeType: "application/pdf", buffer: files.scanPdf });
  await expect(dlg.getByText(/스캔 PDF를 이미지로 읽었어요 · 약 \d+개/)).toBeVisible({ timeout: 180_000 });
  expect(await dlg.getByRole("list", { name: "처방전에서 읽은 약" }).getByRole("listitem").count()).toBeGreaterThanOrEqual(3);
  const n = await resolveAndRegister(page);
  await dlg.getByRole("button", { name: "닫기" }).click();

  dlg = await openImport(page);
  await dlg.getByLabel("처방전 사진·PDF 파일 선택").setInputFiles({ name: "사진.png", mimeType: "image/png", buffer: files.png });
  await expect(dlg.getByText(/사진에서 글자를 읽었어요 · 약 \d+개/)).toBeVisible({ timeout: 180_000 });
  await expect(dlg.getByText("이미 등록된 약").first()).toBeVisible({ timeout: 60_000 }); // 앞에서 등록한 약
  await dlg.getByRole("button", { name: "닫기" }).click();
  expect(await meds(P3)).toHaveLength(n);
  await page.context().close();
});

test("검색 실패(실제 서버 경로, 키 없음) → 직접 입력 → 일괄 등록", async ({ browser }) => {
  const page = await newPage(browser);
  await patientLogin(page, P4);
  const dlg = await openImport(page);
  await dlg.getByLabel("처방전 사진·PDF 파일 선택").setInputFiles({ name: "가상처방전.pdf", mimeType: "application/pdf", buffer: files.textPdf });
  await expect(dlg.getByText("PDF 글자를 읽었어요 · 약 5개")).toBeVisible({ timeout: 60_000 });
  await expect(dlg.getByText("검색 실패 · 직접 입력")).toHaveCount(5, { timeout: 60_000 });
  await expect(dlg.getByText("직접 입력해 저장할 수 있어요").first()).toBeVisible();
  // 약 직접 추가 (처방전에서 못 읽은 약)
  await dlg.getByRole("button", { name: "약 직접 추가" }).click();
  await dlg.getByRole("list", { name: "처방전에서 읽은 약" }).getByRole("listitem").last().getByLabel("약 이름").fill("(가상) 직접 추가한 약");
  await dlg.getByRole("button", { name: "선택한 약 6개 한 번에 등록" }).click();
  await expect(dlg.getByText("약 6개를 등록했어요")).toBeVisible();
  const rows = await meds(P4);
  expect(rows).toHaveLength(6);
  expect(rows.every((r) => r.source === "manual")).toBe(true);
  await page.context().close();
});
