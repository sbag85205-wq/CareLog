import "server-only";

/**
 * 식품의약품안전처_의약품개요정보(e약은요) — 공공데이터포털 15075057
 * 오퍼레이션 getDrbEasyDrugList, 품목기준코드(itemSeq)로만 조회
 *
 * - 외부로 보내는 값: serviceKey, type, pageNo, numOfRows, itemSeq — 사용자 정보·메모 없음
 * - 응답 품목기준코드가 요청과 같을 때만 사용 (다른 제품의 정보를 가져오지 않음)
 * - e약은요에 없는 제품(전문의약품 등)은 not_found — 화면은 '공식 개요 정보 없음'으로 표시
 * - 같은 MFDS_SERVICE_KEY 를 쓰지만 공공데이터포털에서 이 API 활용 신청이 별도로 필요
 */
import { normalizeServiceKey } from "./drug-search";

export const MFDS_EASY_URL = "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";

export interface EasyDrugInfo {
  itemSeq: string;
  name: string;
  company: string;
  /** 이 약의 효능은 무엇입니까? */
  efficacy: string;
  /** 이 약은 어떻게 사용합니까? */
  usage: string;
  /** 이 약을 사용하기 전에 반드시 알아야 할 내용은 무엇입니까? */
  beforeUse: string;
  /** 이 약의 사용상 주의사항은 무엇입니까? */
  caution: string;
}

export type EasyDrugResult = { ok: true; info: EasyDrugInfo } | { ok: false; reason: "not_configured" | "bad_query" | "upstream" | "not_found" };

/** 공식 문장 정리: 태그 제거, 공백 정리, 길이 제한 */
export function cleanEasyText(v: unknown, max = 600): string {
  const t = (typeof v === "string" ? v : "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

export async function getEasyDrugInfo(itemSeq: unknown, deps: { serviceKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<EasyDrugResult> {
  const seq = typeof itemSeq === "string" && /^[0-9]{6,12}$/.test(itemSeq) ? itemSeq : null;
  if (!seq) return { ok: false, reason: "bad_query" };
  const key = normalizeServiceKey(deps.serviceKey ?? process.env.MFDS_SERVICE_KEY);
  if (!key) return { ok: false, reason: "not_configured" };
  const params = new URLSearchParams({ serviceKey: key, type: "json", pageNo: "1", numOfRows: "3", itemSeq: seq });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8000);
  try {
    const res = await (deps.fetch ?? fetch)(`${MFDS_EASY_URL}?${params.toString()}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: { header?: { resultCode?: string }; body?: { items?: unknown } };
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[mfds] e약은요 조회 실패: HTTP ${res.status} code=${text.match(/<returnReasonCode>([^<]*)/)?.[1] ?? "non-json"}`);
      return { ok: false, reason: "upstream" };
    }
    const code = String(data.header?.resultCode ?? "");
    if (code === "03") return { ok: false, reason: "not_found" };
    if (!res.ok || code !== "00") {
      console.error(`[mfds] e약은요 조회 실패: HTTP ${res.status} resultCode=${code || "-"}`);
      return { ok: false, reason: "upstream" };
    }
    const raw = data.body?.items;
    const list = (Array.isArray(raw) ? raw : raw && typeof raw === "object" && "item" in raw ? [(raw as { item: unknown }).item].flat() : []) as Record<
      string,
      unknown
    >[];
    // 요청한 제품과 품목기준코드가 정확히 같은 항목만
    const item = list.find((x) => String(x.itemSeq ?? "").trim() === seq);
    if (!item) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      info: {
        itemSeq: seq,
        name: cleanEasyText(item.itemName, 120),
        company: cleanEasyText(item.entpName, 60),
        efficacy: cleanEasyText(item.efcyQesitm),
        usage: cleanEasyText(item.useMethodQesitm),
        beforeUse: cleanEasyText(item.atpnWarnQesitm),
        caution: cleanEasyText(item.atpnQesitm),
      },
    };
  } catch (e) {
    console.error(`[mfds] e약은요 조회 실패: ${e instanceof Error && e.name === "AbortError" ? "timeout" : "network"}`);
    return { ok: false, reason: "upstream" };
  } finally {
    clearTimeout(timer);
  }
}
