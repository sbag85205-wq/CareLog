/**
 * 브라우저 → 서버 식약처 검색 (/api/medications/search). 서버만 외부 API·키를 사용합니다.
 * 데모(/demo)는 같은 형식의 가상 검색 함수를 주입합니다 (src/lib/demo/drug-catalog.ts).
 */
import { createContext, useContext } from "react";

/** 식약처 의약품 제품 허가정보 (응답에 있는 범위만) */
export interface DrugItem {
  itemSeq: string;
  name: string;
  company: string;
  ingredient: string;
  category: string;
  productType: string;
  /** 약효 분류 원문 (예: "[01140]해열.진통.소염제") */
  classRaw?: string;
  permitDate: string;
  canceled: boolean;
  /** 보험코드 (EDI_CODE, 여러 개면 쉼표) */
  ediCode?: string;
}

export type DrugSearchQuery = { q: string } | { edi: string };
export type DrugSearchResponse = { ok: true; items: DrugItem[]; total: number } | { ok: false; message: string };
export type DrugSearchFn = (query: DrugSearchQuery) => Promise<DrugSearchResponse>;

const FALLBACK = "식약처 검색에 연결하지 못했어요. 약 이름을 직접 입력해 저장할 수 있어요.";

/** 실제 검색 — 검색어(약 이름) 또는 보험코드만 요청 본문으로 보냄 */
export const apiDrugSearch: DrugSearchFn = async (query) => {
  try {
    const res = await fetch("/api/medications/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      credentials: "same-origin",
      cache: "no-store",
    });
    const r = (await res.json()) as { ok: boolean; message?: string; items?: DrugItem[]; total?: number };
    return r.ok ? { ok: true, items: r.items ?? [], total: r.total ?? 0 } : { ok: false, message: r.message ?? FALLBACK };
  } catch {
    return { ok: false, message: FALLBACK };
  }
};

const DrugSearchContext = createContext<DrugSearchFn>(apiDrugSearch);
export const DrugSearchProvider = DrugSearchContext.Provider;
export function useDrugSearch(): DrugSearchFn {
  return useContext(DrugSearchContext);
}

/** 고른 제품의 식약처 주의사항(요약) — 서버만 외부 호출, 품목기준코드만 전송 */
export type DrugCautionFn = (itemSeq: string) => Promise<{ ok: true; caution: string } | { ok: false; message: string }>;

export const apiDrugCaution: DrugCautionFn = async (itemSeq) => {
  try {
    const res = await fetch("/api/medications/caution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSeq }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const r = (await res.json()) as { ok: boolean; caution?: string; message?: string };
    return r.ok ? { ok: true, caution: r.caution ?? "" } : { ok: false, message: r.message ?? "식약처 주의사항을 가져오지 못했어요." };
  } catch {
    return { ok: false, message: "식약처 주의사항을 가져오지 못했어요." };
  }
};

const DrugCautionContext = createContext<DrugCautionFn>(apiDrugCaution);
export const DrugCautionProvider = DrugCautionContext.Provider;
export function useDrugCaution(): DrugCautionFn {
  return useContext(DrugCautionContext);
}

/** 식약처 e약은요 개요 정보 — 서버만 외부 호출, 품목기준코드만 전송 (데모는 가상 함수 주입) */
export interface EasyInfo {
  efficacy: string;
  usage: string;
  beforeUse: string;
  caution: string;
}
export type DrugEasyInfoFn = (itemSeq: string) => Promise<{ ok: true; info: EasyInfo; demo?: boolean } | { ok: false; message: string }>;

export const apiDrugEasyInfo: DrugEasyInfoFn = async (itemSeq) => {
  try {
    const res = await fetch("/api/medications/easy-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSeq }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const r = (await res.json()) as { ok: boolean; info?: EasyInfo; message?: string };
    return r.ok && r.info ? { ok: true, info: r.info } : { ok: false, message: r.message ?? "식약처 개요 정보를 가져오지 못했어요." };
  } catch {
    return { ok: false, message: "식약처 개요 정보를 가져오지 못했어요." };
  }
};

const DrugEasyInfoContext = createContext<DrugEasyInfoFn>(apiDrugEasyInfo);
export const DrugEasyInfoProvider = DrugEasyInfoContext.Provider;
export function useDrugEasyInfo(): DrugEasyInfoFn {
  return useContext(DrugEasyInfoContext);
}
