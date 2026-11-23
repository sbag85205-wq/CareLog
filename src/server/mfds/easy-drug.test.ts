import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getEasyDrugInfo, cleanEasyText, MFDS_EASY_URL } = await import("./easy-drug");

const ok = (items: unknown) => async () => new Response(JSON.stringify({ header: { resultCode: "00" }, body: { items } }), { status: 200 });

describe("식약처 e약은요 (가상 응답)", () => {
  it("품목기준코드만 보내고, 같은 코드의 항목만 사용", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return ok([
        { itemSeq: "900000999", itemName: "다른 제품", efcyQesitm: "다른 효능" },
        {
          itemSeq: "900000101",
          itemName: "가상진통정",
          entpName: "가상제약",
          efcyQesitm: "<p>두통에 사용합니다.</p>",
          useMethodQesitm: "1회 1정",
          atpnWarnQesitm: "",
          atpnQesitm: "과량 복용 주의",
        },
      ])();
    }) as unknown as typeof fetch;
    const r = await getEasyDrugInfo("900000101", { serviceKey: "k", fetch: fetchFn });
    expect(r).toEqual({
      ok: true,
      info: {
        itemSeq: "900000101",
        name: "가상진통정",
        company: "가상제약",
        efficacy: "두통에 사용합니다.",
        usage: "1회 1정",
        beforeUse: "",
        caution: "과량 복용 주의",
      },
    });
    const u = new URL(calls[0]);
    expect(`${u.origin}${u.pathname}`).toBe(MFDS_EASY_URL);
    expect([...u.searchParams.keys()].sort()).toEqual(["itemSeq", "numOfRows", "pageNo", "serviceKey", "type"]);
  });

  it("응답에 요청한 제품이 없으면 not_found (다른 제품 정보를 쓰지 않음)", async () => {
    const r = await getEasyDrugInfo("900000101", { serviceKey: "k", fetch: ok([{ itemSeq: "900000999", efcyQesitm: "x" }]) as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("코드 형식이 아니면 외부 호출 없이 거부, 키가 없으면 not_configured", async () => {
    const fetchFn = vi.fn();
    expect(await getEasyDrugInfo("타이레놀", { serviceKey: "k", fetch: fetchFn as unknown as typeof fetch })).toEqual({ ok: false, reason: "bad_query" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getEasyDrugInfo("900000101", { serviceKey: "" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("태그·공백 정리", () => {
    expect(cleanEasyText("<p>a&nbsp; b</p>\n c")).toBe("a b c");
  });
});
