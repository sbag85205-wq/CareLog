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
