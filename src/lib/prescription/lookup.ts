/**
 * 처방전 한 줄 → 식약처 제품 후보 조회 (기존 서버 검색 재사용, 외부로는 보험코드 또는 약 이름만)
 * 순서: 보험코드(명확히 읽힌 경우) → 약 이름 → 함량을 뺀 이름(비슷한 제품·다른 함량까지)
 */
import type { DrugSearchFn } from "@/lib/drug-search-client";
import { evaluateCandidates, type MatchResult } from "./match";
import { baseName, searchName, type ParsedDrug } from "./parse";

export async function lookupDrug(p: ParsedDrug, search: DrugSearchFn): Promise<MatchResult> {
  if (p.ediCode) {
    const r = await search({ edi: p.ediCode });
    if (!r.ok) return { status: "search_failed", candidates: [], message: r.message };
    const m = evaluateCandidates(p, r.items, "edi");
    if (m.status !== "not_found") return m;
  }
  const name = searchName(p.name);
  if (name.length < 2) return { status: "not_found", candidates: [] };
  let r = await search({ q: name });
  if (!r.ok) return { status: "search_failed", candidates: [], message: r.message };
  let m = evaluateCandidates(p, r.items, "name");
  const base = baseName(p.name);
  if (m.status === "not_found" && base.length >= 2 && base !== name) {
    r = await search({ q: base });
    if (!r.ok) return { status: "search_failed", candidates: [], message: r.message };
    m = evaluateCandidates(p, r.items, "name");
    if (m.status === "confirmed") m = { ...m, status: "review", selected: undefined }; // 이름이 정확히 같지 않음 → 사용자 확인
  }
  return m;
}
