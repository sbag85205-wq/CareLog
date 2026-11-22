/**
 * 처방전 한 줄 ↔ 식약처 제품 후보 맞추기
 * - 보험코드로 1개만 나오면 "확인됨" (코드가 정확히 읽힌 경우)
 * - 이름으로 1개만 나오고 함량·제형이 맞으면 "확인됨"
 * - 후보가 여럿이거나 함량·제형이 다르면 "확인 필요" → 사용자가 고르거나 직접 입력
 * - 결과 없음 → "직접 입력", 검색 실패 → "검색 실패 · 직접 입력"
 */
import type { DrugItem } from "@/lib/drug-search-client";
import { detectForm, normalizeStrength, searchName, type ParsedDrug } from "./parse";

export type MatchStatus = "confirmed" | "review" | "not_found" | "search_failed";

export interface Candidate {
  item: DrugItem;
  /** 처방전 함량과 같은지 (처방전·제품 중 하나라도 함량을 알 수 없으면 null) */
  strengthMatch: boolean | null;
  formMatch: boolean | null;
}

export interface MatchResult {
  status: MatchStatus;
  candidates: Candidate[];
  /** 확인됨일 때 자동 선택된 품목기준코드 */
  selected?: string;
  via?: "edi" | "name";
  message?: string;
}

const num = (s?: string) => (s ? s.replace(/[^\d.a-zA-Z%]/g, "").toLowerCase() : undefined);

export function annotate(parsed: Pick<ParsedDrug, "strength" | "form">, item: DrugItem): Candidate {
  const s = normalizeStrength(item.name);
  const f = detectForm(item.name);
  return {
    item,
    strengthMatch: parsed.strength && s ? num(parsed.strength) === num(s) : null,
    formMatch: parsed.form && f ? parsed.form === f : null,
  };
}

export function evaluateCandidates(parsed: ParsedDrug, items: DrugItem[], via: "edi" | "name"): MatchResult {
  const candidates = items
    .map((it) => annotate(parsed, it))
    // 허가 유지 → 함량 일치 → 제형 일치 순
    .sort(
      (a, b) =>
        Number(a.item.canceled) - Number(b.item.canceled) ||
        Number(b.strengthMatch === true) - Number(a.strengthMatch === true) ||
        Number(b.formMatch === true) - Number(a.formMatch === true),
    );
  const active = candidates.filter((c) => !c.item.canceled);
  if (candidates.length === 0) return { status: "not_found", candidates, via };
  if (active.length === 1) {
    const c = active[0];
    const sameName = searchName(c.item.name) === searchName(parsed.name);
    const ok = c.strengthMatch !== false && c.formMatch !== false && (via === "edi" || c.strengthMatch === true || sameName);
    if (ok) return { status: "confirmed", candidates, selected: c.item.itemSeq, via };
  }
  return { status: "review", candidates, via };
}
