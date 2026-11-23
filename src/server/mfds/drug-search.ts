import "server-only";

/**
 * 식품의약품안전처_의약품 제품 허가정보 (공공데이터포털 15095677)
 * 오퍼레이션: 의약품 제품 허가 목록 getDrugPrdtPrmsnInq08 — 품목명(item_name)으로 검색
 * 공식 문서(포털에 포함된 swagger 2.0)의 요청 변수·응답 필드만 사용합니다.
 *
 * 보안
 * - 서버에서만 호출. 키는 MFDS_SERVICE_KEY(공공데이터포털 "Decoding" 키)를 URLSearchParams로 한 번만 인코딩
 * - 외부로 보내는 값: serviceKey, type, pageNo, numOfRows, item_name(검색어) — 환자 정보 없음
 * - 검색어·키·요청 URL은 로그에 남기지 않음 (상태·결과 코드만)
 */
export const MFDS_PERMIT_LIST_URL = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnInq08";

export interface DrugSearchItem {
  /** 품목기준코드 (ITEM_SEQ) */
  itemSeq: string;
  /** 품목명 (ITEM_NAME) */
  name: string;
  /** 업체명 (ENTP_NAME) */
  company: string;
  /** 주성분 (ITEM_INGR_NAME) — 응답에 있는 경우만 */
  ingredient: string;
  /** 전문/일반구분 (SPCLTY_PBLC) */
  category: string;
  /** 분류명 (PRDUCT_TYPE) */
  productType: string;
  /** 품목허가일자 (ITEM_PERMIT_DATE, YYYYMMDD) */
  permitDate: string;
  /** 취하 여부 (CANCEL_DATE·CANCEL_NAME) */
  canceled: boolean;
  /** 보험코드 (EDI_CODE) — 응답에 있는 경우만 */
  ediCode: string;
}

export type DrugSearchResult =
  | { ok: true; items: DrugSearchItem[]; total: number }
  | { ok: false; reason: "not_configured" | "bad_query" | "upstream" };

export const SEARCH_LIMIT = 20;

/** 검색어 정리: 앞뒤 공백·제어문자 제거, 2~40자 */
export function normalizeDrugQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const s = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= 2 && s.length <= 40 ? s : null;
}

/**
 * Decoding 키를 그대로 쓰되, 실수로 Encoding 키(%2B 등)를 넣은 경우 한 번 디코딩해서
 * URLSearchParams가 다시 인코딩할 때 이중 인코딩되지 않게 함
 */
export function normalizeServiceKey(raw: string | undefined): string {
  const k = (raw ?? "").trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try {
      return decodeURIComponent(k);
    } catch {
      return k;
    }
  }
  return k;
}

/** 보험코드: 9자리 숫자만 (처방전에서 명확히 읽힌 경우) */
export function normalizeEdi(v: unknown): string | null {
  return typeof v === "string" && /^\d{9}$/.test(v.trim()) ? v.trim() : null;
}

/** 검색 조건은 품목명(item_name) 또는 보험코드(edi_code) 중 하나만 보냄 */
export function buildSearchUrl(serviceKey: string, query: string | { edi: string }): string {
  const params = new URLSearchParams({
    serviceKey, // Decoding 키 → URLSearchParams가 한 번만 인코딩
    type: "json",
    pageNo: "1",
    numOfRows: String(SEARCH_LIMIT),
  });
  if (typeof query === "string") params.set("item_name", query);
  else params.set("edi_code", query.edi);
  return `${MFDS_PERMIT_LIST_URL}?${params.toString()}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** 주성분 문자열 정리: "[M040702]포도당|[M040532]염화나트륨" → "포도당, 염화나트륨" */
export function cleanIngredient(v: unknown): string {
  return str(v)
    .split(/[|;]/)
    .map((x) => x.replace(/^\s*\[[^\]]*\]\s*/, "").trim())
    .filter(Boolean)
    .join(", ");
}

function toItem(raw: Record<string, unknown>): DrugSearchItem | null {
  const itemSeq = str(raw.ITEM_SEQ);
  const name = str(raw.ITEM_NAME);
  if (!name) return null;
  return {
    itemSeq: /^[0-9]{6,12}$/.test(itemSeq) ? itemSeq : "",
    name,
    company: str(raw.ENTP_NAME),
    ingredient: cleanIngredient(raw.ITEM_INGR_NAME),
    category: str(raw.SPCLTY_PBLC),
    productType: str(raw.PRDUCT_TYPE).replace(/^\s*\[[^\]]*\]\s*/, ""),
    permitDate: str(raw.ITEM_PERMIT_DATE),
    canceled: Boolean(str(raw.CANCEL_DATE)) || /취하|취소/.test(str(raw.CANCEL_NAME)),
    ediCode: str(raw.EDI_CODE),
  };
}

/** body.items 는 배열·{ item: 배열 }·{ item: 객체 }·"" 로 올 수 있어 모두 처리 */
function extractItems(items: unknown): Record<string, unknown>[] {
  if (Array.isArray(items)) return items as Record<string, unknown>[];
  if (items && typeof items === "object") {
    const it = (items as { item?: unknown }).item;
    if (Array.isArray(it)) return it as Record<string, unknown>[];
    if (it && typeof it === "object") return [it as Record<string, unknown>];
  }
  return [];
}

/**
 * @param query 약 이름(문자열) 또는 { edi: 보험코드 9자리 }
 */
export async function searchDrugs(
  query: unknown,
  deps: { serviceKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<DrugSearchResult> {
  const edi = query && typeof query === "object" ? normalizeEdi((query as { edi?: unknown }).edi) : null;
  const q = edi ? { edi } : normalizeDrugQuery(query);
  if (!q) return { ok: false, reason: "bad_query" };
  const key = normalizeServiceKey(deps.serviceKey ?? process.env.MFDS_SERVICE_KEY);
  if (!key) return { ok: false, reason: "not_configured" };

  const doFetch = deps.fetch ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8000);
  try {
    const res = await doFetch(buildSearchUrl(key, q), { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // 게이트웨이 오류는 XML(OpenAPI_ServiceResponse)로 올 수 있음 — 코드만 기록
      const code = text.match(/<returnReasonCode>([^<]*)/)?.[1] ?? text.match(/<resultCode>([^<]*)/)?.[1] ?? "non-json";
      console.error(`[mfds] 허가정보 검색 실패: HTTP ${res.status} code=${code}`);
      return { ok: false, reason: "upstream" };
    }
    const gw = (data as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; errMsg?: string } } }).OpenAPI_ServiceResponse;
    if (gw) {
      console.error(`[mfds] 허가정보 검색 실패: HTTP ${res.status} gateway=${gw.cmmMsgHeader?.returnReasonCode ?? ""} ${gw.cmmMsgHeader?.errMsg ?? ""}`);
      return { ok: false, reason: "upstream" };
    }
    const d = data as { header?: { resultCode?: string }; body?: { items?: unknown; totalCount?: number | string } };
    const code = str(d.header?.resultCode);
    if (code === "03") return { ok: true, items: [], total: 0 }; // NODATA_ERROR
    if (!res.ok || code !== "00") {
      console.error(`[mfds] 허가정보 검색 실패: HTTP ${res.status} resultCode=${code || "-"}`);
      return { ok: false, reason: "upstream" };
    }
    const items = extractItems(d.body?.items)
      .map(toItem)
      .filter((x): x is DrugSearchItem => x !== null)
      // 허가 유지 제품 먼저, 이름 → 업체 → 품목기준코드 순 (같은 이름도 순서 고정)
      .sort(
        (a, b) =>
          Number(a.canceled) - Number(b.canceled) ||
          a.name.localeCompare(b.name, "ko") ||
          a.company.localeCompare(b.company, "ko") ||
          a.itemSeq.localeCompare(b.itemSeq),
      );
    return { ok: true, items, total: Number(d.body?.totalCount ?? items.length) || items.length };
  } catch (e) {
    console.error(`[mfds] 허가정보 검색 실패: ${e instanceof Error && e.name === "AbortError" ? "timeout" : "network"}`);
    return { ok: false, reason: "upstream" };
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────── 제품 상세(주의사항) — 의약품 제품 허가 상세정보 getDrugPrdtPrmsnDtlInq08 ───────────── */

export const MFDS_PERMIT_DETAIL_URL = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08";

export type DrugCautionResult =
  | { ok: true; itemSeq: string; name: string; caution: string }
  | { ok: false; reason: "not_configured" | "bad_query" | "upstream" | "not_found" };

/** 주의사항 문서(XML 문자열) → 짧은 요약: 조항 제목 위주, 태그 제거, 최대 약 400자 */
export function summarizeCautionDoc(doc: unknown, max = 400): string {
  const xml = typeof doc === "string" ? doc : "";
  if (!xml.trim()) return "";
  const parts: string[] = [];
  const re = /<ARTICLE[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/ARTICLE>|<PARAGRAPH[^>]*>([\s\S]*?)<\/PARAGRAPH>/gi;
  for (const m of xml.matchAll(re)) {
    const title = (m[1] ?? "").trim();
    const body = (m[2] ?? m[3] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const line = title ? (body ? `${title}: ${body}` : title) : body;
    if (line) parts.push(line);
  }
  const text = (parts.length ? parts.join(" / ") : xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

export async function getDrugCaution(
  itemSeq: unknown,
  deps: { serviceKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<DrugCautionResult> {
  const seq = typeof itemSeq === "string" && /^[0-9]{6,12}$/.test(itemSeq) ? itemSeq : null;
  if (!seq) return { ok: false, reason: "bad_query" };
  const key = normalizeServiceKey(deps.serviceKey ?? process.env.MFDS_SERVICE_KEY);
  if (!key) return { ok: false, reason: "not_configured" };
  const params = new URLSearchParams({ serviceKey: key, type: "json", pageNo: "1", numOfRows: "1", item_seq: seq }); // 품목기준코드만
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 8000);
  try {
    const res = await (deps.fetch ?? fetch)(`${MFDS_PERMIT_DETAIL_URL}?${params.toString()}`, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    const text = await res.text();
    let data: { header?: { resultCode?: string }; body?: { items?: unknown }; OpenAPI_ServiceResponse?: unknown };
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[mfds] 제품 상세 조회 실패: HTTP ${res.status} code=${text.match(/<returnReasonCode>([^<]*)/)?.[1] ?? "non-json"}`);
      return { ok: false, reason: "upstream" };
    }
    if (data.OpenAPI_ServiceResponse || !res.ok) {
      console.error(`[mfds] 제품 상세 조회 실패: HTTP ${res.status} gateway`);
      return { ok: false, reason: "upstream" };
    }
    const code = String(data.header?.resultCode ?? "");
    if (code === "03") return { ok: false, reason: "not_found" };
    if (code !== "00") {
      console.error(`[mfds] 제품 상세 조회 실패: resultCode=${code || "-"}`);
      return { ok: false, reason: "upstream" };
    }
    const item = extractItems(data.body?.items)[0];
    if (!item) return { ok: false, reason: "not_found" };
    return { ok: true, itemSeq: seq, name: String(item.ITEM_NAME ?? ""), caution: summarizeCautionDoc(item.NB_DOC_DATA) };
  } catch (e) {
    console.error(`[mfds] 제품 상세 조회 실패: ${e instanceof Error && e.name === "AbortError" ? "timeout" : "network"}`);
    return { ok: false, reason: "upstream" };
  } finally {
    clearTimeout(timer);
  }
}
