import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildSearchUrl, cleanIngredient, MFDS_PERMIT_LIST_URL, normalizeDrugQuery, normalizeServiceKey, searchDrugs } = await import("./drug-search");

/** 가상 키 — 실제 키 아님. Decoding 키처럼 + / = 를 포함 */
const FAKE_KEY = "fAkE+key/for==test";

type Call = { url: string };
function fakeFetch(body: unknown, status = 200, calls: Call[] = []) {
  return Object.assign(
    async (url: string | URL) => {
      calls.push({ url: String(url) });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    },
    { calls },
  ) as unknown as typeof fetch & { calls: Call[] };
}

/** 공식 swagger 응답 구조: header + body.items.item + totalCount */
const okBody = (items: unknown, total = 2) => ({
  header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
  body: { pageNo: 1, numOfRows: 20, totalCount: total, items },
});
const ITEM_A = {
  ITEM_SEQ: "200000001",
  ITEM_NAME: "가상정10밀리그램",
  ENTP_NAME: "가상제약(주)",
  ITEM_INGR_NAME: "[M000001]가상성분A|[M000002]가상성분B",
  SPCLTY_PBLC: "전문의약품",
  PRDUCT_TYPE: "[02140]가상 분류",
  ITEM_PERMIT_DATE: "20200101",
  CANCEL_DATE: "",
  CANCEL_NAME: "정상",
};
const ITEM_B = { ...ITEM_A, ITEM_SEQ: "200000002", ENTP_NAME: "다른가상약품", SPCLTY_PBLC: "일반의약품", ITEM_PERMIT_DATE: "20100505" };
const ITEM_OLD = { ...ITEM_A, ITEM_SEQ: "199900003", ITEM_NAME: "가상정10밀리그램(구)", CANCEL_DATE: "20150101", CANCEL_NAME: "취하" };

const errors: string[] = [];
const spy = vi.spyOn(console, "error").mockImplementation((m: string) => void errors.push(String(m)));
afterEach(() => {
  errors.length = 0;
});

describe("요청 만들기 (외부로는 검색어만)", () => {
  it("Decoding 키는 URLSearchParams로 정확히 한 번만 인코딩", () => {
    const url = new URL(buildSearchUrl(FAKE_KEY, "타이레놀"));
    expect(`${url.origin}${url.pathname}`).toBe(MFDS_PERMIT_LIST_URL);
    expect(url.search).toContain("serviceKey=fAkE%2Bkey%2Ffor%3D%3Dtest"); // 1번 인코딩
    expect(url.search).not.toContain("%252B"); // 이중 인코딩 아님
    expect(url.searchParams.get("serviceKey")).toBe(FAKE_KEY); // 서버가 디코딩하면 원래 키
    expect([...url.searchParams.keys()].sort()).toEqual(["item_name", "numOfRows", "pageNo", "serviceKey", "type"]);
    expect(url.searchParams.get("item_name")).toBe("타이레놀");
    expect(url.searchParams.get("type")).toBe("json");
  });
  it("보험코드 조회는 edi_code 만 (item_name 없음), 9자리 숫자만 허용", async () => {
    const url = new URL(buildSearchUrl(FAKE_KEY, { edi: "600000011" }));
    expect(url.searchParams.get("edi_code")).toBe("600000011");
    expect(url.searchParams.has("item_name")).toBe(false);
    const f = fakeFetch(okBody({ item: [{ ...ITEM_A, EDI_CODE: "600000011" }] }, 1));
    const r = await searchDrugs({ edi: "600000011" }, { serviceKey: FAKE_KEY, fetch: f });
    expect(r.ok && r.items[0].ediCode).toBe("600000011");
    expect(new URL(f.calls[0].url).searchParams.get("edi_code")).toBe("600000011");
    expect(await searchDrugs({ edi: "60000001" }, { serviceKey: FAKE_KEY, fetch: f })).toEqual({ ok: false, reason: "bad_query" });
  });
  it("실수로 Encoding 키를 넣어도 이중 인코딩하지 않음", () => {
    expect(normalizeServiceKey("fAkE%2Bkey%2Ffor%3D%3Dtest")).toBe(FAKE_KEY);
    expect(normalizeServiceKey(` ${FAKE_KEY} `)).toBe(FAKE_KEY);
  });
  it("검색어 2~40자, 공백·제어문자 정리", () => {
    expect(normalizeDrugQuery("  타이레놀\n ")).toBe("타이레놀");
    expect(normalizeDrugQuery("a")).toBeNull();
    expect(normalizeDrugQuery("가".repeat(41))).toBeNull();
    expect(normalizeDrugQuery(123)).toBeNull();
  });
  it("주성분 코드 표시 정리", () => {
    expect(cleanIngredient("[M000001]가상성분A|[M000002]가상성분B")).toBe("가상성분A, 가상성분B");
    expect(cleanIngredient(undefined)).toBe("");
  });
});

describe("검색 결과", () => {
  it("성공: 제품명·제조사·주성분·전문/일반 — 비슷한 이름은 업체·품목기준코드로 구분, 허가 유지 제품 먼저", async () => {
    const f = fakeFetch(okBody({ item: [ITEM_OLD, ITEM_B, ITEM_A] }, 3));
    const r = await searchDrugs("가상정", { serviceKey: FAKE_KEY, fetch: f });
    expect(r.ok && r.total).toBe(3);
    if (!r.ok) throw new Error();
    expect(r.items.map((i) => [i.name, i.company, i.itemSeq, i.canceled])).toEqual([
      ["가상정10밀리그램", "가상제약(주)", "200000001", false],
      ["가상정10밀리그램", "다른가상약품", "200000002", false],
      ["가상정10밀리그램(구)", "가상제약(주)", "199900003", true],
    ]);
    expect(r.items[0]).toMatchObject({ ingredient: "가상성분A, 가상성분B", category: "전문의약품", productType: "가상 분류", permitDate: "20200101" });
    expect(r.items[1].category).toBe("일반의약품");
  });
  it("items 가 배열·단일 객체로 와도 처리", async () => {
    for (const items of [[ITEM_A], { item: ITEM_A }]) {
      const r = await searchDrugs("가상정", { serviceKey: FAKE_KEY, fetch: fakeFetch(okBody(items, 1)) });
      expect(r.ok && r.items.length).toBe(1);
    }
  });
  it("결과 없음: totalCount 0 / resultCode 03", async () => {
    for (const body of [okBody("", 0), { header: { resultCode: "03", resultMsg: "NODATA_ERROR" }, body: {} }]) {
      expect(await searchDrugs("없는약이름", { serviceKey: FAKE_KEY, fetch: fakeFetch(body) })).toEqual({ ok: true, items: [], total: 0 });
    }
  });
  it("API 오류: 게이트웨이(XML·JSON)·HTTP 500·네트워크·시간 초과 → upstream, 로그에 키·검색어 없음", async () => {
    const gwXml = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    const gwJson = { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE ERROR", returnReasonCode: "30" } } };
    const cases: (typeof fetch)[] = [
      fakeFetch(gwXml),
      fakeFetch(gwJson),
      fakeFetch({ header: { resultCode: "99", resultMsg: "UNKNOWN" } }, 500),
      (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
      ((_u: string, init: RequestInit) =>
        new Promise((_, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch,
    ];
    for (const f of cases) {
      expect(await searchDrugs("가상정검색어", { serviceKey: FAKE_KEY, fetch: f, timeoutMs: 20 })).toEqual({ ok: false, reason: "upstream" });
    }
    expect(errors.length).toBe(cases.length);
    for (const line of errors) {
      expect(line).not.toContain("가상정검색어");
      expect(line).not.toContain("fAkE");
      expect(line).not.toContain("apis.data.go.kr");
    }
    expect(errors[0]).toContain("code=30");
  });
  it("키 미설정·잘못된 검색어는 외부 호출 없이 거부", async () => {
    const f = fakeFetch(okBody([ITEM_A]));
    expect(await searchDrugs("가상정", { serviceKey: "", fetch: f })).toEqual({ ok: false, reason: "not_configured" });
    expect(await searchDrugs("a", { serviceKey: FAKE_KEY, fetch: f })).toEqual({ ok: false, reason: "bad_query" });
    expect(f.calls).toHaveLength(0);
  });
});

void spy;
